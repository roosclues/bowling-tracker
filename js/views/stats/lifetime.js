// Stats → Lifetime: totals since your first game, score spread and milestones.

import { db } from '../../storage.js';
import { lifetimeTotals, scoreSpread } from '../../stats.js';
import { milestones, nextMilestones, milestoneProgress } from '../../milestones.js';
import { barList } from '../../charts.js';
import { infoButton } from '../../terms.js';
import { kvRow } from '../../ui.js';
import { esc, fmtShortDate, formatDate, pct, plural } from '../../util.js';
import { tile } from './parts.js';

const REACHED_SHOWN = 5; // milestones listed before the rest fold under "Earlier"

// What the tiles and Overview's Personal bests don't already show.
function soFarCard(t) {
  const center = t.centers[0];
  const ball = t.balls[0];
  const since = formatDate(new Date(`${t.firstDate}T00:00`), { month: 'short', day: 'numeric', year: 'numeric' });
  return `
    <section class="card" id="lifetime">
      <div class="card-h"><h3>Your bowling so far</h3></div>
      <ul class="kv">
        ${kvRow('Bowling since', since, { sub: `${plural(t.sessions, 'session')} · ${plural(t.days, 'day')} bowled`, text: true })}
        ${kvRow('Frames bowled', t.frames.toLocaleString())}
        ${kvRow('Splits picked up', t.splitsMade)}
        ${kvRow(`Clean games ${infoButton('clean')}`, t.cleanGames, { sub: 'no open frames' })}
        ${center ? kvRow('Centers', t.centers.length, { sub: `most at ${esc(center.name)} · ${plural(center.games, 'game')}` }) : ''}
        ${ball ? kvRow('Favorite ball', esc(ball.name), { sub: plural(ball.games, 'game'), text: true }) : ''}
      </ul>
    </section>`;
}

function spreadCard(st) {
  const s = scoreSpread(st);
  return `
    <section class="card" id="spread">
      <div class="card-h"><h3>Score spread</h3><small>${plural(s.games, 'game')}</small></div>
      ${barList(s.rows.map((r) => ({ label: r.label, value: r.value, display: r.value ? `${r.value} · ${pct(r.value, s.games)}%` : '0' })))}
      <p class="hint">You break 150 in <strong>${s.pct150}%</strong> of your games and 200 in <strong>${s.pct200}%</strong>.</p>
    </section>`;
}

function milestonesCard() {
  const list = milestones(db.sessions);
  const got = list.filter((m) => m.done).sort((a, b) => b.done.date.localeCompare(a.done.date));
  const next = nextMilestones(list);
  const locked = list.filter((m) => !m.done);
  const row = (m) => kvRow(esc(m.label), '', { side: fmtShortDate(m.done.date), href: `#/summary/${m.done.sid}/${m.done.gid}` });
  const todo = (m) => kvRow(esc(m.label), milestoneProgress(m), { text: true });
  return `
    <section class="card" id="milestones">
      <div class="card-h"><h3>Milestones</h3><small>${got.length} of ${list.length}</small></div>
      ${next.length ? `
        <h4 class="sub-h">Next up</h4>
        <ul class="kv todo" id="nextUp">${next.map(todo).join('')}</ul>` : ''}
      ${got.length ? `
        <h4 class="sub-h">Reached</h4>
        <ul class="kv side linked" id="reached">${got.slice(0, REACHED_SHOWN).map(row).join('')}</ul>` : ''}
      ${got.length > REACHED_SHOWN ? `
        <details class="table-view" id="reachedEarlier">
          <summary>Earlier (${got.length - REACHED_SHOWN})</summary>
          <ul class="kv side linked">${got.slice(REACHED_SHOWN).map(row).join('')}</ul>
        </details>` : ''}
      ${locked.length ? `
        <details class="table-view">
          <summary>Still to reach (${locked.length})</summary>
          <ul class="kv todo">${locked.map(todo).join('')}</ul>
        </details>` : ''}
      <p class="hint">Milestones count all your games, whatever the filters above. Tap one to open the game where you reached it.</p>
    </section>`;
}

function lifetimeBody(st) {
  const t = lifetimeTotals(st);
  return `
    <div class="tiles">
      ${tile(t.games.toLocaleString(), 'Games')}
      ${tile(t.pins.toLocaleString(), 'Total pins')}
      ${tile(t.strikes.toLocaleString(), 'Strikes')}
      ${tile(t.sparesMade.toLocaleString(), 'Spares made')}
      ${tile(t.turkeys, `Turkeys ${infoButton('turkey')}`)}
      ${tile(t.over200, '200+ games')}
    </div>
    ${soFarCard(t)}
    ${spreadCard(st)}
    ${milestonesCard()}`;
}

export const body = ({ st }) => lifetimeBody(st);
