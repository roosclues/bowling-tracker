// Spare practice: pick a leave, throw at it, tap Made or Missed. Make rates per leave build up
// over time, kept apart from game stats (Stats shows them next to each leave).

import { db, save } from '../storage.js';
import { ALL_PINS } from '../scoring.js';
import { computeStats, strikeLine, practiceByLeave } from '../stats.js';
import { spareAim, aimText, DEFAULT_LINE } from '../spares.js';
import { mountPins, miniPins } from '../pins.js';
import { mountLane } from '../lane.js';
import { infoButton } from '../terms.js';
import { topbar, icon, aimHTML } from '../ui.js';
import { buzz, celebrate } from '../device.js';
import { fmtPct, todayISO, toast, uid, tapGuard } from '../util.js';

// Leaves worth practising for everyone, offered after your own most common leaves.
const COMMON = [[10], [7], [3, 6, 10], [2, 4, 5, 8], [6, 10], [3], [2], [4, 7]];
const MAX_CHOICES = 8;

let leave = new Set([10]); // pins being practised, mutated in place by the pin deck
let line = null;           // { feet, target, breakpoint } shown on the lane
let lineFor = '';          // what `line` was set up for: a new leave, hand or aim starts it over
const once = tapGuard();

const keyOf = (pins) => [...pins].sort((a, b) => a - b).join('-');

// Entry from the router. `param` is an optional leave like "3-6-10" (from Stats).
export function render(root, param) {
  const pins = (param ?? '').split('-').map(Number).filter((p) => ALL_PINS.includes(p));
  if (pins.length) leave = new Set(pins);
  draw(root);
}

function draw(root) {
  const hand = db.settings.hand;
  const key = keyOf(leave);
  const sorted = key ? key.split('-').map(Number) : [];
  const fullRack = sorted.length === ALL_PINS.length;
  const st = computeStats(db.sessions);
  const fromLine = strikeLine(st);
  const aim = sorted.length && !fullRack ? spareAim(sorted, fromLine, hand) : null;
  const lineKey = `${key}|${hand}|${aim?.feet}|${aim?.target}`;
  if (lineFor !== lineKey) {
    line = { feet: aim?.feet ?? null, target: aim?.target ?? null, breakpoint: null };
    lineFor = lineKey;
  }

  const today = todayISO();
  const byLeave = practiceByLeave(db.practice, today);
  const mine = byLeave.get(key) ?? { n: 0, made: 0, todayN: 0, todayMade: 0 };
  const todayAll = db.practice.filter((p) => p.date === today);
  const history = [...byLeave.values()].sort((a, b) => b.n - a.n);

  const choices = [];
  // Your own leaves first (not a full rack: that's a missed ball, not a spare to practise).
  const own = st.leaves.filter((x) => x.standing.length < ALL_PINS.length).slice(0, 5).map((x) => x.standing);
  for (const l of [...own, ...COMMON]) {
    if (choices.length < MAX_CHOICES && !choices.some((c) => keyOf(c) === keyOf(l))) choices.push(l);
  }

  root.innerHTML = `
    ${topbar({ back: '#/', title: 'Spare practice' })}
    <div class="page">
      <section class="card">
        <div class="card-h"><h3>Which leave?</h3><small>or tap the pins</small></div>
        <div class="seg wrap leave-pick">
          ${choices.map((c) => {
            const on = keyOf(c) === key;
            return `<button type="button" class="chip${on ? ' on' : ''}" data-leave="${keyOf(c)}" aria-pressed="${on}">${keyOf(c)}</button>`;
          }).join('')}
        </div>
        <div id="pins"></div>
      </section>

      ${aim ? `
      <section class="card">
        <div class="card-h"><h3>Where to aim</h3>${infoButton('spareAim')}</div>
        ${aimHTML(aim, { label: 'Aim', info: false, id: 'practiceAim' })}
        <p class="hint">${aimText(aim)}</p>
        ${fromLine ? '' : `<p class="hint">This starts from feet ${DEFAULT_LINE.feet} and the board ${DEFAULT_LINE.target} arrow. Once you log games with your line, it starts from your own strike line.</p>`}
        <p class="hint">Change the lane below to the line you actually used. Your feet and arrow are saved with each try.</p>
        <div id="lane"></div>
      </section>` : ''}

      <section class="card" id="tally">
        <div class="card-h"><h3>Today</h3><small>${key && !fullRack ? `the ${key}` : 'pick a leave'}</small></div>
        <div class="tiles">
          <div class="tile"><div class="tv">${mine.todayMade}/${mine.todayN}</div><div class="tl">This leave today</div></div>
          <div class="tile"><div class="tv">${fmtPct(mine.made, mine.n)}</div><div class="tl">This leave, all time</div></div>
          <div class="tile"><div class="tv">${todayAll.filter((p) => p.made).length}/${todayAll.length}</div><div class="tl">All leaves today</div></div>
        </div>
      </section>

      ${history.length ? `
      <section class="card">
        <div class="card-h"><h3>Your practice</h3><small>made / tries</small></div>
        <div class="tbl-wrap"><table class="tbl">
          <thead><tr><th>Leave</th><th class="num">Today</th><th class="num">All time</th><th class="num">Rate</th></tr></thead>
          <tbody>${history.map((h) => `
            <tr>
              <td><span class="leave-cell">${miniPins(h.leave, 28)} ${h.leave.join('-')}</span></td>
              <td class="num">${h.todayN ? `${h.todayMade}/${h.todayN}` : '–'}</td>
              <td class="num">${h.made}/${h.n}</td>
              <td class="num">${fmtPct(h.made, h.n)}</td>
            </tr>`).join('')}</tbody>
        </table></div>
      </section>` : ''}
    </div>
    <div class="actionbar">
      <button type="button" class="btn icon-only" data-act="undo" aria-label="Undo last try">${icon('undo', 20)}</button>
      <button type="button" class="btn" data-act="miss">Missed</button>
      <button type="button" class="btn primary" data-act="made">${icon('check', 20)} Made</button>
    </div>`;

  mountPins(root.querySelector('#pins'), { available: ALL_PINS, standing: leave, onChange: () => draw(root) });
  if (aim) mountLane(root.querySelector('#lane'), { hand, value: line });

  root.onclick = (e) => {
    const el = e.target.closest('button');
    if (!el) return;
    if (el.dataset.leave) {
      leave = new Set(el.dataset.leave.split('-').map(Number));
      draw(root);
      return;
    }
    const act = el.dataset.act;
    if (!['made', 'miss', 'undo'].includes(act) || !once()) return;

    if (act === 'undo') {
      if (db.practice.at(-1)?.date !== today) {
        toast('Nothing to undo today');
        return;
      }
      const p = db.practice.pop();
      // The day's first try counted toward the backup reminder; taking it back undoes that.
      if (todayAll.length === 1 && db.settings.sessionsSinceBackup > 0) db.settings.sessionsSinceBackup--;
      save();
      toast(`Took back a ${p.made ? 'made' : 'missed'} try on the ${p.leave.join('-')}`);
      draw(root);
      return;
    }
    if (!sorted.length || fullRack) {
      toast(fullRack ? 'That\'s a full rack. Tap the pins left standing to practise a spare.' : 'Tap the pins you are practising first');
      return;
    }
    // A day of practice counts like a session toward the backup reminder.
    if (!todayAll.length) db.settings.sessionsSinceBackup = (db.settings.sessionsSinceBackup || 0) + 1;
    const made = act === 'made';
    db.practice.push({ id: uid(), date: today, leave: sorted, made, feet: line.feet, target: line.target });
    save();
    if (made) {
      celebrate('spare');
      buzz(18);
    } else {
      buzz(10);
    }
    draw(root);
  };
}
