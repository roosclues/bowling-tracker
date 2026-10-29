// Stats: progress over time, personal bests, trends, strike/spare rates, best feet + arrow
// lines, leaves, pin hits.

import { db } from '../storage.js';
import { computeStats, filterSessions, tips, progress, personalBests, sessionAverages } from '../stats.js';
import { lineChart, barList } from '../charts.js';
import { miniPins } from '../pins.js';
import { HITS, infoButton, arrowLabel } from '../terms.js';
import { topbar } from '../ui.js';
import { esc, fmtPct, fmtDate, fmtShortDate, pct } from '../util.js';

const filters = { days: 0, center: '', ball: '' };
const MIN_COMBO = 3;
let trendBy = null; // 'session' or 'game'; picked automatically until you choose

const hitCount = (s) => Object.values(s.hits).reduce((a, b) => a + b, 0);

// Rows of "Are you improving?": how to read each number, and whether higher is better.
const METRICS = [
  { label: 'Average score', get: (s) => s.average, fmt: (v) => Math.round(v), up: true },
  { label: '1st-ball pins', get: (s) => s.firstBallAvg, fmt: (v) => v.toFixed(1), up: true },
  { label: 'Strikes', get: (s) => pct(s.strikes, s.firstBalls), fmt: (v) => `${v}%`, up: true },
  { label: 'Spares made', get: (s) => pct(s.sparesMade, s.spareChances), fmt: (v) => `${v}%`, up: true },
  { label: '1-pin spares', get: (s) => pct(s.singleMade, s.singleChances), fmt: (v) => `${v}%`, up: true },
  { label: 'Open frames a game', get: (s) => s.opens / s.games.length, fmt: (v) => v.toFixed(1), up: false },
  { label: 'Pocket hits', get: (s) => (hitCount(s) >= 3 ? pct(s.hits.pocket ?? 0, hitCount(s)) : null), fmt: (v) => `${v}%`, up: true },
];
const STATE_WORD = { better: 'Better', worse: 'Worse', same: 'Same' };

function progressRows(p) {
  return METRICS.map((m) => {
    const a = m.get(p.first);
    const b = m.get(p.last);
    if (a == null || b == null) return null;
    const from = String(m.fmt(a));
    const to = String(m.fmt(b));
    const state = from === to ? 'same' : (b > a) === m.up ? 'better' : 'worse';
    return { label: m.label, from, to, state, mark: from === to ? '=' : b > a ? '▲' : '▼' };
  }).filter(Boolean);
}

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
      <table class="tbl progress">
        <thead><tr><th></th><th class="num">First ${p.k}</th><th class="num">Last ${p.k}</th><th class="num">Change</th></tr></thead>
        <tbody>${rows.map((r) => `
          <tr>
            <td>${r.label}</td>
            <td class="num">${r.from}</td>
            <td class="num"><strong>${r.to}</strong></td>
            <td class="num trend ${r.state}">${r.mark} ${STATE_WORD[r.state]}</td>
          </tr>`).join('')}</tbody>
      </table>
      <p class="hint">Spares made and open frames are usually where a new bowler's score goes up fastest. Numbers jump around over a few games, so the more you log, the more you can trust this.</p>
    </section>`;
}

const STREAK_NAMES = { 2: 'a double', 3: 'a turkey', 12: 'a perfect game!' };

function bestsCard(b) {
  if (!b) return '';
  const row = (label, value, entry, note = '') => `
    <li>
      <span class="kv-label">${label}</span>
      <span class="kv-val"><strong>${value}</strong>${note ? ` <span class="kv-note">${note}</span>` : ''}</span>
      <span class="kv-date">${fmtShortDate(entry.session.date)}</span>
    </li>`;
  const streak = b.streak.streak;
  return `
    <section class="card" id="bests">
      <div class="card-h"><h3>Personal bests</h3><small>date first set</small></div>
      <ul class="kv">
        ${row('High game', b.high.score, b.high)}
        ${b.session ? row('Best session average', Math.round(b.session.average), b.session, `${b.session.games} games`) : ''}
        ${row('Most strikes in a game', b.strikes.strikes, b.strikes)}
        ${streak ? row('Strikes in a row', streak, b.streak, STREAK_NAMES[streak] ?? (streak >= 4 ? `a ${streak}-bagger` : '')) : ''}
        ${row('Fewest open frames', b.fewestOpens.opens, b.fewestOpens, b.fewestOpens.opens === 0 ? 'a clean game!' : '')}
      </ul>
    </section>`;
}

function options(values, selected, allLabel) {
  return `<option value="">${allLabel}</option>` +
    values.map((v) => `<option value="${esc(v)}"${v === selected ? ' selected' : ''}>${esc(v)}</option>`).join('');
}

export function render(root) {
  const centers = [...new Set(db.sessions.map((s) => s.center).filter(Boolean))];
  const balls = [...new Set(db.sessions.map((s) => s.ball).filter(Boolean))];
  // A filter can point at a center or ball that was renamed or restored away; drop it.
  if (!centers.includes(filters.center)) filters.center = '';
  if (!balls.includes(filters.ball)) filters.ball = '';
  const sessions = filterSessions(db.sessions, filters);
  const st = computeStats(sessions);
  const hints = tips(st, db.settings.hand);
  const perSession = sessionAverages(st);
  const by = trendBy ?? (perSession.length >= 2 ? 'session' : 'game');
  const trendPoints = by === 'session'
    ? perSession.map((x) => ({ value: Math.round(x.average), label: `${fmtDate(x.session.date)} · ${x.games} game${x.games === 1 ? '' : 's'}` }))
    : st.games.map((g) => ({ value: g.game.score, label: `${fmtDate(g.session.date)} · game ${g.number}` }));

  const ranked = st.combos.filter((c) => c.n >= MIN_COMBO);
  const hitTotal = Object.values(st.hits).reduce((a, b) => a + b, 0);
  const tagRows = Object.entries(st.tags).sort((a, b) => b[1] - a[1]);

  root.innerHTML = `
    ${topbar({ title: 'Stats' })}
    <div class="page">
      <div class="filters">
        <select id="fDays" aria-label="Date range">
          <option value="0"${filters.days === 0 ? ' selected' : ''}>All time</option>
          <option value="30"${filters.days === 30 ? ' selected' : ''}>Last 30 days</option>
          <option value="90"${filters.days === 90 ? ' selected' : ''}>Last 90 days</option>
        </select>
        <select id="fCenter" aria-label="Bowling center">${options(centers, filters.center, 'All centers')}</select>
        <select id="fBall" aria-label="Ball">${options(balls, filters.ball, 'All balls')}</select>
      </div>

      ${st.games.length === 0 ? `
        <div class="empty">
          <p>No finished games yet${filters.days || filters.center || filters.ball ? ' for these filters' : ''}.</p>
          <a class="btn primary" href="#/new">Start bowling</a>
        </div>` : `
      <div class="tiles">
        <div class="tile"><div class="tv">${Math.round(st.average)}</div><div class="tl">Average</div></div>
        <div class="tile"><div class="tv">${st.high}</div><div class="tl">High game</div></div>
        <div class="tile"><div class="tv">${st.games.length}</div><div class="tl">Games</div></div>
        <div class="tile"><div class="tv">${fmtPct(st.strikes, st.firstBalls)}</div><div class="tl">Strikes</div></div>
        <div class="tile"><div class="tv">${fmtPct(st.sparesMade, st.spareChances)}</div><div class="tl">Spares made</div></div>
        <div class="tile"><div class="tv">${fmtPct(st.singleMade, st.singleChances)}</div><div class="tl">1-pin spares</div></div>
        <div class="tile"><div class="tv">${st.firstBallAvg.toFixed(1)}</div><div class="tl">1st-ball pins</div></div>
        <div class="tile"><div class="tv">${fmtPct(st.opens, st.frames)}</div><div class="tl">Open frames</div></div>
        <div class="tile"><div class="tv">${fmtPct(st.splits, st.firstBalls)}</div><div class="tl">Splits ${infoButton('split')}</div></div>
      </div>
      ${st.speedCount ? `<p class="meta center">Average ball speed ${st.speedAvg.toFixed(1)} mph over ${st.speedCount} ball${st.speedCount === 1 ? "" : "s"}</p>` : ''}

      ${progressCard(progress(sessions), st.games.length)}
      ${bestsCard(personalBests(st))}

      ${hints.map((t) => `<div class="tip"><strong>${t.title}</strong><p>${t.text}</p></div>`).join('')}

      <section class="card">
        <div class="card-h"><h3>${by === 'session' ? 'Average by session' : 'Score by game'}</h3><small>Tap the chart for details</small></div>
        <div class="seg full trend-by">
          <button type="button" class="chip${by === 'session' ? ' on' : ''}" data-by="session">Each session</button>
          <button type="button" class="chip${by === 'game' ? ' on' : ''}" data-by="game">Each game</button>
        </div>
        ${trendPoints.length >= 2 ? '<div id="trend"></div>' : `<p class="hint">Bowl at least 2 ${by === 'session' ? 'sessions' : 'games'} to see a trend.</p>`}
        <details class="table-view">
          <summary>Show as table</summary>
          ${by === 'session' ? `
          <table class="tbl">
            <thead><tr><th>Date</th><th class="num">Games</th><th class="num">Average</th></tr></thead>
            <tbody>${perSession.slice().reverse().map((x) => `<tr><td>${fmtDate(x.session.date)}</td><td class="num">${x.games}</td><td class="num">${Math.round(x.average)}</td></tr>`).join('')}</tbody>
          </table>` : `
          <table class="tbl">
            <thead><tr><th>Date</th><th>Game</th><th class="num">Score</th></tr></thead>
            <tbody>${st.games.slice().reverse().map((g) => `<tr><td>${fmtDate(g.session.date)}</td><td>${g.number}</td><td class="num">${g.game.score}</td></tr>`).join('')}</tbody>
          </table>`}
        </details>
      </section>

      <section class="card">
        <div class="card-h"><h3>Best feet + arrow lines</h3>${infoButton('followMiss')}</div>
        <p class="hint">First balls only, ranked by strike rate. A line needs ${MIN_COMBO}+ shots to be ranked.</p>
        ${ranked.length ? `
          <table class="tbl">
            <thead><tr><th>Feet</th><th>Arrow</th><th class="num">Shots</th><th class="num">Strike</th><th class="num">Pocket</th><th class="num">Pins</th></tr></thead>
            <tbody>${ranked.slice(0, 8).map((c) => `
              <tr>
                <td>${c.feet}</td>
                <td>${esc(arrowLabel(c.target).replace('Board ', ''))}</td>
                <td class="num">${c.n}</td>
                <td class="num">${fmtPct(c.strikes, c.n)}</td>
                <td class="num">${c.hitN ? fmtPct(c.pocket, c.hitN) : '–'}</td>
                <td class="num">${(c.pins / c.n).toFixed(1)}</td>
              </tr>`).join('')}</tbody>
          </table>` : `<p class="hint">Not enough data yet. Keep recording your feet and arrow on first balls.</p>`}
      </section>

      <section class="card">
        <div class="card-h"><h3>Where the ball hit</h3>${infoButton('hit')}</div>
        ${hitTotal ? barList(HITS.map((h) => ({
          label: h.label,
          value: st.hits[h.key] ?? 0,
          display: `${pct(st.hits[h.key] ?? 0, hitTotal)}%`,
        })), { max: hitTotal }) + `<p class="hint">From ${hitTotal} first balls with "Pin hit" recorded.</p>`
        : '<p class="hint">Record "Pin hit" under More details to see this.</p>'}
      </section>

      <section class="card">
        <div class="card-h"><h3>Most common leaves</h3><small>pins left after the 1st ball</small></div>
        ${st.leaves.length ? `<ul class="leaves">${st.leaves.slice(0, 8).map((l) => `
          <li>
            ${miniPins(l.standing, 40)}
            <div class="leave-info">
              <div><strong>${l.standing.join('-')}</strong>${l.split ? ' <span class="tag-split">split</span>' : ''}</div>
              <div class="sub">Left ${l.count}× (${pct(l.count, st.firstBalls)}% of 1st balls) · picked up ${l.made}/${l.chances}</div>
            </div>
          </li>`).join('')}</ul>` : '<p class="hint">No leaves yet. All strikes? 🎳</p>'}
      </section>

      ${tagRows.length ? `
      <section class="card">
        <div class="card-h"><h3>How it felt</h3></div>
        ${barList(tagRows.map(([t, n]) => ({ label: t, value: n })))}
      </section>` : ''}
      `}
    </div>`;

  if (trendPoints.length >= 2) {
    lineChart(root.querySelector('#trend'), trendPoints, { refValue: Math.round(st.average), refLabel: 'avg' });
  }
  root.querySelectorAll('[data-by]').forEach((btn) => {
    btn.onclick = () => { trendBy = btn.dataset.by; render(root); };
  });

  root.querySelector('#fDays').onchange = (e) => { filters.days = Number(e.target.value); render(root); };
  root.querySelector('#fCenter').onchange = (e) => { filters.center = e.target.value; render(root); };
  root.querySelector('#fBall').onchange = (e) => { filters.ball = e.target.value; render(root); };
}
