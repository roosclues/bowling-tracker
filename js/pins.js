// Tappable pin deck, drawn from the bowler's view (head pin closest, 7-10 at the back).
// Pins not in `available` were knocked down by an earlier ball and can't be tapped.

import { ALL_PINS, PIN_POS } from './scoring.js';
import { buzz } from './device.js';

const COL = 31;
const ROW = 46;
const R = 22;
const W = COL * 6 + R * 2 + 8;
const H = ROW * 3 + R * 2 + 8;

function pinXY(pin) {
  const [row, col] = PIN_POS[pin];
  return [W / 2 + col * COL, H - R - 4 - row * ROW];
}

// `standing` is a Set that is mutated in place.
export function mountPins(container, { available, standing, readOnly = false, onChange }) {
  const avail = new Set(available);
  // Pins seen from above: white body, red neck ring, number on the head.
  container.innerHTML = `
    <div class="deck">
      <svg class="pins${readOnly ? ' readonly' : ''}" viewBox="0 0 ${W} ${H}" role="group" aria-label="Pins left standing">
        ${ALL_PINS.map((p) => {
          const [x, y] = pinXY(p);
          return `<g class="pin" data-pin="${p}" role="button" aria-label="Pin ${p}" tabindex="${readOnly || !avail.has(p) ? -1 : 0}">
            <circle class="pin-hit" cx="${x}" cy="${y}" r="${R + 4}"/>
            <circle class="pin-body" cx="${x}" cy="${y}" r="${R}"/>
            <circle class="pin-ring" cx="${x}" cy="${y}" r="${R * 0.62}"/>
            <text x="${x}" y="${y + 5}">${p}</text>
          </g>`;
        }).join('')}
      </svg>
    </div>`;

  const svg = container.querySelector('svg');

  function refresh() {
    for (const g of svg.querySelectorAll('.pin')) {
      const p = Number(g.dataset.pin);
      g.classList.toggle('gone', !avail.has(p));
      g.classList.toggle('up', standing.has(p));
      g.setAttribute('aria-pressed', standing.has(p) ? 'true' : 'false');
    }
  }

  function toggle(p) {
    if (readOnly || !avail.has(p)) return;
    if (standing.has(p)) standing.delete(p);
    else standing.add(p);
    buzz();
    refresh();
    onChange?.(standing);
  }

  svg.addEventListener('click', (e) => {
    const g = e.target.closest('.pin');
    if (g) toggle(Number(g.dataset.pin));
  });
  svg.addEventListener('keydown', (e) => {
    const g = e.target.closest('.pin');
    if (g && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      toggle(Number(g.dataset.pin));
    }
  });

  refresh();
  return { refresh };
}

// Small static pin diagram for lists (e.g. "most common leaves").
export function miniPins(standing, size = 44) {
  const set = new Set(standing);
  return `<svg class="mini-pins" viewBox="0 0 ${W} ${H}" width="${size}" height="${Math.round(size * H / W)}" aria-label="Pins ${standing.join(', ')}">
    ${ALL_PINS.map((p) => {
      const [x, y] = pinXY(p);
      return `<circle cx="${x}" cy="${y}" r="${R - 4}" class="${set.has(p) ? 'up' : ''}"/>`;
    }).join('')}
  </svg>`;
}
