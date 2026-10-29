// Help: how to use the app plus a beginner glossary.

import { db } from '../storage.js';
import { GLOSSARY } from '../terms.js';
import { mountLaneMap } from '../lanemap.js';
import { topbar } from '../ui.js';
import { esc } from '../util.js';

const ORDER = ['boards', 'feet', 'arrows', 'breakpoint', 'hit', 'strike', 'spare', 'split', 'spareAim', 'speed', 'oil', 'quick'];

export function render(root) {
  root.innerHTML = `
    ${topbar({ title: 'Help &amp; glossary' })}
    <div class="page help">
      <section class="card">
        <h3>Logging a ball</h3>
        <ol>
          <li><strong>Pins:</strong> tap the pins still standing. Strike? Don't tap anything and press Save.</li>
          <li><strong>Your line:</strong> tap the lane where your feet started, the arrow the ball rolled over, and (optionally) where it started to hook. Your last feet and arrow are filled in for you.</li>
          <li><strong>More details</strong> (optional): pin hit, ball speed, how it felt.</li>
          <li>Press <strong>Save</strong>. Made a mistake? <strong>Undo</strong> brings the last ball back so you can fix it.</li>
        </ol>
        <p class="hint">In a hurry? <strong>Pins only</strong> under the lane switches to quick mode, which saves just the pins.</p>
      </section>

      <section class="card">
        <h3>Getting better</h3>
        <ol>
          <li><strong>Spare aim:</strong> on a spare ball the app suggests where to stand and which arrow to hit (the 3-6-9 system). Tap <strong>Use</strong> to put it on the lane.</li>
          <li><strong>Spare practice</strong> (Home): pick a leave, throw at it, and tap Made or Missed. You'll see your make rate for each leave grow over time.</li>
          <li><strong>Goals</strong> (Home): set a target, like 60% spares, and watch your last 10 games close in on it.</li>
          <li><strong>Stats</strong> shows what's working: best lines, how accurate you are, how your speed and feel affect strikes, and how your scores change from game to game.</li>
        </ol>
      </section>

      <section class="card">
        <h3>Reading the lane</h3>
        <p class="hint">A lane is 60 feet from the foul line to the head pin. This one is drawn to scale along its length; the width is stretched so you can see the 39 boards. The numbers on the edge are feet from the foul line.</p>
        <p class="hint">Try it: tap the approach to move your feet, the front of the lane to pick an arrow, and further down to set where the ball hooks. Nothing here is saved.</p>
        <div id="demoLane"></div>
      </section>

      <section class="card tip">
        <strong>${GLOSSARY.followMiss.title}</strong>
        <p>${esc(GLOSSARY.followMiss.text).replace(/\n\n/g, '</p><p>')}</p>
      </section>

      <section class="card">
        <h3>Glossary</h3>
        <dl class="glossary">
          ${ORDER.map((k) => `<dt>${esc(GLOSSARY[k].title)}</dt><dd>${esc(GLOSSARY[k].text).replace(/\n\n/g, '<br><br>')}</dd>`).join('')}
        </dl>
      </section>

      <section class="card">
        <h3>Install on your phone</h3>
        <p>Open this page in Chrome or Samsung Internet, open the menu (⋮ or ☰), and choose <strong>Add to Home screen</strong> or <strong>Install app</strong>. It then opens like a normal app and works without internet.</p>
      </section>
    </div>`;

  mountLaneMap(root.querySelector('#demoLane'), {
    hand: db.settings.hand,
    value: { feet: 20, target: 10, breakpoint: 7 },
  });
}
