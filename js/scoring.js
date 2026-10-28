// Bowling scoring rules. Pure functions, no DOM.
//
// A game is an array of 10 frames; each frame is an array of shots.
// A shot records which pins were still STANDING after it: { standing: [pin numbers] }.
// Pins knocked down are derived from what was standing before the shot.

export const ALL_PINS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

// Pin layout as (row, col): row 0 is the head pin, col steps by 2 between neighbours.
export const PIN_POS = {
  1: [0, 0],
  2: [1, -1], 3: [1, 1],
  4: [2, -2], 5: [2, 0], 6: [2, 2],
  7: [3, -3], 8: [3, -1], 9: [3, 1], 10: [3, 3],
};

// Pins standing before shot `shotIndex` of a frame. The rack is reset
// whenever the previous shot cleared it (only possible in the 10th frame).
export function pinsBefore(shots, shotIndex) {
  if (shotIndex === 0) return ALL_PINS.slice();
  const prev = shots[shotIndex - 1].standing;
  return prev.length ? prev.slice() : ALL_PINS.slice();
}

// True when the shot was thrown at a full rack of 10 (a "first ball").
export function isFreshRack(shots, shotIndex) {
  return shotIndex === 0 || shots[shotIndex - 1].standing.length === 0;
}

export function knocked(shots) {
  return shots.map((s, i) => pinsBefore(shots, i).length - s.standing.length);
}

export function frameDone(frameIndex, shots) {
  const n = shots.length;
  if (n === 0) return false;
  if (frameIndex < 9) return shots[0].standing.length === 0 || n >= 2;
  if (n >= 3) return true;
  if (n < 2) return false;
  const earnedBonus = shots[0].standing.length === 0 || shots[1].standing.length === 0;
  return !earnedBonus;
}

// Where the next shot goes: { frame, shot } (0-based), or null when the game is over.
export function nextShot(frames) {
  for (let f = 0; f < 10; f++) {
    const shots = frames[f] || [];
    if (!frameDone(f, shots)) return { frame: f, shot: shots.length };
  }
  return null;
}

export function gameDone(frames) {
  return nextShot(frames) === null;
}

// Running score per frame. A frame's entry is null until its bonus balls are thrown.
export function scoreGame(frames) {
  const counts = [];
  const flat = [];
  const start = [];
  for (let f = 0; f < 10; f++) {
    const c = knocked(frames[f] || []);
    counts.push(c);
    start.push(flat.length);
    flat.push(...c);
  }

  const cumulative = new Array(10).fill(null);
  let total = 0;
  for (let f = 0; f < 10; f++) {
    if (!frameDone(f, frames[f] || [])) break;
    const c = counts[f];
    const i = start[f];
    let frameScore = null;
    if (f === 9) {
      frameScore = c.reduce((a, b) => a + b, 0);
    } else if (c[0] === 10) {
      if (flat.length > i + 2) frameScore = 10 + flat[i + 1] + flat[i + 2];
    } else if (c[0] + c[1] === 10) {
      if (flat.length > i + 2) frameScore = 10 + flat[i + 2];
    } else {
      frameScore = c[0] + c[1];
    }
    if (frameScore === null) break;
    total += frameScore;
    cumulative[f] = total;
  }
  return { cumulative, total };
}

// Scoreboard symbols for each shot of a frame: X, /, -, or a number.
export function marks(shots) {
  return shots.map((s, i) => {
    const before = pinsBefore(shots, i);
    if (s.standing.length === 0) return isFreshRack(shots, i) ? 'X' : '/';
    const k = before.length - s.standing.length;
    return k === 0 ? '-' : String(k);
  });
}

// Pins that "hold together": diagonal neighbours (2-4, 5-9) or one directly behind the
// other (2-8, 3-9). Side-by-side pins (5-6, 9-10) only hold together through the pin in
// front of them, which is itself diagonal to both, so they need no rule of their own.
function adjacent(a, b) {
  const [ra, ca] = PIN_POS[a];
  const [rb, cb] = PIN_POS[b];
  const dr = Math.abs(ra - rb);
  const dc = Math.abs(ca - cb);
  return (dr === 1 && dc === 1) || (dr === 2 && dc === 0);
}

// A split (USBC rule): head pin down, and a pin is down between standing pins (7-10, 3-10)
// or immediately ahead of and between them (5-6, 9-10).
export function isSplit(standing) {
  if (standing.length < 2 || standing.includes(1)) return false;
  const seen = new Set([standing[0]]);
  const queue = [standing[0]];
  while (queue.length) {
    const p = queue.shift();
    for (const q of standing) {
      if (!seen.has(q) && adjacent(p, q)) {
        seen.add(q);
        queue.push(q);
      }
    }
  }
  return seen.size < standing.length;
}
