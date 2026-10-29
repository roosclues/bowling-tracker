// Labels and beginner-friendly explanations shared across screens.

export const HITS = [
  { key: 'pocket', label: 'Pocket', desc: 'Perfect strike spot: between the 1 and 3 pins (1 and 2 if you bowl left-handed).' },
  { key: 'high', label: 'High', desc: 'Hit too much of the head pin (the 1 pin), too far to the far side. Often leaves splits.' },
  { key: 'light', label: 'Light', desc: 'Barely touched the head pin, so the ball was too far toward your hand side. Often leaves the 10 pin (7 for lefties) or the 5 pin.' },
  { key: 'brooklyn', label: 'Brooklyn', desc: 'Crossed over and hit the opposite pocket (1-2 for righties, 1-3 for lefties).' },
  { key: 'missed', label: 'Missed 1 pin', desc: 'Missed the head pin completely but stayed on the lane.' },
  { key: 'gutter', label: 'Gutter', desc: 'Ball fell into the gutter.' },
];

export const TAGS = [
  'Hit my arrow',
  'Missed left',
  'Missed right',
  'Rushed',
  'Late release',
  'Good release',
  'Felt smooth',
];

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
  speed: {
    title: 'Ball speed',
    text: 'Many lane screens show speed in mph after each shot. Most bowlers are between 14 and 18 mph. Keeping it steady matters more than going fast.',
  },
  oil: {
    title: 'Oil pattern',
    text: 'Lanes are oiled so balls skid before they hook. "House shot" is the normal pattern most bowling centers use. Leave it as Unknown if you are not sure.',
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

export function infoButton(term) {
  return `<button type="button" class="info" data-term="${term}" aria-label="What is this?">i</button>`;
}
