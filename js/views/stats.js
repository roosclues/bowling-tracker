// Stats: trends, strike/spare rates, best feet + arrow lines, leaves, pin hits.

import { db } from '../storage.js';
import { computeStats, filterSessions, tips } from '../stats.js';
import { lineChart, barList } from '../charts.js';
import { miniPins } from '../pins.js';
import { HITS, infoButton, arrowLabel } from '../terms.js';
import { topbar } from '../ui.js';
import { esc, fmtPct, fmtDate, pct } from '../util.js';

const filters = { days: 0, center: '', ball: '' };
const MIN_COMBO = 3;

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
  const st = computeStats(filterSessions(db.sessions, filters));
  const hints = tips(st, db.settings.hand);

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

      ${hints.map((t) => `<div class="tip"><strong>${t.title}</strong><p>${t.text}</p></div>`).join('')}

      <section class="card">
        <div class="card-h"><h3>Score by game</h3><small>Tap the chart for details</small></div>
        ${st.games.length >= 2 ? '<div id="trend"></div>' : '<p class="hint">Bowl at least 2 games to see a trend.</p>'}
        <details class="table-view">
          <summary>Show as table</summary>
          <table class="tbl">
            <thead><tr><th>Date</th><th>Game</th><th class="num">Score</th></tr></thead>
            <tbody>${st.games.slice().reverse().map((g) => `<tr><td>${fmtDate(g.session.date)}</td><td>${g.number}</td><td class="num">${g.game.score}</td></tr>`).join('')}</tbody>
          </table>
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

  if (st.games.length >= 2) {
    lineChart(root.querySelector('#trend'),
      st.games.map((g) => ({ value: g.game.score, label: `${fmtDate(g.session.date)} · game ${g.number}` })),
      { refValue: Math.round(st.average), refLabel: 'avg' });
  }

  root.querySelector('#fDays').onchange = (e) => { filters.days = Number(e.target.value); render(root); };
  root.querySelector('#fCenter').onchange = (e) => { filters.center = e.target.value; render(root); };
  root.querySelector('#fBall').onchange = (e) => { filters.ball = e.target.value; render(root); };
}
