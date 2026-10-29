// Tappable top-down lane: breakpoint band (top), arrows band (middle), approach (bottom).
// Boards are counted from the bowler's hand side, so the drawing flips for left-handers.

import { arrowLabel, feetLabel, infoButton } from './terms.js';
import { icon } from './ui.js';

// Shared with the to-scale lane on the Help screen (lanemap.js).
export const BOARD = 10;
export const GUTTER = 16;
export const W = GUTTER * 2 + BOARD * 39;
export const ARROWS = [5, 10, 15, 20, 25, 30, 35];
export const DOTS = [5, 10, 15, 20, 25, 30, 35];
export const POCKET_BOARD = 17.5;

const FOUL_Y = 172;
const H = 250;
const ZONES = [
  { key: 'breakpoint', top: 0, bottom: 82, label: 'Breakpoint', markerY: 40 },
  { key: 'target', top: 82, bottom: FOUL_Y, label: 'Arrow', markerY: 128 },
  { key: 'feet', top: FOUL_Y, bottom: H, label: 'Feet', markerY: 222 },
];

export function boardX(board, hand) {
  const fromLeft = hand === 'L' ? board - 1 : 39 - board;
  return GUTTER + fromLeft * BOARD + BOARD / 2;
}

export function xToBoard(x, hand) {
  const fromLeft = Math.floor((x - GUTTER) / BOARD);
  const b = hand === 'L' ? fromLeft + 1 : 39 - fromLeft;
  return Math.min(39, Math.max(1, b));
}

function laneSVG(hand) {
  const lines = [];
  for (let b = 1; b < 39; b++) {
    const x = GUTTER + b * BOARD;
    lines.push(`<line x1="${x}" y1="0" x2="${x}" y2="${H}" class="${b % 5 === 0 ? 'board5' : 'board'}"/>`);
  }
  const arrows = ARROWS.map((b, i) => {
    const x = boardX(b, hand);
    const y = 120 + Math.abs(3 - i) * 7;
    return `<path d="M${x} ${y - 9} L${x + 5} ${y + 5} L${x - 5} ${y + 5} Z" class="arrow"/>`
      + `<text x="${x}" y="${y + 18}" class="lane-num">${b}</text>`;
  }).join('');
  const dots = DOTS.map((b) => `<circle cx="${boardX(b, hand)}" cy="196" r="${b === 20 ? 4 : 2.6}" class="dot"/>`).join('');
  const bandLabels = ZONES.map((z) => `<text x="${W - 4}" y="${z.top + 12}" class="band-label" text-anchor="end">${z.label}</text>`).join('');
  return `
    <rect x="0" y="0" width="${W}" height="${H}" class="gutter"/>
    <rect x="${GUTTER}" y="0" width="${BOARD * 39}" height="${FOUL_Y}" class="wood"/>
    <rect x="${GUTTER}" y="${FOUL_Y}" width="${BOARD * 39}" height="${H - FOUL_Y}" class="approach"/>
    ${lines.join('')}
    <line x1="0" y1="82" x2="${W}" y2="82" class="band-sep"/>
    <line x1="0" y1="${FOUL_Y}" x2="${W}" y2="${FOUL_Y}" class="foul"/>
    ${arrows}${dots}${bandLabels}
    <text x="${boardX(1, hand)}" y="${H - 6}" class="lane-num">1</text>
    <text x="${boardX(39, hand)}" y="${H - 6}" class="lane-num">39</text>
    <g class="markers"></g>`;
}

function markersSVG(v, hand) {
  const parts = [];
  const pts = [];
  if (v.feet != null) pts.push([boardX(v.feet, hand), ZONES[2].markerY]);
  if (v.target != null) pts.push([boardX(v.target, hand), ZONES[1].markerY]);
  if (v.breakpoint != null) pts.push([boardX(v.breakpoint, hand), ZONES[0].markerY]);
  if (v.target != null) pts.push([boardX(POCKET_BOARD, hand), 0]);
  if (pts.length > 1) parts.push(`<polyline points="${pts.map((p) => p.join(',')).join(' ')}" class="path"/>`);
  if (v.feet != null) {
    const x = boardX(v.feet, hand);
    parts.push(`<rect x="${x - 6}" y="${ZONES[2].markerY - 11}" width="12" height="22" rx="6" class="mk mk-feet"/>`);
  }
  if (v.target != null) {
    parts.push(`<circle cx="${boardX(v.target, hand)}" cy="${ZONES[1].markerY}" r="9" class="mk mk-target"/>`);
  }
  if (v.breakpoint != null) {
    parts.push(`<circle cx="${boardX(v.breakpoint, hand)}" cy="${ZONES[0].markerY}" r="9" class="mk mk-bp"/>`);
  }
  return parts.join('');
}

const LABELS = { feet: feetLabel, target: arrowLabel, breakpoint: (b) => (b == null ? '–' : `Board ${b}`) };
const NAMES = { feet: 'Feet', target: 'Arrow', breakpoint: 'Breakpoint' };
const TERMS = { feet: 'feet', target: 'arrows', breakpoint: 'breakpoint' };

// Mounts the picker. `value` is mutated in place; onChange fires after every change.
export function mountLane(container, { hand, value, onChange }) {
  container.innerHTML = `
    <svg class="lane" viewBox="0 0 ${W} ${H}" role="img" aria-label="Lane: tap to set feet, arrow and breakpoint">${laneSVG(hand)}</svg>
    <div class="lane-readout">
      ${['feet', 'target', 'breakpoint'].map((k) => `
        <div class="lr-row" data-k="${k}">
          <span class="lr-name">${NAMES[k]} ${infoButton(TERMS[k])}</span>
          <span class="lr-val"></span>
          <span class="lr-btns">
            <button type="button" class="step" data-k="${k}" data-d="${hand === 'L' ? -1 : 1}" aria-label="${NAMES[k]} left">${icon('chevL', 18)}</button>
            <button type="button" class="step" data-k="${k}" data-d="${hand === 'L' ? 1 : -1}" aria-label="${NAMES[k]} right">${icon('chevR', 18)}</button>
            <button type="button" class="clear" data-k="${k}" aria-label="Clear ${NAMES[k]}">${icon('x', 16)}</button>
          </span>
        </div>`).join('')}
    </div>`;

  const svg = container.querySelector('svg');
  const markers = svg.querySelector('.markers');

  function refresh() {
    markers.innerHTML = markersSVG(value, hand);
    for (const row of container.querySelectorAll('.lr-row')) {
      const k = row.dataset.k;
      row.querySelector('.lr-val').textContent = LABELS[k](value[k]);
      row.classList.toggle('empty', value[k] == null);
    }
  }

  function set(k, board) {
    if (value[k] === board) return;
    value[k] = board;
    refresh();
    onChange?.(value);
  }

  function svgPoint(e) {
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    return pt.matrixTransform(svg.getScreenCTM().inverse());
  }

  // Tap or slide sideways to set a board. The lane allows vertical page scrolling
  // (touch-action: pan-y); if the browser takes over for a scroll, undo the tap.
  let dragZone = null;
  let before = null;
  svg.addEventListener('pointerdown', (e) => {
    const p = svgPoint(e);
    dragZone = ZONES.find((z) => p.y >= z.top && p.y < z.bottom) ?? ZONES[2];
    before = value[dragZone.key];
    set(dragZone.key, xToBoard(p.x, hand));
  });
  svg.addEventListener('pointermove', (e) => {
    if (!dragZone) return;
    set(dragZone.key, xToBoard(svgPoint(e).x, hand));
  });
  svg.addEventListener('pointerup', () => { dragZone = null; });
  svg.addEventListener('pointercancel', () => {
    if (dragZone) set(dragZone.key, before);
    dragZone = null;
  });

  container.querySelector('.lane-readout').addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn || btn.classList.contains('info')) return;
    const k = btn.dataset.k;
    if (btn.classList.contains('clear')) set(k, null);
    else {
      const start = value[k] ?? (k === 'feet' ? 20 : k === 'target' ? 10 : 8);
      set(k, Math.min(39, Math.max(1, start + Number(btn.dataset.d))));
    }
  });

  refresh();
  return { refresh };
}
