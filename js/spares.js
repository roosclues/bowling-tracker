// Spare aiming with the 3-6-9 system: keep the arrow of your strike ball and move your feet
// a set number of boards for the pin you need to hit. Pure functions, no DOM.

import { PIN_POS } from './scoring.js';

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

// One sentence explaining the move, e.g. for the glossary-style hint under the aim.
export function aimText(aim) {
  const { pin, shift, from, feet, target } = aim;
  const moved = shift === 0
    ? `stand where you do for strikes (board ${feet})`
    : `move your feet ${Math.abs(shift)} boards ${shift < 0 ? 'toward' : 'away from'} your bowling-hand side (board ${from.feet} → ${feet})`;
  const edge = aim.clamped ? ' That is as far as the approach goes, so also move your arrow a board or two.' : '';
  const straight = shift > 0 ? ' Throw this one straight, so it doesn\'t hook away from the pin.' : '';
  return `Key pin ${pin}: ${moved} and roll over the same arrow as your strike ball (board ${target}).${straight}${edge}`;
}
