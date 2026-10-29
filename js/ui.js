// Shared UI pieces: line icons, the screen top bar, coaching tips, spare aim, label/value rows.

import { infoButton } from './terms.js';
import { esc } from './util.js';

const PATHS = {
  home: '<path d="M3.5 10.5 12 3.5l8.5 7"/><path d="M5.5 9v11h4.5v-6h4v6h4.5V9"/>',
  ball: '<circle cx="12" cy="12" r="9"/><circle cx="9.3" cy="9.2" r="1.3" fill="currentColor" stroke="none"/><circle cx="13.2" cy="7.9" r="1.3" fill="currentColor" stroke="none"/><circle cx="12.4" cy="11.8" r="1.4" fill="currentColor" stroke="none"/>',
  stats: '<path d="M4 20h16"/><path d="M7 16v-5"/><path d="M12 16V6"/><path d="M17 16v-8"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.6 9.4a2.5 2.5 0 1 1 3.6 2.3c-.8.4-1.2.9-1.2 1.7v.4"/><circle cx="12" cy="16.8" r="1" fill="currentColor" stroke="none"/>',
  settings: '<path d="M4 7h9"/><path d="M19 7h1"/><circle cx="16" cy="7" r="2.5"/><path d="M4 17h2"/><path d="M12 17h8"/><circle cx="9" cy="17" r="2.5"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  chevL: '<path d="M14.5 6l-6 6 6 6"/>',
  chevR: '<path d="M9.5 6l6 6-6 6"/>',
  x: '<path d="M7 7l10 10M17 7 7 17"/>',
  undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16v4z"/><path d="m13.5 6.5 4 4"/>',
  trash: '<path d="M4 7h16"/><path d="M9.5 7V4.5h5V7"/><path d="M6 7l1 13h10l1-13"/>',
  download: '<path d="M12 4v11"/><path d="m7 10 5 5 5-5"/><path d="M5 20h14"/>',
  upload: '<path d="M12 15V4"/><path d="m7 9 5-5 5 5"/><path d="M5 20h14"/>',
  share: '<circle cx="18" cy="5.5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="18.5" r="2.5"/><path d="m8.2 10.8 7.6-4.1M8.2 13.2l7.6 4.1"/>',
  table: '<rect x="4" y="5" width="16" height="14" rx="2"/><path d="M4 10h16M10 10v9"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  list: '<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1" fill="currentColor" stroke="none"/><circle cx="4.5" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="4.5" cy="18" r="1" fill="currentColor" stroke="none"/>',
  target: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"/>',
  flag: '<path d="M5 21V4"/><path d="M5 4h12l-2.5 4L17 12H5"/>',
  refresh: '<path d="M19.5 11A7.5 7.5 0 0 0 6 6.5L4.5 8"/><path d="M4.5 4v4h4"/><path d="M4.5 13A7.5 7.5 0 0 0 18 17.5l1.5-1.5"/><path d="M19.5 20v-4h-4"/>',
};

export function icon(name, size = 22) {
  return `<svg class="ico" viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${PATHS[name]}</svg>`;
}

// Coaching tips from stats.tips(). Text can name a bowling center, so it's escaped.
export function tipsHTML(list) {
  return list.map((t) => `
    <div class="tip"><strong>${esc(t.title)}</strong><p>${esc(t.text)}</p>${
      t.link ? `<a class="link tip-link" href="${esc(t.link.href)}">${esc(t.link.label)} →</a>` : ''}${
      t.basis ? `<small class="basis">${esc(t.basis)}</small>` : ''}</div>`).join('');
}

// The suggested spare line from spares.spareAim(). `use` adds a button that puts it on the lane.
export function aimHTML(aim, { label = 'Spare aim', use = false, info = true, id = 'aim' } = {}) {
  return `<p class="aim" id="${id}">${icon('target', 18)}<span>${label}: feet <b>${aim.feet}</b> · arrow <b>${aim.target}</b></span>${
    info ? infoButton('spareAim') : ''}${use ? '<button type="button" class="link" data-act="aim">Use</button>' : ''}</p>`;
}

// One label/value row of a `.kv` list. `note` sits next to the value, `side` on the right.
export function kvRow(label, value, { note = '', side = '' } = {}) {
  return `
    <li>
      <span class="kv-label">${label}</span>
      <span class="kv-val"><strong>${value}</strong>${note ? ` <span class="kv-note">${note}</span>` : ''}</span>
      <span class="kv-date">${side}</span>
    </li>`;
}

// Sticky header. `back` is a hash link; `right` is extra HTML (already escaped).
export function topbar({ back = '', title = '', sub = '', right = '' } = {}) {
  return `
    <header class="topbar">
      ${back ? `<a href="${back}" class="tb-back" aria-label="Back">${icon('back', 24)}</a>` : ''}
      <div class="tb-title">
        <div class="t1">${title}</div>
        ${sub ? `<div class="t2">${sub}</div>` : ''}
      </div>
      ${right}
    </header>`;
}
