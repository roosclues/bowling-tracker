// Checks and repairs a stored or restored database so the screens can trust its shape.
// Anything untrustworthy (bad ids, out-of-range numbers, impossible pins) is dropped or
// recomputed here instead of reaching the UI. Scores and "done" are always recomputed.

import { frameDone, pinsBefore, scoreGame, gameDone, ALL_PINS } from './scoring.js';
import { GOAL_TYPES } from './stats.js';
import { HITS } from './terms.js';
import { uid, todayISO } from './util.js';

const ID = /^\w{1,40}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const HIT_KEYS = new Set(HITS.map((h) => h.key));
// App themes; the first is the default.
export const SKINS = ['minimal', 'classic'];

const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const int = (v, min, max) => (Number.isInteger(v) && v >= min && v <= max ? v : null);
const num = (v, min, max) => (typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? v : null);
const text = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '');
const date = (v) => (typeof v === 'string' && DATE.test(v) ? v : null);

function freshId(id, seen) {
  const out = typeof id === 'string' && ID.test(id) && !seen.has(id) ? id : uid();
  seen.add(out);
  return out;
}

function normShot(raw, before) {
  const r = isObj(raw) ? raw : {};
  const allowed = new Set(before);
  const standing = [...new Set(Array.isArray(r.standing) ? r.standing : [])]
    .filter((p) => allowed.has(p))
    .sort((a, b) => a - b);
  return {
    standing,
    feet: int(r.feet, 1, 39),
    target: int(r.target, 1, 39),
    breakpoint: int(r.breakpoint, 1, 39),
    hit: HIT_KEYS.has(r.hit) ? r.hit : null,
    speed: num(r.speed, 0, 40),
    tags: Array.isArray(r.tags) ? r.tags.filter((t) => typeof t === 'string').slice(0, 12).map((t) => t.slice(0, 40)) : [],
    note: text(r.note, 200),
  };
}

function normFrames(raw) {
  const frames = Array.from({ length: 10 }, () => []);
  const src = Array.isArray(raw) ? raw : [];
  for (let f = 0; f < 10; f++) {
    const shots = frames[f];
    for (const rawShot of Array.isArray(src[f]) ? src[f] : []) {
      if (frameDone(f, shots)) break;
      shots.push(normShot(rawShot, pinsBefore(shots, shots.length)));
    }
    // Balls in later frames are impossible until this frame is finished.
    if (!frameDone(f, shots)) break;
  }
  return frames;
}

function normGame(raw, seen) {
  const r = isObj(raw) ? raw : {};
  const frames = normFrames(r.frames);
  return { id: freshId(r.id, seen), frames, done: gameDone(frames), score: scoreGame(frames).total };
}

function normSession(raw, seen) {
  if (!isObj(raw) || !Array.isArray(raw.games)) throw new Error('The backup file looks damaged.');
  const gameIds = new Set();
  return {
    id: freshId(raw.id, seen),
    date: date(raw.date) ?? todayISO(),
    center: text(raw.center, 80),
    lane: text(raw.lane, 10),
    ball: text(raw.ball, 80),
    oil: text(raw.oil, 40) || 'Unknown',
    notes: text(raw.notes, 1000),
    games: raw.games.map((g) => normGame(g, gameIds)),
  };
}

// One spare-practice try: the leave you tried, whether you made it, and your line.
function normAttempt(raw, seen) {
  if (!isObj(raw)) return null;
  const leave = [...new Set(Array.isArray(raw.leave) ? raw.leave : [])].filter((p) => ALL_PINS.includes(p)).sort((a, b) => a - b);
  if (!leave.length) return null;
  return {
    id: freshId(raw.id, seen),
    date: date(raw.date) ?? todayISO(),
    leave,
    made: raw.made === true,
    feet: int(raw.feet, 1, 39),
    target: int(raw.target, 1, 39),
  };
}

// `gameIds` are the games that exist: a goal can't stay credited to a game that's gone.
function normGoals(raw, gameIds) {
  const out = [];
  for (const g of Array.isArray(raw) ? raw : []) {
    const type = isObj(g) && GOAL_TYPES.find((t) => t.key === g.key);
    const target = type && num(g.target, 0, type.max);
    if (target == null || out.some((x) => x.key === type.key)) continue;
    out.push({ key: type.key, target, reachedOn: date(g.reachedOn), reachedGame: gameIds.has(g.reachedGame) ? g.reachedGame : null });
  }
  return out;
}

// Throws if `data` isn't a Bowling Tracker database at all; otherwise returns a clean copy.
export function normalizeDB(data) {
  if (!isObj(data) || !Array.isArray(data.sessions)) throw new Error('This file is not a Bowling Tracker backup.');
  const s = isObj(data.settings) ? data.settings : {};
  const last = isObj(s.last) ? s.last : {};
  const seen = new Set();
  const sessions = data.sessions.map((x) => normSession(x, seen)).sort((a, b) => a.date.localeCompare(b.date));
  const gameIds = new Set(sessions.flatMap((x) => x.games.map((g) => g.id)));
  return {
    version: 1,
    settings: {
      hand: s.hand === 'L' ? 'L' : 'R',
      last: { center: text(last.center, 80), ball: text(last.ball, 80), oil: text(last.oil, 40) },
      sessionsSinceBackup: int(s.sessionsSinceBackup, 0, 1e6) ?? 0,
      lastBackup: date(s.lastBackup),
      keepAwake: s.keepAwake !== false,
      haptics: s.haptics !== false,
      skin: SKINS.includes(s.skin) ? s.skin : SKINS[0],
      seenVersion: typeof s.seenVersion === 'string' && /^v[\w-]{1,30}$/.test(s.seenVersion) ? s.seenVersion : null,
      quick: s.quick === true,
      speedUnit: s.speedUnit === 'mph' ? 'mph' : 'kph',
      goals: normGoals(s.goals, gameIds),
    },
    sessions,
    practice: (Array.isArray(data.practice) ? data.practice : []).slice(-20000).map((x) => normAttempt(x, seen)).filter(Boolean),
  };
}
