// Stats → Monthly: one calendar month, compared with the month before, and month by month.

import { monthlyStats, personalBests } from '../../stats.js';
import { lineChart } from '../../charts.js';
import { icon } from '../../ui.js';
import { fmtPct, fmtMonth, pct, plural } from '../../util.js';
import { STATE_WORD, table, tile, tileChange, progressRows, bestRow } from './parts.js';

const MONTHS_SHOWN = 12; // months in the Month by month table before the rest fold away
let month = null; // 'YYYY-MM' shown on Monthly; the latest month until you pick another
let months = []; // from monthlyStats, for the chart once the card is on the page

// Where the picked month sits in `months` (from monthlyStats); the latest month when the picked
// one has no games under the current filters.
function monthIndex(months) {
  if (!months.some((m) => m.key === month)) month = months.at(-1).key;
  return months.findIndex((m) => m.key === month);
}

function monthCompareCard(cur, prev) {
  if (!prev) {
    return `
      <section class="card" id="monthCompare">
        <div class="card-h"><h3>Compared with the month before</h3></div>
        <p class="hint">${fmtMonth(cur.key)} is your first month here. Bowl next month and you'll see how it compares.</p>
      </section>`;
  }
  const a = fmtMonth(prev.key, 'short');
  const b = fmtMonth(cur.key, 'short');
  const rows = progressRows({ first: prev.st, last: cur.st });
  const d = Number(rows[0].to) - Number(rows[0].from);
  const line = d > 0 ? `<strong>Your average is up ${plural(d, 'pin')}</strong> on ${fmtMonth(prev.key)}.`
    : d < 0 ? `<strong>Your average is down ${plural(-d, 'pin')}</strong> on ${fmtMonth(prev.key)}.`
    : `<strong>Your average is the same</strong> as in ${fmtMonth(prev.key)}.`;
  return `
    <section class="card" id="monthCompare">
      <div class="card-h"><h3>vs ${fmtMonth(prev.key)}</h3><small>${plural(prev.st.games.length, 'game')} then</small></div>
      <p class="verdict">${line}</p>
      <details class="table-view" id="monthTable">
        <summary>Compare all stats with ${fmtMonth(prev.key, 'short')}</summary>
      ${table(`
        <thead><tr><th></th><th class="num">${a}</th><th class="num">${b}</th><th class="num">Change</th></tr></thead>
        <tbody>${rows.map((r) => `
          <tr>
            <td>${r.label}</td>
            <td class="num">${r.from}</td>
            <td class="num"><strong>${r.to}</strong></td>
            <td class="num trend ${r.state}">${r.mark} ${STATE_WORD[r.state]}</td>
          </tr>`).join('')}</tbody>`, 'progress')}
      </details>
    </section>`;
}

function monthBestsCard(st) {
  const b = personalBests(st);
  return `
    <section class="card" id="monthBests">
      <div class="card-h"><h3>Best of the month</h3></div>
      <ul class="kv side linked">
        ${bestRow('High game', b.high.score, b.high)}
        ${bestRow('Most strikes in a game', b.strikes.strikes, b.strikes)}
        ${b.session ? bestRow('Best session average', Math.round(b.session.average), b.session, plural(b.session.games, 'game')) : ''}
        ${bestRow('Fewest open frames', b.fewestOpens.opens, b.fewestOpens, b.fewestOpens.opens === 0 ? 'a clean game!' : '')}
      </ul>
    </section>`;
}

function monthsCard(months) {
  const newest = months.slice().reverse();
  const older = newest.slice(MONTHS_SHOWN);
  return `
    <section class="card" id="months">
      <div class="card-h"><h3>Month by month</h3><small>tap a month to open it</small></div>
      ${months.length >= 2 ? '<div id="monthTrend"></div>' : ''}
      ${monthTable(newest.slice(0, MONTHS_SHOWN))}
      ${older.length ? `
        <details class="table-view" id="olderMonths">
          <summary>Older months (${older.length})</summary>
          ${monthTable(older)}
        </details>` : ''}
    </section>`;
}

function monthTable(list) {
  return table(`
        <thead><tr><th>Month</th><th class="num">Games</th><th class="num">Avg</th><th class="num">High</th><th class="num">Strikes</th><th class="num">Spares</th></tr></thead>
        <tbody>${list.map((m) => `
          <tr class="month-row${m.key === month ? ' on' : ''}" data-month-key="${m.key}" data-top>
            <td><button type="button" class="link" aria-label="Open ${fmtMonth(m.key)}"${m.key === month ? ' aria-current="true"' : ''}>${fmtMonth(m.key, 'short')}</button></td>
            <td class="num">${m.st.games.length}</td>
            <td class="num"><strong>${Math.round(m.st.average)}</strong></td>
            <td class="num">${m.st.high}</td>
            <td class="num">${fmtPct(m.st.strikes, m.st.firstBalls)}</td>
            <td class="num">${fmtPct(m.st.sparesMade, m.st.spareChances)}</td>
          </tr>`).join('')}</tbody>`);
}

function monthlyBody(months) {
  const i = monthIndex(months);
  const cur = months[i];
  const prev = months[i - 1] ?? null;
  const next = months[i + 1] ?? null;
  const st = cur.st;
  // The tiles' numbers for a month, to show how this one changed from the one before.
  const nums = (x) => ({
    average: Math.round(x.average), high: x.high, games: x.games.length, strikes: pct(x.strikes, x.firstBalls),
    spares: pct(x.sparesMade, x.spareChances), opens: Number((x.opens / x.games.length).toFixed(1)),
  });
  const now = nums(st);
  const before = prev ? nums(prev.st) : null;
  const vs = (key, opts) => (before ? tileChange(now[key], before[key], fmtMonth(prev.key, 'short'), opts) : '');
  const step = (m, id, label, ico) => `<button type="button" class="btn" id="${id}" aria-label="${label}"${m ? ` data-month-key="${m.key}"` : ' disabled'}>${icon(ico, 22)}</button>`;
  return `
    <div class="month-nav">
      ${step(prev, 'monthPrev', 'Month before', 'chevL')}
      <div class="month-title"><strong id="monthName">${fmtMonth(cur.key)}</strong><small>${plural(cur.days, 'day')} bowled</small></div>
      ${step(next, 'monthNext', 'Month after', 'chevR')}
    </div>
    <div class="tiles" id="monthTiles">
      ${tile(Math.round(st.average), 'Average', vs('average'))}
      ${tile(st.high, 'High game', vs('high'))}
      ${tile(st.games.length, 'Games', vs('games', { up: null }))}
      ${tile(fmtPct(st.strikes, st.firstBalls), 'Strikes', vs('strikes'))}
      ${tile(fmtPct(st.sparesMade, st.spareChances), 'Spares made', vs('spares'))}
      ${tile((st.opens / st.games.length).toFixed(1), 'Open frames a game', vs('opens', { up: false, digits: 1 }))}
    </div>
    ${monthCompareCard(cur, prev)}
    ${monthBestsCard(st)}
    ${monthsCard(months)}`;
}

export function body({ sessions }) {
  months = monthlyStats(sessions);
  return monthlyBody(months);
}

export function after(root, { st }, rerender) {
  if (months.length >= 2) {
    const points = months.map((m) => ({ value: Math.round(m.st.average), label: `${fmtMonth(m.key)} · ${plural(m.st.games.length, 'game')}` }));
    lineChart(root.querySelector('#monthTrend'), points, { refValue: Math.round(st.average), refLabel: 'avg' });
  }
  // The arrows next to the month name and the rows of the month table. A month picked from
  // the table, at the bottom of the page, opens at the top.
  root.querySelectorAll('[data-month-key]').forEach((el) => {
    el.onclick = () => {
      month = el.dataset.monthKey;
      rerender();
      if ('top' in el.dataset) window.scrollTo({ top: 0 });
      else root.querySelector(`#${el.id}`)?.focus();
    };
  });
}
