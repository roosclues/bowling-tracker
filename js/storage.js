// All data lives in one JSON document in localStorage.
//
// db = {
//   version: 1,
//   settings: { hand: 'R'|'L', last: {center, ball, oil}, sessionsSinceBackup, lastBackup, keepAwake, haptics,
//               skin: 'minimal'|'classic', seenVersion, quick,
//               goals: [{ key, target, reachedOn, reachedGame }] },
//   sessions: [{ id, date, center, lane, ball, oil, notes,
//                games: [{ id, frames: [[shot, ...] x10], done, score }] }],
//   practice: [{ id, date, leave: [pins], made, feet, target }]   (spare practice tries)
// }
// shot = { standing: [pins], feet, target, breakpoint, hit, speed, tags: [], note }

import { scoreGame, knocked } from './scoring.js';
import { normalizeDB } from './normalize.js';
import { goalsCrossed } from './stats.js';
import { todayISO, uid } from './util.js';

const KEY = 'bowltrack.v1';
const PREV_KEY = `${KEY}.before-restore`;

function emptyDB() {
  return normalizeDB({ sessions: [] });
}

// Set when saved data existed but couldn't be read; the raw text is kept under another key.
export let loadProblem = null;

function load() {
  let raw = null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    return emptyDB();
  }
  if (!raw) return emptyDB();
  try {
    return normalizeDB(JSON.parse(raw));
  } catch (e) {
    const keptAs = `${KEY}.unreadable-${Date.now()}`;
    try { localStorage.setItem(keptAs, raw); } catch { /* storage full */ }
    loadProblem = { message: e.message, keptAs };
    return emptyDB();
  }
}

export const db = load();

export function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(db));
    return true;
  } catch (e) {
    alert('Could not save your data: ' + e.message + '\nPlease make a backup from Settings.');
    return false;
  }
}

// Another copy of the app (e.g. the installed app and a browser tab) saved: pick up its data
// so this copy doesn't overwrite it on its next save.
const changeListeners = [];
export function onExternalChange(fn) {
  changeListeners.push(fn);
}
window.addEventListener('storage', (e) => {
  if (e.key !== KEY || e.newValue == null) return;
  try {
    Object.assign(db, normalizeDB(JSON.parse(e.newValue)));
    changeListeners.forEach((fn) => fn());
  } catch { /* ignore unreadable writes */ }
});

export async function requestPersist() {
  try {
    if (navigator.storage?.persist) return await navigator.storage.persist();
  } catch { /* not supported */ }
  return false;
}

export function findSession(id) {
  return db.sessions.find((s) => s.id === id);
}

export function findGame(sid, gid) {
  return findSession(sid)?.games.find((g) => g.id === gid);
}

// The most recent unfinished game, if any.
export function currentGame() {
  for (let i = db.sessions.length - 1; i >= 0; i--) {
    const s = db.sessions[i];
    const g = s.games.find((x) => !x.done);
    if (g) return { session: s, game: g };
  }
  return null;
}

export function newGame() {
  return { id: uid(), frames: Array.from({ length: 10 }, () => []), done: false, score: 0 };
}

export function refreshScore(game) {
  game.score = scoreGame(game.frames).total;
}

// Marks the goals that finishing `game` took from not met to met, so its summary can say so.
// reachedOn keeps the date the goal was first reached. The caller saves.
export function stampReachedGoals(session, game) {
  for (const goal of goalsCrossed(db.sessions, db.settings.goals, game)) {
    goal.reachedGame = game.id;
    goal.reachedOn ??= session.date;
  }
}

// Takes back what stampReachedGoals credited to `game`, when it is reopened or deleted.
// The caller saves.
export function unstampGoals(game) {
  for (const goal of db.settings.goals) {
    if (goal.reachedGame !== game.id) continue;
    goal.reachedGame = null;
    goal.reachedOn = null;
  }
}

// ---------- Backup / restore / export ----------

const BACKUP_EVERY_SESSIONS = 5;
const BACKUP_EVERY_DAYS = 14;

// Null when the backup is recent enough; otherwise { sessions, days, never } for the reminder.
export function backupDue() {
  const sessions = db.settings.sessionsSinceBackup || 0;
  if (!sessions) return null;
  const since = db.settings.lastBackup ?? db.sessions[0]?.date;
  const days = since ? Math.max(0, Math.floor((Date.parse(todayISO()) - Date.parse(since)) / 864e5)) : 0;
  if (sessions < BACKUP_EVERY_SESSIONS && days < BACKUP_EVERY_DAYS) return null;
  return { sessions, days, never: !db.settings.lastBackup };
}

function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

// Share sheet (Drive, Gmail, etc.) when asked and supported, otherwise a plain download.
// Returns false only when the person closed the share sheet without sending.
async function deliver(blob, filename, share) {
  const file = new File([blob], filename, { type: blob.type });
  if (share && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: filename });
      return true;
    } catch (e) {
      if (e.name === 'AbortError') return false;
    }
  }
  download(blob, filename);
  return true;
}

// Android only shares some file types (not .json), so backups are shared as .txt.
export function canShareFiles(type = 'text/plain', name = 'x.txt') {
  try {
    return !!navigator.canShare?.({ files: [new File(['x'], name, { type })] });
  } catch {
    return false;
  }
}

export async function downloadBackup({ share = false } = {}) {
  const stamp = todayISO();
  // The file itself records this backup, so restoring it doesn't bring back an old reminder.
  const snapshot = { ...db, settings: { ...db.settings, sessionsSinceBackup: 0, lastBackup: stamp } };
  const text = JSON.stringify(snapshot, null, 1);
  const sent = share
    ? await deliver(new Blob([text], { type: 'text/plain' }), `bowling-backup-${stamp}.txt`, true)
    : await deliver(new Blob([text], { type: 'application/json' }), `bowling-backup-${stamp}.json`, false);
  if (!sent) return false;
  db.settings.sessionsSinceBackup = 0;
  db.settings.lastBackup = stamp;
  save();
  return true;
}

// Replaces all data with the backup. The data it replaces is kept so the restore can be undone.
export function restoreBackup(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('This file is not a Bowling Tracker backup.');
  }
  const clean = normalizeDB(data);
  try { localStorage.setItem(PREV_KEY, JSON.stringify(db)); } catch { /* storage full */ }
  Object.assign(db, clean);
  save();
  return clean.sessions.length;
}

export function canUndoRestore() {
  try {
    return !!localStorage.getItem(PREV_KEY);
  } catch {
    return false;
  }
}

export function undoRestore() {
  const prev = localStorage.getItem(PREV_KEY);
  if (!prev) return false;
  Object.assign(db, normalizeDB(JSON.parse(prev)));
  save();
  localStorage.removeItem(PREV_KEY);
  return true;
}

export function wipeAll() {
  Object.assign(db, emptyDB());
  save();
}

function csvCell(v) {
  let s = String(v ?? '');
  if (/^[=+@]/.test(s)) s = `'${s}`; // keep spreadsheets from treating text as a formula
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function exportCSV({ share = false } = {}) {
  const header = ['date', 'center', 'lane', 'ball', 'oil', 'game', 'game_score', 'frame', 'ball_in_frame',
    'pins_down', 'pins_left', 'feet_board', 'arrow_board', 'breakpoint_board', 'pin_hit', 'speed', 'tags', 'note', 'session_notes'];
  const rows = [header];
  for (const s of db.sessions) {
    s.games.forEach((g, gi) => {
      g.frames.forEach((shots, fi) => {
        const k = knocked(shots);
        shots.forEach((shot, si) => {
          rows.push([s.date, s.center, s.lane, s.ball, s.oil, gi + 1, g.score, fi + 1, si + 1, k[si],
            shot.standing.join(' '), shot.feet, shot.target, shot.breakpoint, shot.hit, shot.speed,
            (shot.tags || []).join('; '), shot.note, s.notes]);
        });
      });
    });
  }
  // Spare practice tries follow, with "practice" in the game column.
  for (const p of db.practice) {
    rows.push([p.date, '', '', '', '', 'practice', '', '', 2, p.made ? p.leave.length : '',
      p.made ? '' : p.leave.join(' '), p.feet, p.target, '', '', '', '', '', '']);
  }
  const text = rows.map((r) => r.map(csvCell).join(',')).join('\r\n');
  await deliver(new Blob(['﻿' + text], { type: 'text/csv' }), `bowling-shots-${todayISO()}.csv`, share);
}
