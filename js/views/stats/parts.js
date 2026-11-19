// Pieces more than one Stats tab uses: tiles, tables, before/after rows and best-game rows.

import { GOAL_TYPES } from '../../goals.js';
import { kvRow } from '../../ui.js';
import { pct, fmtShortDate } from '../../util.js';

export const hitCount = (s) => Object.values(s.hits).reduce((a, b) => a + b, 0);

const goalRow = (key) => {
  const t = GOAL_TYPES.find((x) => x.key === key);
  return { label: t.label, get: t.get, fmt: (v) => t.fmt(t.round(v)), up: t.up };
};

// Rows of "Are you improving?": the goal stats plus pocket hits.
const METRICS = [
  goalRow('average'), goalRow('firstBall'), goalRow('strikes'), goalRow('spares'), goalRow('single'), goalRow('opens'),
  { label: 'Pocket hits', get: (s) => (hitCount(s) >= 3 ? pct(s.hits.pocket ?? 0, hitCount(s)) : null), fmt: (v) => `${v}%`, up: true },
];

export const STATE_WORD = { better: 'Better', worse: 'Worse', same: 'Same' };
export const table = (inner, cls = '') => `<div class="tbl-wrap"><table class="tbl${cls ? ` ${cls}` : ''}">${inner}</table></div>`;
export const tile = (value, label, change = '') => `<div class="tile"><div class="tv">${value}</div><div class="tl">${label}</div>${change}</div>`;
export const tileCount = (made, chances) => (chances ? `<div class="tc"><span>${made} of ${chances}</span></div>` : '');

// "▲ 24 vs Sep" under a tile: the change from `before` to `now`, green when it's better (`up`:
// higher is better, false: lower is better, null: neither, as for games played).
export function tileChange(now, before, vs, { up = true, digits = 0, unit = '' } = {}) {
  if (now == null || before == null) return '';
  const d = Number((now - before).toFixed(digits));
  const state = d === 0 || up === null ? 'same' : (d > 0) === up ? 'better' : 'worse';
  const text = d === 0 ? '= same' : `${d > 0 ? '▲' : '▼'} ${Math.abs(d).toFixed(digits)}${unit}`;
  return `<div class="tc trend ${state}">${text} <span>vs ${vs}</span></div>`;
}

export function progressRows(p) {
  return METRICS.map((m) => {
    const a = m.get(p.first);
    const b = m.get(p.last);
    if (a == null || b == null) return null;
    const from = String(m.fmt(a));
    const to = String(m.fmt(b));
    const state = from === to ? 'same' : (b > a) === m.up ? 'better' : 'worse';
    return { label: m.label, from, to, state, mark: from === to ? '=' : b > a ? '▲' : '▼' };
  }).filter(Boolean);
}

// A best game or session as a row that opens it, dated on the right.
export function bestRow(label, value, entry, sub = '') {
  const href = entry.game ? `#/summary/${entry.session.id}/${entry.game.id}` : `#/session/${entry.session.id}`;
  return kvRow(label, value, { sub, side: fmtShortDate(entry.session.date), href });
}
