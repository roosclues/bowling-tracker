// Labels and beginner-friendly explanations shared across screens.

import { MIRROR } from './spares.js';

export const HITS = [
  { key: 'pocket', label: 'Pocket', desc: 'Perfect strike spot: between the 1 and 3 pins (1 and 2 if you bowl left-handed).' },
  { key: 'high', label: 'High', desc: 'Hit too much of the head pin (the 1 pin), too far to the far side. Often leaves splits.' },
  { key: 'light', label: 'Light', desc: 'Barely touched the head pin, so the ball was too far toward your hand side. Often leaves the 10 pin (7 for lefties) or the 5 pin.' },
  { key: 'brooklyn', label: 'Brooklyn', desc: 'Crossed over and hit the opposite pocket (1-2 for righties, 1-3 for lefties).' },
  { key: 'missed', label: 'Missed 1 pin', desc: 'Missed the head pin completely but stayed on the lane.' },
  { key: 'gutter', label: 'Gutter', desc: 'Ball fell into the gutter.' },
];

// "How it felt" tags. Stats read some of them by name.
export const TAG = {
  hitArrow: 'Hit my arrow',
  missedLeft: 'Missed left',
  missedRight: 'Missed right',
  rushed: 'Rushed',
  late: 'Late release',
  goodRelease: 'Good release',
  smooth: 'Felt smooth',
};
export const TAGS = Object.values(TAG);

export const GLOSSARY = {
  boards: {
    title: 'Boards',
    text: 'A lane is made of 39 wooden strips called boards. They are counted from your bowling-hand side: for a right-hander, board 1 is the far right edge and board 20 is the middle. Lefties count from the left.',
  },
  feet: {
    title: 'Feet position',
    text: 'The board your sliding foot starts on (left foot for right-handers, right foot for lefties). Use the dots on the approach: they are on boards 5, 10, 15, 20, 25, 30 and 35, lined up with the arrows, and the big center dot is board 20. Feet between two dots? Count the boards from the nearest dot.',
  },
  arrows: {
    title: 'Arrows (target)',
    text: 'The 7 triangle arrows painted about 15 feet past the foul line. They sit on boards 5, 10, 15, 20, 25, 30 and 35. Aiming at an arrow is much easier than aiming at the pins. Record the arrow your ball actually rolled over.',
  },
  breakpoint: {
    title: 'Breakpoint',
    text: 'The spot near the end of the lane where the ball stops going straight and starts to hook toward the pins. If your ball goes straight, leave it blank.',
  },
  hit: {
    title: 'Pin hit',
    text: HITS.map((h) => `${h.label}: ${h.desc}`).join('\n\n'),
  },
  split: {
    title: 'Split',
    text: 'The head pin is down and the pins left standing have a gap between them, like the 7-10 or 4-6. Splits are hard to pick up and usually come from high hits.',
  },
  spare: {
    title: 'Spare',
    text: 'Knocking down all remaining pins with your second ball. Scored as 10 plus the pins from your next ball.',
  },
  strike: {
    title: 'Strike',
    text: 'All 10 pins on the first ball. Scored as 10 plus the pins from your next two balls.',
  },
  carry: {
    title: 'Carry',
    text: 'A pocket hit should be a strike, but sometimes pins stay up anyway. Which pins stay tells you why: a 10 pin (7 for lefties) means the ball was too weak, a 4 pin (6 for lefties) means it hooked too hard, and a single back pin on the far side (the 7, 8 or 9 for righties) is often just bad luck. Needs "Pin hit" recorded under More details.',
  },
  speed: {
    title: 'Ball speed',
    text: 'Many lane screens show speed after each shot, in km/h or mph (switch in Settings). Most bowlers are between 22 and 29 km/h (14 to 18 mph). Keeping it steady matters more than going fast.',
  },
  oil: {
    title: 'Oil pattern',
    text: 'Lanes are oiled so balls skid before they hook. "House shot" is the normal pattern most bowling centers use. Leave it as Unknown if you are not sure.',
  },
  spareAim: {
    title: 'Spare aiming (3-6-9 system)',
    text: 'Start from your strike line, keep the same arrow, and only move your feet. Find the key pin (the pin closest to you), then:\n\nPins on the far side from your bowling hand: move your feet toward your hand side, 3 boards for the 2 or 8 pin, 6 for the 4 pin and 9 for the corner pin (7 for right-handers, 10 for lefties).\n\nPins on your hand side: move your feet away from it, 4 boards for the 3 or 9 pin, 8 for the 6 pin and 12 for the corner pin, and throw it straight.\n\nThe app works these boards out for you. It\'s a starting point: if you keep missing the same way, adjust by a board or two.',
  },
  quick: {
    title: 'Quick mode',
    text: 'Saves only the pins left standing, without feet, arrow or other details. Handy in league when there is no time between shots. Your score and spare stats still count; line stats only use balls with a line recorded.',
  },
  followMiss: {
    title: 'Move your feet the way you missed',
    text: 'Keep the same arrow, and if the ball misses the pocket, move your feet 2 boards in the direction of the miss.\n\nLight hits (ball ended up too far toward your bowling-hand side): move your feet 2 boards toward your hand side, a lower board number (e.g. 20 → 18).\n\nHigh or Brooklyn hits: move your feet 2 boards away from your hand side, a higher board number (e.g. 20 → 22).\n\nChange one thing at a time.',
  },
};

export function ordinal(n) {
  return n + (['th', 'st', 'nd', 'rd'][(n % 100 > 10 && n % 100 < 14) ? 0 : n % 10] || 'th');
}

export function arrowLabel(board) {
  if (board == null) return '–';
  if (board === 20) return `Board 20 · center arrow`;
  if (board % 5 === 0 && board >= 5 && board <= 35) return `Board ${board} · ${ordinal(board / 5)} arrow`;
  return `Board ${board}`;
}

export function feetLabel(board) {
  if (board == null) return '–';
  return board === 20 ? 'Board 20 · center dot' : `Board ${board}`;
}

export function hitLabel(key) {
  return HITS.find((h) => h.key === key)?.label ?? '';
}

// What a leave after a pocket hit usually means, written for a right-hander. Left-handers
// leave the mirror-image pins (the 7 instead of the 10), and {away}/{toward} become the
// side away from / toward the bowling hand. `fix` is false when there's nothing to change.
const WEAK = { label: 'Weak hit', fix: true, text: 'The ball reached the pins with too little angle or energy. Move your feet 2 boards {away} and keep your arrow, or try a stronger ball.' };
const STRONG = { label: 'Too strong', fix: true, text: 'The ball hooked too hard into the pocket. Move your feet 1–2 boards {toward}, or add a little speed.' };
const LUCK = { label: 'Small miss', fix: false, text: 'A small miss in the pocket, often just bad luck. Keep your line.' };
const CARRY = {
  10: WEAK, '6-10': WEAK,
  4: STRONG, '4-7': STRONG, '4-9': STRONG, '4-7-9': STRONG,
  5: { label: 'Lost energy', fix: true, text: 'The ball lost its energy before the pins. Add a touch of speed, or roll the ball more instead of spinning it.' },
  7: LUCK, 8: LUCK, 9: LUCK,
};

// { label, text, fix } for the pins a pocket hit left, or null for an unusual leave.
export function carryNote(pins, hand) {
  const key = (hand === 'L' ? pins.map((p) => MIRROR[p]).sort((a, b) => a - b) : pins).join('-');
  const note = CARRY[key];
  if (!note) return null;
  const away = hand === 'L' ? 'right' : 'left';
  const toward = hand === 'L' ? 'left' : 'right';
  return { ...note, text: note.text.replace('{away}', away).replace('{toward}', toward) };
}

export function infoButton(term) {
  return `<button type="button" class="info" data-term="${term}" aria-label="Explain: ${GLOSSARY[term]?.title ?? 'this'}">i</button>`;
}
