// Help-screen lane drawn to scale along its length: approach dots, foul line, guide dots,
// arrows, where the oil ends, range finders and pins all sit at their real distances.
// The width is stretched (a real lane is ~17x longer than wide) so the boards stay visible,
// and the pin deck is enlarged. Tap to move feet, arrow and breakpoint.

import { BOARD, GUTTER, W, ARROWS, DOTS, POCKET_BOARD, boardX, xToBoard } from './lane.js';
import { ALL_PINS, PIN_POS } from './scoring.js';
import { arrowLabel, feetLabel, infoButton } from './terms.js';

const FT = 15;                     // SVG units per foot of lane length
const PIT = 14;                    // dark pit behind the pins
const HEAD_Y = 104;                // head pin: 60 ft from the foul line
const FOUL_Y = HEAD_Y + 60 * FT;
const H = FOUL_Y + 16 * FT + 6;    // about 16 ft of approach
const PIN_ROW = 22;                // enlarged pin deck (not to scale)
const PIN_COL = 5.64 * BOARD;      // 6 inches across = 5.64 boards
const LANE_W = BOARD * 39;
const GUIDE_DOTS = [3, 5, 8, 11, 14, 26, 29, 32, 35, 37];
const OIL_FT = 40;                 // a typical house pattern

const down = (ft) => FOUL_Y - ft * FT;   // `ft` feet down the lane
const behind = (ft) => FOUL_Y + ft * FT; // `ft` feet back on the approach
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
// The arrows form a V: the center arrow is 16 ft out and each pair outward is a foot closer.
const arrowFt = (b) => 16 - Math.abs(b - 20) / 5;

function staticSVG(hand) {
  const lx = hand === 'L' ? W - GUTTER - 6 : GUTTER + 6;   // labels on the side away from your hand
  const anchor = hand === 'L' ? 'end' : 'start';
  const rx = hand === 'L' ? GUTTER / 2 : W - GUTTER / 2;   // distance ruler in the gutter on your hand side
  const label = (y, text, cls = 'lm-label') => `<text x="${lx}" y="${y}" text-anchor="${anchor}" class="${cls}">${text}</text>`;

  const boards = [];
  for (let b = 1; b < 39; b++) {
    const x = GUTTER + b * BOARD;
    boards.push(`<line x1="${x}" y1="${PIT}" x2="${x}" y2="${H}" class="${b % 5 === 0 ? 'board5' : 'board'}"/>`);
  }
  const arrows = ARROWS.map((b) => {
    const x = boardX(b, hand);
    const y = down(arrowFt(b));
    return `<path d="M${x} ${y - 13} L${x + 5} ${y + 7} L${x - 5} ${y + 7} Z" class="arrow"/>`;
  }).join('');
  const guide = GUIDE_DOTS.map((b) => `<circle cx="${boardX(b, hand)}" cy="${down(7)}" r="2.6" class="dot"/>`).join('');
  const approach = [12, 15].map((ft) => DOTS.map((b) =>
    `<circle cx="${boardX(b, hand)}" cy="${behind(ft)}" r="${b === 20 ? 4 : 2.6}" class="dot"/>`).join('')).join('');
  const finders = [10, 30].map((b) =>
    `<line x1="${boardX(b, hand)}" y1="${down(43)}" x2="${boardX(b, hand)}" y2="${down(34)}" class="rf"/>`).join('');
  const pins = ALL_PINS.map((p) => {
    const [row, col] = PIN_POS[p];
    const x = W / 2 + col * PIN_COL;
    const y = HEAD_Y - row * PIN_ROW;
    return `<circle cx="${x}" cy="${y}" r="7.5" class="lm-pin"/><circle cx="${x}" cy="${y}" r="3.6" class="lm-pin-ring"/>`;
  }).join('');
  const ruler = [10, 20, 30, 40, 50, 60].map((ft) =>
    `<line x1="${rx - 5}" x2="${rx + 5}" y1="${down(ft)}" y2="${down(ft)}" class="lm-tickline"/>
     <text x="${rx}" y="${down(ft) - 4}" class="lm-tick">${ft}</text>`).join('');

  return `
    <defs>
      <linearGradient id="lmOil" x1="0" y1="1" x2="0" y2="0">
        <stop offset="0" stop-color="#fff" stop-opacity="0.26"/>
        <stop offset="0.85" stop-color="#fff" stop-opacity="0.12"/>
        <stop offset="1" stop-color="#fff" stop-opacity="0"/>
      </linearGradient>
    </defs>
    <rect x="0" y="0" width="${W}" height="${PIT}" class="lm-pit"/>
    <rect x="0" y="${PIT}" width="${W}" height="${FOUL_Y - PIT}" class="gutter"/>
    <rect x="${GUTTER}" y="${PIT}" width="${LANE_W}" height="${FOUL_Y - PIT}" class="wood"/>
    <rect x="${GUTTER}" y="${PIT}" width="${LANE_W}" height="${HEAD_Y + 16 - PIT}" class="lm-deck"/>
    <rect x="0" y="${FOUL_Y}" width="${W}" height="${H - FOUL_Y}" class="approach"/>
    <rect x="${GUTTER}" y="${down(OIL_FT)}" width="${LANE_W}" height="${OIL_FT * FT}" fill="url(#lmOil)"/>
    ${boards.join('')}
    <line x1="${GUTTER}" x2="${W - GUTTER}" y1="${down(OIL_FT)}" y2="${down(OIL_FT)}" class="oil-end"/>
    ${finders}${arrows}${guide}
    <line x1="0" y1="${FOUL_Y}" x2="${W}" y2="${FOUL_Y}" class="foul"/>
    ${approach}${pins}${ruler}
    ${label(HEAD_Y + 32, 'HEAD PIN · 60 FT')}
    ${label(down(43) - 8, 'RANGE FINDERS')}
    ${label(down(OIL_FT) + 16, 'HOUSE OIL ENDS · ABOUT 40 FT')}
    ${label(down(17), 'ARROWS · ABOUT 15 FT')}
    ${label(down(7) - 10, 'GUIDE DOTS · ABOUT 7 FT')}
    ${label(FOUL_Y - 8, 'FOUL LINE')}
    ${label(behind(12) - 10, 'APPROACH DOTS · 12 &amp; 15 FT BACK', 'lm-label on-approach')}
    <g class="markers"></g>`;
}

function markersSVG(v, bpFt, hand) {
  const X = (b) => boardX(b, hand);
  const parts = [];
  if (v.target != null) {
    // Straight from the release point, over the arrow, out to the breakpoint, then the hook.
    const aFt = arrowFt(v.target);
    let release = v.target;
    let d;
    if (v.breakpoint != null) {
      release = clamp(v.target + ((v.target - v.breakpoint) * aFt) / (bpFt - aFt), 1, 39);
      const curveY = down(bpFt + (60 - bpFt) * 0.55);
      d = `M${X(release)} ${FOUL_Y} L${X(v.breakpoint)} ${down(bpFt)} Q${X(v.breakpoint)} ${curveY} ${X(POCKET_BOARD)} ${HEAD_Y}`;
    } else {
      d = `M${X(release)} ${FOUL_Y} L${X(v.target)} ${down(aFt)} L${X(POCKET_BOARD)} ${HEAD_Y}`;
    }
    if (v.feet != null) parts.push(`<line x1="${X(v.feet)}" y1="${behind(15)}" x2="${X(release)}" y2="${FOUL_Y}" class="lm-path-feet"/>`);
    parts.push(`<path d="${d}" class="lm-path"/>`);
    parts.push(`<circle cx="${X(v.target)}" cy="${down(aFt)}" r="9" class="mk mk-target"/>`);
  }
  if (v.breakpoint != null) parts.push(`<circle cx="${X(v.breakpoint)}" cy="${down(bpFt)}" r="9" class="mk mk-bp"/>`);
  if (v.feet != null) parts.push(`<rect x="${X(v.feet) - 6}" y="${behind(15) - 11}" width="12" height="22" rx="6" class="mk mk-feet"/>`);
  return parts.join('');
}

export function mountLaneMap(container, { hand, value }) {
  let bpFt = 42;
  container.innerHTML = `
    <svg class="lane lanemap" viewBox="0 0 ${W} ${H}" role="img" aria-label="Bowling lane drawn to scale: tap to move feet, arrow and breakpoint">${staticSVG(hand)}</svg>
    <div class="lane-readout">
      <div class="lr-row" data-k="feet"><span class="lr-name">Feet ${infoButton('feet')}</span><span class="lr-val"></span></div>
      <div class="lr-row" data-k="target"><span class="lr-name">Arrow ${infoButton('arrows')}</span><span class="lr-val"></span></div>
      <div class="lr-row" data-k="breakpoint"><span class="lr-name">Breakpoint ${infoButton('breakpoint')}</span><span class="lr-val"></span></div>
    </div>`;
  const svg = container.querySelector('svg');
  const markers = svg.querySelector('.markers');

  function refresh() {
    markers.innerHTML = markersSVG(value, bpFt, hand);
    const val = (k, text) => { container.querySelector(`[data-k="${k}"] .lr-val`).textContent = text; };
    val('feet', value.feet == null ? '–' : feetLabel(value.feet));
    val('target', value.target == null ? '–' : `${arrowLabel(value.target)} · about ${Math.round(arrowFt(value.target))} ft`);
    val('breakpoint', value.breakpoint == null ? '–' : `Board ${value.breakpoint} · ${bpFt} ft down the lane`);
  }

  function svgPoint(e) {
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    return pt.matrixTransform(svg.getScreenCTM().inverse());
  }

  // Approach = feet, front of the lane = arrow, further down = breakpoint (the pin deck does nothing).
  function zoneAt(y) {
    if (y > FOUL_Y) return 'feet';
    if (y >= down(25)) return 'target';
    if (y >= down(57)) return 'breakpoint';
    return null;
  }

  function apply(zone, p) {
    value[zone] = xToBoard(p.x, hand);
    if (zone === 'breakpoint') bpFt = clamp(Math.round((FOUL_Y - p.y) / FT), 28, 56);
    refresh();
  }

  let dragZone = null;
  let before = null;
  svg.addEventListener('pointerdown', (e) => {
    const p = svgPoint(e);
    dragZone = zoneAt(p.y);
    if (!dragZone) return;
    before = { board: value[dragZone], bpFt };
    apply(dragZone, p);
  });
  svg.addEventListener('pointermove', (e) => {
    if (dragZone) apply(dragZone, svgPoint(e));
  });
  svg.addEventListener('pointerup', () => { dragZone = null; });
  svg.addEventListener('pointercancel', () => {
    if (dragZone) {
      value[dragZone] = before.board;
      bpFt = before.bpFt;
      refresh();
    }
    dragZone = null;
  });

  refresh();
}
