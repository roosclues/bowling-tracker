// Lane notes: your own notes about lanes at a bowling center (Avoid / Good, problem chips, a
// few words), one per center and lane. These helpers take the list (db.laneNotes) so they
// stay free of storage; the screens save after changing it.

import { esc, fmtShortDate, todayISO, uid } from './util.js';

// "7" and "07" are the same lane, and "Strike Zone" and "strike zone " the same center.
const laneNum = (lane) => {
  const t = String(lane ?? '').trim();
  return /^\d+$/.test(t) ? String(Number(t)) : t.toLowerCase();
};
const centerKey = (center) => String(center ?? '').trim().toLowerCase();

export function laneKey(center, lane) {
  return `${centerKey(center)}|${laneNum(lane)}`;
}

export function findNote(notes, center, lane) {
  if (!String(lane ?? '').trim()) return null;
  const k = laneKey(center, lane);
  return notes.find((n) => laneKey(n.center, n.lane) === k) ?? null;
}

// Notes at a center: Avoid lanes first, then Good, then the rest, each by lane number.
const ORDER = { avoid: 0, good: 1 };
export function notesAt(notes, center) {
  const c = centerKey(center);
  return notes.filter((n) => centerKey(n.center) === c).sort((a, b) =>
    (ORDER[a.verdict] ?? 2) - (ORDER[b.verdict] ?? 2) || laneNum(a.lane).localeCompare(laneNum(b.lane), undefined, { numeric: true }));
}

// Adds a note, or replaces the one already kept for that center and lane. Returns it.
export function saveNote(notes, { center, lane, verdict = null, tags = [], text = '' }) {
  const old = findNote(notes, center, lane);
  const note = { id: old?.id ?? uid(), center: center.trim(), lane: lane.trim(), verdict, tags, text: text.trim(), date: todayISO() };
  if (old) notes.splice(notes.indexOf(old), 1, note);
  else notes.push(note);
  return note;
}

export function deleteNote(notes, id) {
  const i = notes.findIndex((n) => n.id === id);
  if (i >= 0) notes.splice(i, 1);
}

// "Avoid · Ball return, Oily · “jams a lot” · 12 Oct", escaped for HTML.
export function noteSummary(note) {
  return [
    note.verdict === 'avoid' && '<b class="lane-avoid">Avoid</b>',
    note.verdict === 'good' && '<b class="lane-good">Good</b>',
    note.tags.length && esc(note.tags.join(', ')),
    note.text && `“${esc(note.text)}”`,
    fmtShortDate(note.date),
  ].filter(Boolean).join(' · ');
}

// "Avoid lanes 7, 12 here · Good: 3", or '' with nothing marked.
export function laneWarning(notes, center) {
  const here = notesAt(notes, center);
  const avoid = here.filter((n) => n.verdict === 'avoid').map((n) => esc(n.lane));
  const good = here.filter((n) => n.verdict === 'good').map((n) => esc(n.lane));
  return [
    avoid.length && `Avoid ${avoid.length === 1 ? 'lane' : 'lanes'} ${avoid.join(', ')} here`,
    good.length && `Good: ${good.join(', ')}`,
  ].filter(Boolean).join(' · ');
}
