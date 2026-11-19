// Stats → Feel: how the "how it felt" tags line up with strikes.

import { esc, fmtPct } from '../../util.js';
import { table } from './parts.js';

function feelCard(st) {
  if (!st.feel.length) {
    return `
      <section class="card" id="feel">
        <div class="card-h"><h3>How it felt</h3></div>
        <p class="hint">Set What to log to Everything and tag how balls felt ("Rushed", "Good release"…) to see how each feeling lines up with your strikes.</p>
      </section>`;
  }
  return `
    <section class="card" id="feel">
      <div class="card-h"><h3>How it felt</h3><small>and what it did to strikes</small></div>
      ${table(`
        <thead><tr><th>Tag</th><th class="num">Times</th><th class="num">Strike</th></tr></thead>
        <tbody>${st.feel.map((f) => `
          <tr><td>${esc(f.tag)}</td><td class="num">${f.n}</td><td class="num">${f.firstN >= 3 ? fmtPct(f.strikes, f.firstN) : '–'}</td></tr>`).join('')}</tbody>`)}
      <p class="hint">Strike rate on 1st balls with that tag, once there are 3. Your overall strike rate is ${fmtPct(st.strikes, st.firstBalls)}.</p>
    </section>`;
}

export const body = ({ st }) => feelCard(st);
