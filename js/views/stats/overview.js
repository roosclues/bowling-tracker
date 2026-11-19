// Stats → Overview: headline numbers, are you improving, the calendar, personal bests, tips and the score chart.

import { progress, personalBests, sessionAverages, sparePinsLost, scoreSwing, rollingAverage } from '../../stats.js';
import { lineChart, calendarHeat } from '../../charts.js';
import { tipsHTML } from '../../ui.js';
import { fmtPct, fmtDate, plural, avg } from '../../util.js';
import { STATE_WORD, table, tile, progressRows, bestRow } from './parts.js';

const ROLL = 5;          // games in the rolling average on the score chart
const ROLL_FROM = 6;     // games before the rolling average is drawn
const COST_SHOWN = 5;    // pins a game that missed spares must cost before Overview mentions it
const COST_MIN_GAMES = 3; // ...and the finished games it needs first
const CAL_NEAR = 5;  // pins from your average for the lighter calendar shades
const CAL_FAR = 15;  // ...and for the darkest
let trendBy = null; // 'session' or 'game'; picked automatically until you choose
let trend = null; // the score chart card, drawn once it is on the page

function verdict(rows) {
  const [avgRow, ...rest] = rows;
  const d = Number(avgRow.to) - Number(avgRow.from);
  const gains = rest.filter((r) => r.state === 'better').slice(0, 2)
    .map((r) => `${r.label.toLowerCase()} (${r.from} → ${r.to})`);
  let text;
  if (d >= 5) text = `<strong>You're improving!</strong> Your average went from ${avgRow.from} to ${avgRow.to} (+${d} pins).`;
  else if (d <= -5) text = `<strong>Your average dipped</strong> from ${avgRow.from} to ${avgRow.to}. Every bowler has ups and downs; the rows below show what changed.`;
  else text = `<strong>Your average is steady</strong> (${avgRow.from} → ${avgRow.to}).`;
  if (gains.length) text += ` Getting better: ${gains.join(' and ')}.`;
  return text;
}

function progressCard(p, games) {
  if (!p) {
    return `
      <section class="card" id="progress">
        <div class="card-h"><h3>Are you improving?</h3></div>
        <p class="hint">Bowl at least 4 games and this compares your first games with your latest ones. You have ${games} so far.</p>
      </section>`;
  }
  const rows = progressRows(p);
  return `
    <section class="card" id="progress">
      <div class="card-h"><h3>Are you improving?</h3><small>first ${p.k} vs last ${p.k} games</small></div>
      <p class="verdict">${verdict(rows)}</p>
      ${table(`
        <thead><tr><th></th><th class="num">First ${p.k}</th><th class="num">Last ${p.k}</th><th class="num">Change</th></tr></thead>
        <tbody>${rows.map((r) => `
          <tr>
            <td>${r.label}</td>
            <td class="num">${r.from}</td>
            <td class="num"><strong>${r.to}</strong></td>
            <td class="num trend ${r.state}">${r.mark} ${STATE_WORD[r.state]}</td>
          </tr>`).join('')}</tbody>`, 'progress')}
      <p class="hint">Spares made and open frames are usually where a new bowler's score goes up fastest. Numbers jump around over a few games, so the more you log, the more you can trust this.</p>
    </section>`;
}

// Each day you bowled, shaded by how its average compares with your average over these games.
function calendarCard(sessions, st) {
  if (!st.games.length) return '';
  const byDay = new Map();
  for (const s of sessions) {
    const e = byDay.get(s.date) ?? { scores: [], sid: s.id };
    e.scores.push(...s.games.filter((g) => g.done).map((g) => g.score));
    e.sid = s.id; // the day's last session
    byDay.set(s.date, e);
  }
  const days = new Map();
  for (const [date, e] of byDay) {
    if (!e.scores.length) continue;
    const dayAvg = Math.round(avg(e.scores));
    const diff = dayAvg - Math.round(st.average);
    const level = diff >= CAL_FAR ? 2 : diff >= CAL_NEAR ? 1 : diff <= -CAL_FAR ? -2 : diff <= -CAL_NEAR ? -1 : 0;
    days.set(date, {
      level,
      href: `#/session/${e.sid}`,
      label: `${fmtDate(date)} · ${plural(e.scores.length, 'game')} · average ${dayAvg} (${diff > 0 ? '+' : ''}${diff})`,
    });
  }
  return `
    <section class="card" id="calendar">
      <div class="card-h"><h3>When you bowled</h3><small>last 26 weeks</small></div>
      ${calendarHeat(days)}
      <div class="cal-key" aria-hidden="true">
        <span>Below your average</span>
        ${[0, 1, 2, 3, 4].map((l) => `<i class="cal-${l}"></i>`).join('')}
        <span>Above</span>
      </div>
      <p class="hint">Middle shade = within ${CAL_NEAR - 1} pins of your average (${Math.round(st.average)}); darkest = ${CAL_FAR}+ pins off. Tap a day to open it.</p>
    </section>`;
}

const STREAK_NAMES ={ 2: 'a double', 3: 'a turkey', 12: 'a perfect game!' };

function bestsCard(b) {
  if (!b) return '';
  const streak = b.streak.streak;
  return `
    <section class="card" id="bests">
      <div class="card-h"><h3>Personal bests</h3><small>date first set</small></div>
      <ul class="kv side linked">
        ${bestRow('High game', b.high.score, b.high)}
        ${b.session ? bestRow('Best session average', Math.round(b.session.average), b.session, plural(b.session.games, 'game')) : ''}
        ${bestRow('Most strikes in a game', b.strikes.strikes, b.strikes)}
        ${streak ? bestRow('Strikes in a row', streak, b.streak, STREAK_NAMES[streak] ?? (streak >= 4 ? `a ${streak}-bagger` : '')) : ''}
        ${bestRow('Fewest open frames', b.fewestOpens.opens, b.fewestOpens, b.fewestOpens.opens === 0 ? 'a clean game!' : '')}
        ${b.series ? bestRow('High series', b.series.score, b.series, '3 games') : ''}
      </ul>
    </section>`;
}

function trendCard(st, perSession) {
  const by = trendBy ?? (perSession.length >= 2 ? 'session' : 'game');
  const points = by === 'session'
    ? perSession.map((x) => ({ value: Math.round(x.average), label: `${fmtDate(x.session.date)} · ${plural(x.games, 'game')}` }))
    : st.games.map((g) => ({ value: g.game.score, label: `${fmtDate(g.session.date)} · game ${g.number}` }));
  // Per game, a rolling average shows the trend through one-off good and bad games.
  const smooth = by === 'game' && points.length >= ROLL_FROM ? rollingAverage(points.map((x) => x.value), ROLL) : null;
  const swing = scoreSwing(st);
  const html = `
    <section class="card">
      <div class="card-h"><h3>${by === 'session' ? 'Average by session' : 'Score by game'}</h3><small>tap the chart for details</small></div>
      <div class="seg full trend-by">
        <button type="button" class="chip${by === 'session' ? ' on' : ''}" data-by="session" aria-pressed="${by === 'session'}">Each session</button>
        <button type="button" class="chip${by === 'game' ? ' on' : ''}" data-by="game" aria-pressed="${by === 'game'}">Each game</button>
      </div>
      ${points.length >= 2 ? '<div id="trend"></div>' : `<p class="hint">Bowl at least 2 ${by === 'session' ? 'sessions' : 'games'} to see a trend.</p>`}
      ${smooth ? `<p class="c-legend" id="trendLegend"><span><i class="faint"></i>Each game</span><span><i class="avg"></i>${ROLL}-game average</span></p>` : ''}
      ${swing ? `<p class="hint" id="swing">Most games land within <strong>±${swing.sd} pins</strong> of your average <span class="nowrap">(${swing.within} of ${swing.games}).</span></p>` : ''}
      <details class="table-view">
        <summary>Show as table</summary>
        ${by === 'session' ? table(`
          <thead><tr><th>Date</th><th class="num">Games</th><th class="num">Average</th></tr></thead>
          <tbody>${perSession.slice().reverse().map((x) => `<tr><td>${fmtDate(x.session.date)}</td><td class="num">${x.games}</td><td class="num">${Math.round(x.average)}</td></tr>`).join('')}</tbody>`)
        : table(`
          <thead><tr><th>Date</th><th>Game</th><th class="num">Score</th></tr></thead>
          <tbody>${st.games.slice().reverse().map((g) => `<tr><td>${fmtDate(g.session.date)}</td><td>${g.number}</td><td class="num">${g.game.score}</td></tr>`).join('')}</tbody>`)}
      </details>
    </section>`;
  return { html, points, smooth };
}

// One line on Overview when missed spares cost enough to mention; it opens Spares.
function spareCostLine(st) {
  const lost = st.games.length >= COST_MIN_GAMES ? sparePinsLost(st) : null;
  if (!lost || lost.all < COST_SHOWN) return '';
  return `<button type="button" class="link stat-link" id="sparesCost" data-goto="spares">Missed spares cost you about ${Math.round(lost.all)} pins a game →</button>`;
}

export function body({ st, sessions, hints }) {
  trend = trendCard(st, sessionAverages(st));
  return `
      <div class="tiles">
        ${tile(Math.round(st.average), 'Average')}
        ${tile(st.high, 'High game')}
        ${tile(st.games.length, 'Games')}
        ${tile(fmtPct(st.strikes, st.firstBalls), 'Strikes')}
        ${tile(fmtPct(st.sparesMade, st.spareChances), 'Spares made')}
        ${tile((st.opens / st.games.length).toFixed(1), 'Open frames a game')}
      </div>
      ${spareCostLine(st)}
      ${progressCard(progress(sessions), st.games.length)}
      ${calendarCard(sessions, st)}
      ${bestsCard(personalBests(st))}
      ${tipsHTML(hints.filter((t) => t.topic !== 'spares'))}
      ${trend.html}`;
}

export function after(root, { st }, rerender) {
  if (trend.points.length >= 2) {
    lineChart(root.querySelector('#trend'), trend.points, { refValue: Math.round(st.average), refLabel: 'avg', smooth: trend.smooth, smoothLabel: `${ROLL}-game avg` });
  }
  root.querySelectorAll('[data-by]').forEach((btn) => {
    btn.onclick = () => { trendBy = btn.dataset.by; rerender(); };
  });
}
