// Spare aiming with the 3-6-9 system: keep the arrow of your strike ball and move your feet
// a set number of boards for the pin you need to hit, then adjust it a board or two from your
// own tries (adjustAim). Pure functions, no DOM.

import { PIN_POS } from './scoring.js';
import { plural } from './util.js';

// Boards to move the feet for each key pin, for a right-hander. Boards are counted from the
// hand side, so negative = toward the hand side. Left-handers use the mirror-image pin.
const SHIFT = { 1: 0, 5: 0, 2: -3, 8: -3, 4: -6, 7: -9, 3: 4, 9: 4, 6: 8, 10: 12 };
export const MIRROR = { 1: 1, 2: 3, 3: 2, 4: 6, 5: 5, 6: 4, 7: 10, 8: 9, 9: 8, 10: 7 };

export const DEFAULT_LINE = { feet: 20, target: 10 };

const shiftFor = (pin, hand) => SHIFT[hand === 'L' ? MIRROR[pin] : pin];

// The pin to aim at: the one closest to you. For a split across one row (4-6, 7-10),
// the pin that needs the smaller move. Null for an empty leave.
export function keyPin(leave, hand) {
  if (!leave.length) return null;
  return leave.reduce((a, b) => {
    const ra = PIN_POS[a][0];
    const rb = PIN_POS[b][0];
    if (ra !== rb) return rb < ra ? b : a;
    return Math.abs(shiftFor(b, hand)) < Math.abs(shiftFor(a, hand)) ? b : a;
  });
}

// Where to stand and aim for `leave`, starting from your strike line { feet, target }.
// Null for an empty leave.
export function spareAim(leave, line, hand) {
  const pin = keyPin(leave, hand);
  if (pin === null) return null;
  const from = { feet: line?.feet ?? DEFAULT_LINE.feet, target: line?.target ?? DEFAULT_LINE.target };
  const shift = shiftFor(pin, hand);
  const wanted = from.feet + shift;
  const feet = Math.min(39, Math.max(1, wanted));
  return { pin, shift, from, feet, target: from.target, clamped: feet !== wanted };
}

// Learning from your tries at a key pin. Each try that says something (feet recorded, and
// made or missed with a direction) shows where the feet should have been: a make where you
// stood, a miss one board further the way it went ("move your feet the way you missed").
// The aim moves to the middle of your last LEARN_TRIES of those, at most MAX_ADJUST boards.
// Once you make it from there, those makes keep it there.
export const LEARN_TRIES = 8;
export const LEARN_MIN = 4;
export const MAX_ADJUST = 2;

// `tries`, oldest first: { offset, made, miss: 'left'|'right'|null }, where offset is the feet
// you used minus the 3-6-9 feet for that try (null if not recorded).
export function adjustAim(aim, tries, hand) {
  if (!aim) return aim;
  const way = { left: hand === 'L' ? -1 : 1, right: hand === 'L' ? 1 : -1 }; // boards count from the hand side
  const used = tries.filter((t) => t.offset != null && (t.made || way[t.miss])).slice(-LEARN_TRIES);
  if (used.length < LEARN_MIN) return aim;
  const best = used.map((t) => t.offset + (t.made ? 0 : way[t.miss])).sort((a, b) => a - b);
  const mid = best.length / 2;
  const median = best.length % 2 ? best[Math.floor(mid)] : (best[mid - 1] + best[mid]) / 2;
  // Half a board rounds toward no change, the same way on both sides.
  const boards = Math.sign(median) * Math.ceil(Math.abs(median) - 0.5);
  const feet = Math.min(39, Math.max(1, aim.feet + Math.max(-MAX_ADJUST, Math.min(MAX_ADJUST, boards))));
  if (feet === aim.feet) return aim;
  const count = (f) => used.filter(f).length;
  return {
    ...aim,
    feet,
    base: aim.feet,
    learned: {
      n: used.length,
      made: count((t) => t.made),
      left: count((t) => !t.made && t.miss === 'left'),
      right: count((t) => !t.made && t.miss === 'right'),
      dir: (feet > aim.feet) === (hand !== 'L') ? 'left' : 'right',
    },
  };
}

// One sentence explaining the move, e.g. for the glossary-style hint under the aim.
export function aimText(aim) {
  const { pin, shift, from, target, learned } = aim;
  const feet = aim.base ?? aim.feet; // the 3-6-9 board, before any adjustment
  const moved = shift === 0
    ? `stand where you do for strikes (board ${feet})`
    : `move your feet ${Math.abs(shift)} boards ${shift < 0 ? 'toward' : 'away from'} your bowling-hand side (board ${from.feet} → ${feet})`;
  const edge = aim.clamped ? ' That is as far as the approach goes, so also move your arrow a board or two.' : '';
  const straight = shift > 0 ? ' Throw this one straight, so it doesn\'t hook away from the pin.' : '';
  const tries = learned && [learned.made && `${learned.made} made`, learned.left && `${learned.left} missed left`,
    learned.right && `${learned.right} missed right`].filter(Boolean).join(', ');
  const adjusted = learned
    ? ` Moved ${plural(Math.abs(aim.feet - feet), 'board')} ${learned.dir} from there (board ${feet} → ${aim.feet}), from your last ${learned.n} tries at this pin: ${tries}.`
    : '';
  return `Key pin ${pin}: ${moved} and roll over the same arrow as your strike ball (board ${target}).${straight}${edge}${adjusted}`;
}
