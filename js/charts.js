// Minimal SVG/HTML charts: a single-series line with tap/hover readout, horizontal bars, and a
// calendar of days bowled.

import { esc } from './util.js';

function niceTicks(min, max, count = 4) {
  const span = Math.max(1, max - min);
  const step = [5, 10, 20, 25, 50, 100].find((s) => span / s <= count) ?? 100;
  let lo = Math.floor(min / step) * step;
  let hi = Math.ceil(max / step) * step;
  if (lo === hi) {
    lo = Math.max(0, lo - step);
    hi += step;
  }
  const ticks = [];
  for (let v = lo; v <= hi; v += step) ticks.push(v);
  return ticks;
}

// points: [{ value, label }] in order. refValue draws a labeled reference line (e.g. average).
export function lineChart(container, points, { refValue = null, refLabel = '' } = {}) {
  const W = 340;
  const H = 180;
  const pad = { l: 34, r: 30, t: 14, b: 22 };
  const values = points.map((p) => p.value);
  const ticks = niceTicks(Math.min(...values), Math.max(...values));
  const y0 = ticks[0];
  const y1 = ticks[ticks.length - 1];
  const x = (i) => pad.l + (points.length === 1 ? (W - pad.l - pad.r) / 2 : (i * (W - pad.l - pad.r)) / (points.length - 1));
  const y = (v) => pad.t + (1 - (v - y0) / (y1 - y0 || 1)) * (H - pad.t - pad.b);

  const grid = ticks.map((t) => `
    <line x1="${pad.l}" x2="${W - pad.r}" y1="${y(t)}" y2="${y(t)}" class="c-grid"/>
    <text x="${pad.l - 6}" y="${y(t) + 4}" class="c-tick" text-anchor="end">${t}</text>`).join('');
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(p.value).toFixed(1)}`).join(' ');
  const last = points.length - 1;
  const ref = refValue == null ? '' : `
    <line x1="${pad.l}" x2="${W - pad.r}" y1="${y(refValue)}" y2="${y(refValue)}" class="c-ref"/>
    <text x="${W - pad.r + 3}" y="${y(refValue) + 4}" class="c-tick">${esc(refLabel)}</text>`;

  container.innerHTML = `
    <div class="chart">
      <svg viewBox="0 0 ${W} ${H}" class="c-svg" role="img" aria-label="Line chart">
        ${grid}${ref}
        <path d="${path}" class="c-line"/>
        <circle cx="${x(last)}" cy="${y(points[last].value)}" r="4.5" class="c-dot"/>
        <text x="${x(last)}" y="${y(points[last].value) - 9}" class="c-val" text-anchor="middle">${points[last].value}</text>
        <line class="c-cross" y1="${pad.t}" y2="${H - pad.b}" visibility="hidden"/>
        <circle class="c-hover" r="4.5" visibility="hidden"/>
        <rect x="${pad.l - 10}" y="0" width="${W - pad.l - pad.r + 20}" height="${H}" fill="transparent" class="c-hit"/>
      </svg>
      <div class="c-tip" hidden><strong></strong><span></span></div>
    </div>`;

  const svg = container.querySelector('svg');
  const cross = svg.querySelector('.c-cross');
  const dot = svg.querySelector('.c-hover');
  const tip = container.querySelector('.c-tip');

  function show(e) {
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const p = pt.matrixTransform(svg.getScreenCTM().inverse());
    let best = 0;
    points.forEach((_, i) => { if (Math.abs(x(i) - p.x) < Math.abs(x(best) - p.x)) best = i; });
    const cx = x(best);
    const cy = y(points[best].value);
    cross.setAttribute('x1', cx);
    cross.setAttribute('x2', cx);
    cross.setAttribute('visibility', 'visible');
    dot.setAttribute('cx', cx);
    dot.setAttribute('cy', cy);
    dot.setAttribute('visibility', 'visible');
    tip.querySelector('strong').textContent = points[best].value;
    tip.querySelector('span').textContent = points[best].label;
    tip.hidden = false;
    const left = (cx / W) * 100;
    tip.style.left = `${Math.min(80, Math.max(20, left))}%`;
  }
  function hide() {
    cross.setAttribute('visibility', 'hidden');
    dot.setAttribute('visibility', 'hidden');
    tip.hidden = true;
  }
  // Mouse: follow the pointer. Touch: a tap shows the readout for a few seconds,
  // since lifting the finger fires pointerleave straight away.
  let hideTimer;
  svg.addEventListener('pointermove', show);
  svg.addEventListener('pointerdown', (e) => {
    show(e);
    clearTimeout(hideTimer);
    if (e.pointerType === 'touch') hideTimer = setTimeout(hide, 4000);
  });
  svg.addEventListener('pointerleave', (e) => {
    if (e.pointerType !== 'touch') hide();
  });
}

// Tiny trend line for a stat tile: de-emphasized line, latest point highlighted.
export function sparkline(values, { width = 300, height = 48 } = {}) {
  if (values.length < 2) return '';
  const pad = 5;
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const x = (i) => pad + (i * (width - pad * 2)) / (values.length - 1);
  const y = (v) => pad + (1 - (v - lo) / (hi - lo || 1)) * (height - pad * 2);
  const d = values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
  const last = values.length - 1;
  return `<svg class="spark" viewBox="0 0 ${width} ${height}" role="img" aria-label="Last ${values.length} scores: ${values.join(', ')}">
    <path d="${d}" class="spark-line"/>
    <circle cx="${x(last)}" cy="${y(values[last])}" r="4" class="spark-dot"/>
  </svg>`;
}

// Calendar of the last `weeks` weeks: one column per week (Monday on top), one cell per day.
// `days` maps 'YYYY-MM-DD' to { level: -2..2, label, href }; level picks the diverging shade
// (0 = about your average), label is the tooltip, href is where a tap goes. Other days are blank.
export function calendarHeat(days, { weeks = 26, today = new Date() } = {}) {
  const cell = 13;
  const gap = 2;
  const step = cell + gap;
  const left = 16; // weekday letters
  const top = 14;  // month names
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate() - ((today.getDay() + 6) % 7) - (weeks - 1) * 7);
  const pad = (n) => String(n).padStart(2, '0');
  const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  let cells = '';
  let months = '';
  for (let w = 0; w < weeks; w++) {
    for (let r = 0; r < 7; r++) {
      const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + w * 7 + r);
      if (d > today) break;
      // Name each month in the week it starts; the first column too, unless a new month is close.
      if (d.getDate() === 1 || (w === 0 && r === 0 && d.getDate() <= 14)) {
        months += `<text class="c-tick" x="${left + w * step}" y="10">${d.toLocaleDateString(undefined, { month: 'short' })}</text>`;
      }
      const x = left + w * step;
      const y = top + r * step;
      const day = days.get(iso(d));
      cells += day
        ? `<a href="${esc(day.href)}"><rect class="cal-day cal-${day.level + 2}" x="${x}" y="${y}" width="${cell}" height="${cell}" rx="3"><title>${esc(day.label)}</title></rect></a>`
        : `<rect class="cal-empty" x="${x}" y="${y}" width="${cell}" height="${cell}" rx="3"/>`;
    }
  }
  const letters = [[0, 'M'], [2, 'W'], [4, 'F']].map(([r, t]) =>
    `<text class="c-tick" x="0" y="${top + r * step + cell - 3}">${t}</text>`).join('');
  return `<svg class="cal" viewBox="0 0 ${left + weeks * step} ${top + 7 * step}" role="img" aria-label="Days you bowled in the last ${weeks} weeks">
    ${months}${letters}${cells}
  </svg>`;
}

// rows: [{ label, value, display }]. Values are drawn relative to `max` (default: largest value).
export function barList(rows, { max = null } = {}) {
  const top = max ?? Math.max(1, ...rows.map((r) => r.value));
  return `<div class="bars">${rows.map((r) => `
    <div class="bar-row">
      <span class="bar-label">${esc(r.label)}</span>
      <span class="bar-track"><span class="bar-fill" style="width:${Math.max(r.value ? 2 : 0, (r.value / top) * 100)}%"></span></span>
      <span class="bar-val">${esc(r.display ?? r.value)}</span>
    </div>`).join('')}</div>`;
}
