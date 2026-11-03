// Help: how to use the app plus a beginner glossary.

import { db } from '../storage.js';
import { GLOSSARY } from '../terms.js';
import { mountLaneMap } from '../lanemap.js';
import { topbar } from '../ui.js';
import { esc } from '../util.js';

const ORDER = ['boards', 'feet', 'arrows', 'breakpoint', 'hit', 'carry', 'strike', 'spare', 'split', 'spareAim', 'speed', 'oil', 'log', 'laneNotes'];

export function render(root) {
  root.innerHTML = `
    ${topbar({ title: 'Help &amp; glossary' })}
    <div class="page help">
      <section class="card">
        <h3>Logging a ball</h3>
        <ol>
          <li><strong>Pins:</strong> tap the pins still standing. Strike? Don't tap anything and press Save.</li>
          <li><strong>Your line:</strong> your last feet and arrow are filled in for you. Moved? Tap the arrows next to Feet or Arrow to move a board, or <strong>Change</strong> to tap the lane. The first time, tap the lane where your feet started and the arrow the ball rolled over.</li>
          <li>Press <strong>Save</strong>. Made a mistake? <strong>Undo</strong> brings the last ball back so you can fix it.</li>
        </ol>
        <p class="hint"><strong>What to log</strong>, at the bottom of the game screen, sets how much you enter. <strong>Pins only</strong> is quickest. <strong>Everything</strong> adds the breakpoint, pin hit, ball speed and how it felt. After the game, tap any ball on the summary, or <strong>Add details</strong>, to fill in your feet, arrow and the rest. Each ball starts from the line of the ball before it, and the pins stay as you entered them.</p>
      </section>

      <section class="card">
        <h3>Getting better</h3>
        <ol>
          <li><strong>Coach</strong> (tab bar, or the speech bubble next to your score during a game): before you bowl it tells you where to start, during a game it reads your last balls and says when to move your feet or arrow, and after a session it sums up your day. Tap a question to ask more.</li>
          <li><strong>Spare aim:</strong> on a spare ball the app suggests where to stand and which arrow to hit (the 3-6-9 system). A spare you haven't logged before starts on it; otherwise tap <strong>Use</strong> under your line. Missed one? Tap <strong>Left</strong> or <strong>Right</strong> under the pins: after a few tries the aim moves a board or two toward what works for you.</li>
          <li><strong>Spare practice</strong> (Home): pick a leave, throw at it, and tap Made, or Left or Right for the way it missed. You'll see your make rate for each leave grow over time.</li>
          <li><strong>Lane notes</strong> (session and game summary screens): mark a lane Avoid or Good and note what was wrong. Home and the session form remind you next time, so you can ask for another lane.</li>
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
