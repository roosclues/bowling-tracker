// Stats, in four tabs under one set of filters:
//   Overview   - headline numbers, are you improving, personal bests, tips, score trend
//   First ball - best lines, accuracy, where the ball hit, game by game, speed
//   Spares     - spare rates and each common leave, with its aim and your practice results
//   Feel       - how "how it felt" tags line up with strikes

import { db } from '../storage.js';
import {
  computeStats, filterSessions, tips, progress, personalBests, sessionAverages, strikeLineFor, practiceByLeave,
  speedBands, GOAL_TYPES, MAX_GAME_NO,
} from '../stats.js';
import { spareAim } from '../spares.js';
import { lineChart, barList, calendarHeat } from '../charts.js';
import { miniPins } from '../pins.js';
import { HITS, infoButton, carryNote } from '../terms.js';
import { topbar, tipsHTML, kvRow } from '../ui.js';
import { esc, fmtPct, fmtDate, fmtShortDate, pct, plural, go, avg, fmtSpeed, SPEED_UNITS } from '../util.js';

const filters = { days: 0, center: '', ball: '', oil: '' };
const MIN_COMBO = 3;
const MIN_CARRY = 5; // pocket hits before the carry card shows its numbers
const CAL_NEAR = 5;  // pins from your average for the lighter calendar shades
const CAL_FAR = 15;  // ...and for the darkest
let trendBy = null; // 'session' or 'game'; picked automatically until you choose
let tab = 'overview';

const TABS = [['overview', 'Overview'], ['first', 'First ball'], ['spares', 'Spares'], ['feel', 'Feel']];

// Opens Stats on Overview, filtered to one center (from a session's screen).
export function showStatsFor({ center = '' } = {}) {
  Object.assign(filters, { days: 0, center, ball: '', oil: '' });
  tab = 'overview';
  go('#/stats');
}

const hitCount = (s) => Object.values(s.hits).reduce((a, b) => a + b, 0);
const goalRow = (key) => {
  const t = GOAL_TYPES.find((x) => x.key === key);
  return { label: t.label, get: t.get, fmt: (v) => t.fmt(t.round(v)), up: t.up };
};

// Rows of "Are you improving?": the goal stats plus pocket hits.
const METRICS = [
  goalRow('average'), goalRow('firstBall'), goalRow('strikes'), goalRow('spares'), goalRow('single'), goalRow('opens'),
  { label: 'Pocket hits', get: (s) => (hitCount(s) >= 3 ? pct(s.hits.pocket ?? 0, hitCount(s)) : null), fmt: (v) => `${v}%`, up: true },
];
const STATE_WORD = { better: 'Better', worse: 'Worse', same: 'Same' };

const table = (inner, cls = '') => `<div class="tbl-wrap"><table class="tbl${cls ? ` ${cls}` : ''}">${inner}</table></div>`;
const tile = (value, label) => `<div class="tile"><div class="tv">${value}</div><div class="tl">${label}</div></div>`;

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
  const row = (label, value, entry, note = '') => kvRow(label, value, { note, side: fmtShortDate(entry.session.date) });
  const streak = b.streak.streak;
  return `
    <section class="card" id="bests">
      <div class="card-h"><h3>Personal bests</h3><small>date first set</small></div>
      <ul class="kv">
        ${row('High game', b.high.score, b.high)}
        ${b.session ? row('Best session average', Math.round(b.session.average), b.session, plural(b.session.games, 'game')) : ''}
        ${row('Most strikes in a game', b.strikes.strikes, b.strikes)}
        ${streak ? row('Strikes in a row', streak, b.streak, STREAK_NAMES[streak] ?? (streak >= 4 ? `a ${streak}-bagger` : '')) : ''}
        ${row('Fewest open frames', b.fewestOpens.opens, b.fewestOpens, b.fewestOpens.opens === 0 ? 'a clean game!' : '')}
        ${b.series ? row('High series', b.series.score, b.series, '3 games') : ''}
      </ul>
    </section>`;
}

function trendCard(st, perSession) {
  const by = trendBy ?? (perSession.length >= 2 ? 'session' : 'game');
  const points = by === 'session'
    ? perSession.map((x) => ({ value: Math.round(x.average), label: `${fmtDate(x.session.date)} · ${plural(x.games, 'game')}` }))
    : st.games.map((g) => ({ value: g.game.score, label: `${fmtDate(g.session.date)} · game ${g.number}` }));
  const html = `
    <section class="card">
      <div class="card-h"><h3>${by === 'session' ? 'Average by session' : 'Score by game'}</h3><small>tap the chart for details</small></div>
      <div class="seg full trend-by">
        <button type="button" class="chip${by === 'session' ? ' on' : ''}" data-by="session" aria-pressed="${by === 'session'}">Each session</button>
        <button type="button" class="chip${by === 'game' ? ' on' : ''}" data-by="game" aria-pressed="${by === 'game'}">Each game</button>
      </div>
      ${points.length >= 2 ? '<div id="trend"></div>' : `<p class="hint">Bowl at least 2 ${by === 'session' ? 'sessions' : 'games'} to see a trend.</p>`}
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
  return { html, points };
}

function linesCard(st) {
  const ranked = st.combos.filter((c) => c.n >= MIN_COMBO);
  return `
    <section class="card" id="lines">
      <div class="card-h"><h3>Best feet + arrow lines</h3>${infoButton('followMiss')}</div>
      <p class="hint">1st balls only, ranked by strike rate. A line needs ${MIN_COMBO}+ balls to be ranked. Breakpoint is the average board where the ball started to hook.</p>
      ${ranked.length ? table(`
        <thead><tr><th>Feet</th><th>Arrow</th><th class="num">Break&shy;point</th><th class="num">Balls</th><th class="num">Strike</th><th class="num">Pocket</th><th class="num">Pins</th></tr></thead>
        <tbody>${ranked.slice(0, 8).map((c) => `
          <tr>
            <td>${c.feet}</td>
            <td>${c.target}</td>
            <td class="num">${c.breakpoint ?? '–'}</td>
            <td class="num">${c.n}</td>
            <td class="num">${fmtPct(c.strikes, c.n)}</td>
            <td class="num">${c.hitN ? fmtPct(c.pocket, c.hitN) : '–'}</td>
            <td class="num">${(c.pins / c.n).toFixed(1)}</td>
          </tr>`).join('')}</tbody>`, 'lines')
      : '<p class="hint">Not enough data yet. Keep recording your feet and arrow on 1st balls.</p>'}
    </section>`;
}

function accuracyCard(a) {
  const tagged = a.arrowHit + a.arrowMiss;
  const rows = [
    a.feet.n >= 5 && kvRow('Feet within a board of your usual spot', `${pct(a.feet.near, a.feet.n)}%`, { side: `board ${a.feet.board}` }),
    a.target.n >= 5 && kvRow('Arrow within a board of your usual one', `${pct(a.target.near, a.target.n)}%`, { side: `board ${a.target.board}` }),
    tagged >= 3 && kvRow('Hit the arrow you aimed at', `${pct(a.arrowHit, tagged)}%`, { side: `${tagged} tagged` }),
  ].filter(Boolean);
  if (!rows.length) return '';
  return `
    <section class="card" id="accuracy">
      <div class="card-h"><h3>How repeatable is your shot?</h3><small>1st balls</small></div>
      <ul class="kv">${rows.join('')}</ul>
      <p class="hint">Repeating the same feet and arrow matters more than finding a perfect line. To track your aim, tag "Hit my arrow" or "Missed left/right" under More details.</p>
    </section>`;
}

function hitsCard(st) {
  const total = hitCount(st);
  return `
    <section class="card" id="hits">
      <div class="card-h"><h3>Where the ball hit</h3>${infoButton('hit')}</div>
      ${total ? barList(HITS.map((h) => ({
        label: h.label,
        value: st.hits[h.key] ?? 0,
        display: `${pct(st.hits[h.key] ?? 0, total)}%`,
      })), { max: total }) + `<p class="hint">From ${plural(total, '1st ball')} with "Pin hit" recorded.</p>`
      : '<p class="hint">Record "Pin hit" under More details to see this.</p>'}
    </section>`;
}

// Strike carry: what your pocket hits left, and what each leave usually means.
function carryCard(st, hand) {
  if (!hitCount(st)) return '';
  const c = st.carry;
  const head = `<div class="card-h"><h3>Pocket hits: did they carry?</h3>${infoButton('carry')}</div>`;
  if (c.pocket < MIN_CARRY) {
    return `
      <section class="card" id="carry">
        ${head}
        <p class="hint">Shows once you have ${MIN_CARRY} pocket hits recorded (${c.pocket} so far).</p>
      </section>`;
  }
  // Leaves with a known meaning get a row; the rest (like a standing head pin) are summed up.
  const known = c.leaves.map((l) => ({ l, note: carryNote(l.pins, hand) })).filter((x) => x.note);
  const other = c.leaves.filter((l) => !carryNote(l.pins, hand)).reduce((n, l) => n + l.n, 0);
  return `
    <section class="card" id="carry">
      ${head}
      <ul class="kv">${kvRow('Strikes on pocket hits', fmtPct(c.strikes, c.pocket), { side: `${c.strikes} of ${c.pocket}` })}</ul>
      ${known.length ? `
        <ul class="carry-list">${known.map(({ l, note }) => `
          <li>
            ${miniPins(l.pins, 34)}
            <span class="leave-info">
              <span class="leave-name"><strong>${l.pins.join('-')}</strong> · ${l.n}× · ${note.label}</span>
              <span class="sub">${note.text}</span>
            </span>
          </li>`).join('')}</ul>` : ''}
      ${other ? `<p class="hint">${plural(other, 'other leave')}, unusual after a pocket hit: check the Pin hit you recorded for those balls.</p>` : ''}
      ${c.leaves.length ? '' : '<p class="hint">Every pocket hit was a strike. 🎳</p>'}
    </section>`;
}

function byGameCard(rows) {
  if (rows.length < 2) return '';
  return `
    <section class="card" id="byGame">
      <div class="card-h"><h3>As the session goes on</h3><small>finished games</small></div>
      ${table(`
        <thead><tr><th>Game #</th><th class="num">Played</th><th class="num">Average</th><th class="num">Strike</th><th class="num">Pocket</th></tr></thead>
        <tbody>${rows.map((r) => `
          <tr>
            <td>${r.no === MAX_GAME_NO ? `${MAX_GAME_NO}+` : r.no}</td>
            <td class="num">${r.games}</td>
            <td class="num">${Math.round(r.average)}</td>
            <td class="num">${fmtPct(r.strikes, r.firstBalls)}</td>
            <td class="num">${r.hitN ? fmtPct(r.pocket, r.hitN) : '–'}</td>
          </tr>`).join('')}</tbody>`)}
      <p class="hint">If later games drop, the oil is probably wearing off and the ball hooks sooner. When you start hitting high, move your feet 2 boards and your arrow 1 board away from your bowling-hand side.</p>
    </section>`;
}

function speedCard(st) {
  if (!st.speedCount) return '';
  const unit = db.settings.speedUnit;
  const bands = speedBands(st, unit);
  return `
    <section class="card" id="speedCard">
      <div class="card-h"><h3>Ball speed</h3>${infoButton('speed')}</div>
      <ul class="kv">
        ${kvRow('Average', fmtSpeed(st.speedAvg, unit), { side: plural(st.speedCount, 'ball') })}
        ${st.speedSD !== null ? kvRow('Typical change ball to ball', `±${fmtSpeed(st.speedSD, unit)}`, { side: st.speedSD < 0.6 ? 'steady' : '' }) : ''}
      </ul>
      ${bands.length >= 2 ? table(`
        <thead><tr><th>Speed</th><th class="num">1st balls</th><th class="num">Strike</th><th class="num">Pins</th></tr></thead>
        <tbody>${bands.map((b) => `
          <tr><td>${b.from}–${b.to} ${SPEED_UNITS[unit]}</td><td class="num">${b.n}</td><td class="num">${fmtPct(b.strikes, b.n)}</td><td class="num">${(b.pins / b.n).toFixed(1)}</td></tr>`).join('')}</tbody>`) : ''}
    </section>`;
}

function leavesCard(st, hand) {
  if (!st.leaves.length) {
    return `
      <section class="card">
        <div class="card-h"><h3>Most common leaves</h3></div>
        <p class="hint">No leaves yet. All strikes? 🎳</p>
      </section>`;
  }
  // Aims start from your usual strike line over all games, like the game screen and practice.
  const line = strikeLineFor(db.sessions);
  const practice = practiceByLeave(db.practice);
  const outcome = (x) => {
    if (!x.next) return 'no 2nd ball yet';
    const result = x.next.standing.length ? `missed, left ${x.next.standing.join('-')}` : 'picked up';
    const used = [x.next.feet != null && `feet ${x.next.feet}`, x.next.target != null && `arrow ${x.next.target}`].filter(Boolean);
    return result + (used.length ? ` · ${used.join(', ')}` : '');
  };
  return `
    <section class="card" id="leaves">
      <div class="card-h"><h3>Most common leaves</h3><small>tap one for details</small></div>
      <ul class="leaves">${st.leaves.slice(0, 8).map((l) => {
        const name = l.standing.join('-');
        const aim = spareAim(l.standing, line, hand);
        const p = practice.get(name);
        return `
        <li><details>
          <summary>
            ${miniPins(l.standing, 40)}
            <span class="leave-info">
              <span class="leave-name"><strong>${name}</strong>${l.split ? ' <span class="tag-split">split</span>' : ''}</span>
              <span class="sub">Left ${l.count}× (${pct(l.count, st.firstBalls)}% of 1st balls) · picked up ${l.made}/${l.chances}${p ? ` · practice ${p.made}/${p.n}` : ''}</span>
              <span class="sub">Aim: feet ${aim.feet} · arrow ${aim.target}${l.worked ? ` · worked for you: feet ${l.worked.feet}, arrow ${l.worked.target} (${l.worked.made}/${l.worked.n})` : ''}</span>
            </span>
          </summary>
          <div class="leave-more">
            <ul class="leave-hist">${l.history.slice(-8).reverse().map((x) => `
              <li>${fmtShortDate(x.session.date)} · game ${x.gameNo}, frame ${x.frame + 1}: ${outcome(x)}</li>`).join('')}</ul>
            <a class="link" href="#/practice/${name}">Practice the ${name} →</a>
          </div>
        </details></li>`;
      }).join('')}</ul>
      <p class="hint">Aims use the 3-6-9 system from your usual strike line. ${infoButton('spareAim')}</p>
    </section>`;
}

function feelCard(st) {
  if (!st.feel.length) {
    return `
      <section class="card" id="feel">
        <div class="card-h"><h3>How it felt</h3></div>
        <p class="hint">Tag balls under More details ("Rushed", "Good release"…) to see how each feeling lines up with your strikes.</p>
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

function options(values, selected, allLabel) {
  return `<option value="">${allLabel}</option>` +
    values.map((v) => `<option value="${esc(v)}"${v === selected ? ' selected' : ''}>${esc(v)}</option>`).join('');
}

export function render(root) {
  const centers = [...new Set(db.sessions.map((s) => s.center).filter(Boolean))];
  const balls = [...new Set(db.sessions.map((s) => s.ball).filter(Boolean))];
  const oils = [...new Set(db.sessions.map((s) => s.oil).filter(Boolean))];
  // A filter can point at a center, ball or oil that was renamed or restored away; drop it.
  if (!centers.includes(filters.center)) filters.center = '';
  if (!balls.includes(filters.ball)) filters.ball = '';
  if (!oils.includes(filters.oil)) filters.oil = '';
  const sessions = filterSessions(db.sessions, filters);
  const st = computeStats(sessions);
  const hints = tips(st, db.settings.hand, sessions, db.settings.speedUnit);
  const filtered = filters.days || filters.center || filters.ball || filters.oil;
  const practiced = db.practice.length;
  const practiceMade = db.practice.filter((p) => p.made).length;

  let body = '';
  let trend = null;
  if (tab === 'overview') {
    trend = trendCard(st, sessionAverages(st));
    body = `
      <div class="tiles">
        ${tile(Math.round(st.average), 'Average')}
        ${tile(st.high, 'High game')}
        ${tile(st.games.length, 'Games')}
        ${tile(fmtPct(st.strikes, st.firstBalls), 'Strikes')}
        ${tile(fmtPct(st.sparesMade, st.spareChances), 'Spares made')}
        ${tile((st.opens / st.games.length).toFixed(1), 'Open frames a game')}
      </div>
      ${progressCard(progress(sessions), st.games.length)}
      ${calendarCard(sessions, st)}
      ${bestsCard(personalBests(st))}
      ${tipsHTML(hints.filter((t) => t.topic !== 'spares'))}
      ${trend.html}`;
  } else if (tab === 'first') {
    body = `
      <div class="tiles">
        ${tile(fmtPct(st.strikes, st.firstBalls), 'Strikes')}
        ${tile(st.firstBallAvg.toFixed(1), '1st-ball pins')}
        ${tile(fmtPct(st.splits, st.firstBalls), `Splits ${infoButton('split')}`)}
      </div>
      ${linesCard(st)}
      ${accuracyCard(st.accuracy)}
      ${hitsCard(st)}
      ${carryCard(st, db.settings.hand)}
      ${byGameCard(st.byGame)}
      ${speedCard(st)}`;
  } else if (tab === 'spares') {
    body = `
      <div class="tiles">
        ${tile(fmtPct(st.sparesMade, st.spareChances), 'Spares made')}
        ${tile(fmtPct(st.singleMade, st.singleChances), '1-pin spares')}
        ${tile(fmtPct(practiceMade, practiced), 'Practice, all leaves')}
      </div>
      ${tipsHTML(hints.filter((t) => t.topic === 'spares'))}
      ${leavesCard(st, db.settings.hand)}
      <a class="btn block" href="#/practice">Go to Spare practice</a>`;
  } else {
    body = feelCard(st);
  }

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
        <select id="fOil" aria-label="Oil pattern">${options(oils, filters.oil, 'All oil patterns')}</select>
      </div>

      ${st.games.length === 0 ? `
        <div class="empty">
          <p>No finished games yet${filtered ? ' for these filters' : ''}.</p>
          <a class="btn primary" href="#/new">Start bowling</a>
        </div>` : `
      <div class="subtabs" role="tablist" aria-label="Stats sections">
        ${TABS.map(([key, label]) => `<button type="button" role="tab" class="subtab" data-subtab="${key}" aria-selected="${tab === key}" aria-controls="statsPanel">${label}</button>`).join('')}
      </div>
      <div id="statsPanel" role="tabpanel">${body}</div>`}
    </div>`;

  if (trend && trend.points.length >= 2) {
    lineChart(root.querySelector('#trend'), trend.points, { refValue: Math.round(st.average), refLabel: 'avg' });
  }
  root.querySelectorAll('[data-by]').forEach((btn) => {
    btn.onclick = () => { trendBy = btn.dataset.by; render(root); };
  });
  root.querySelectorAll('[data-subtab]').forEach((btn) => {
    btn.onclick = () => {
      tab = btn.dataset.subtab;
      render(root);
      root.querySelector(`[data-subtab="${tab}"]`).focus();
    };
  });

  root.querySelector('#fDays').onchange = (e) => { filters.days = Number(e.target.value); render(root); };
  root.querySelector('#fCenter').onchange = (e) => { filters.center = e.target.value; render(root); };
  root.querySelector('#fBall').onchange = (e) => { filters.ball = e.target.value; render(root); };
  root.querySelector('#fOil').onchange = (e) => { filters.oil = e.target.value; render(root); };
}
