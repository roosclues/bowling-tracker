// Stats, in six tabs under one set of filters:
//   Overview   - headline numbers, are you improving, personal bests, tips, score trend
//   Monthly    - one calendar month, compared with the month before, and month by month
//   Lifetime   - totals since your first game, score spread, milestones
//   First ball - best lines, accuracy, where the ball hit, game by game, speed
//   Spares     - spare rates and each common leave, with its aim and your practice results
//   Feel       - how "how it felt" tags line up with strikes
// Monthly and Lifetime pick their own dates, so the date range filter is hidden there.

import { db } from '../storage.js';
import {
  computeStats, filterSessions, tips, progress, personalBests, sessionAverages, spareAimFor, practiceByLeave,
  speedBands, GOAL_TYPES, MAX_GAME_NO, monthlyStats, lifetimeTotals, scoreSpread,
  sparePinsLost, scoreSwing, rollingAverage, strikeChains,
} from '../stats.js';
import { milestones, nextMilestones, milestoneProgress } from '../milestones.js';
import { lineChart, barList, calendarHeat } from '../charts.js';
import { miniPins } from '../pins.js';
import { HITS, infoButton, carryNote } from '../terms.js';
import { topbar, tipsHTML, kvRow, icon } from '../ui.js';
import { esc, fmtPct, fmtDate, fmtShortDate, fmtMonth, pct, plural, go, avg, fmtSpeed, SPEED_UNITS } from '../util.js';

const NO_FILTERS = { days: 0, center: '', ball: '', oil: '', kind: '' };
const filters = { ...NO_FILTERS };
const ROLL = 5;          // games in the rolling average on the score chart
const ROLL_FROM = 6;     // games before the rolling average is drawn
const COST_SHOWN = 5;    // pins a game that missed spares must cost before Overview mentions it
const COST_MIN_GAMES = 3; // ...and the finished games it needs first
let month = null; // 'YYYY-MM' shown on Monthly; the latest month until you pick another
const MIN_COMBO = 3;
const MIN_CARRY = 5; // pocket hits before the carry card shows its numbers
const CAL_NEAR = 5;  // pins from your average for the lighter calendar shades
const CAL_FAR = 15;  // ...and for the darkest
let trendBy = null; // 'session' or 'game'; picked automatically until you choose
let tab = 'overview';
let scrollToCard = null; // a card to bring into view on the next render, then forgotten
const REACHED_SHOWN = 5; // milestones listed before the rest fold under "Earlier"

const TABS = [['overview', 'Overview'], ['monthly', 'Monthly'], ['lifetime', 'Lifetime'], ['first', 'First ball'], ['spares', 'Spares'], ['feel', 'Feel']];
const OWN_DATES = ['monthly', 'lifetime'];

// Opens Stats on Overview, filtered to one center (from a session's screen).
export function showStatsFor({ center = '' } = {}) {
  Object.assign(filters, NO_FILTERS, { center });
  tab = 'overview';
  go('#/stats');
}

// Opens Stats on one tab with no filters, scrolled to the card `anchor` if given (the summary's
// milestone pill opens Lifetime at Milestones).
export function showStatsTab(key, anchor = null) {
  Object.assign(filters, NO_FILTERS);
  tab = key;
  scrollToCard = anchor;
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
const tile = (value, label, change = '') => `<div class="tile"><div class="tv">${value}</div><div class="tl">${label}</div>${change}</div>`;
const tileCount = (made, chances) => (chances ? `<div class="tc"><span>${made} of ${chances}</span></div>` : '');
const MONTHS_SHOWN = 12; // months in the Month by month table before the rest fold away

// "▲ 24 vs Sep" under a tile: the change from `before` to `now`, green when it's better (`up`:
// higher is better, false: lower is better, null: neither, as for games played).
function tileChange(now, before, vs, { up = true, digits = 0, unit = '' } = {}) {
  if (now == null || before == null) return '';
  const d = Number((now - before).toFixed(digits));
  const state = d === 0 || up === null ? 'same' : (d > 0) === up ? 'better' : 'worse';
  const text = d === 0 ? '= same' : `${d > 0 ? '▲' : '▼'} ${Math.abs(d).toFixed(digits)}${unit}`;
  return `<div class="tc trend ${state}">${text} <span>vs ${vs}</span></div>`;
}

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

// A best game or session as a row that opens it, dated on the right.
function bestRow(label, value, entry, sub = '') {
  const href = entry.game ? `#/summary/${entry.session.id}/${entry.game.id}` : `#/session/${entry.session.id}`;
  return kvRow(label, value, { sub, side: fmtShortDate(entry.session.date), href });
}

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
      ${swing ? `<p class="hint" id="swing">Most games land within <strong>±${swing.sd} pins</strong> of your average (${swing.within} of ${swing.games}).</p>` : ''}
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
      <ul class="kv side">${rows.join('')}</ul>
      <p class="hint">Repeating the same feet and arrow matters more than finding a perfect line. To track your aim, tag "Hit my arrow" or "Missed left/right" (What to log: Everything).</p>
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
      : '<p class="hint">Record "Pin hit" to see this (What to log: Everything).</p>'}
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
      <ul class="kv side">${kvRow('Strikes on pocket hits', fmtPct(c.strikes, c.pocket), { side: `${c.strikes} of ${c.pocket}` })}</ul>
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

// Strikes after strikes (doubles) against strikes after anything else, and the 10th frame.
function chainsCard(st) {
  if (st.games.length < 3) return '';
  const { afterStrike: a, afterOther: o, tenth: t } = strikeChains(st);
  const rate = (x) => pct(x.strikes, x.n);
  const gap = a.n >= 5 && o.n >= 5 ? rate(a) - rate(o) : 0;
  const note = gap >= 10 ? 'Your strikes come in bunches: once you find the pocket, stay on that line and speed.'
    : gap <= -10 ? 'You strike less often right after a strike. Keep the same feet, arrow and speed on the next ball instead of changing.'
    : '';
  return `
    <section class="card" id="chains">
      <div class="card-h"><h3>Strikes in a row &amp; the 10th</h3></div>
      <ul class="kv side">
        ${kvRow(`Strike after a strike ${infoButton('double')}`, fmtPct(a.strikes, a.n), { sub: 'a double', side: `${a.strikes} of ${a.n}` })}
        ${kvRow('Strike after a spare or open', fmtPct(o.strikes, o.n), { side: `${o.strikes} of ${o.n}` })}
        ${kvRow(`Mark in the 10th frame ${infoButton('mark')}`, fmtPct(t.marks, t.n), { sub: 'a strike or a spare', side: `${t.marks} of ${t.n}` })}
      </ul>
      ${note ? `<p class="hint">${note}</p>` : ''}
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
      <ul class="kv side">
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
  // Aims start from your usual strike line over all games and learn from your tries, like
  // the game screen and practice.
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
        const aim = spareAimFor(l.standing, db.sessions, db.practice, hand);
        const p = practice.get(name);
        return `
        <li><details>
          <summary>
            ${miniPins(l.standing, 40)}
            <span class="leave-info">
              <span class="leave-name"><strong>${name}</strong>${l.split ? ' <span class="tag-split">split</span>' : ''}</span>
              <span class="sub">Left ${l.count}× (${pct(l.count, st.firstBalls)}% of 1st balls) · picked up ${l.made}/${l.chances}${p ? ` · practice ${p.made}/${p.n}` : ''}</span>
              <span class="sub">Aim: feet ${aim.feet}${aim.learned ? ` (3-6-9: ${aim.base})` : ''} · arrow ${aim.target}${l.worked ? ` · worked for you: feet ${l.worked.feet}, arrow ${l.worked.target} (${l.worked.made}/${l.worked.n})` : ''}</span>
            </span>
          </summary>
          <div class="leave-more">
            <ul class="leave-hist">${l.history.slice(-8).reverse().map((x) => `
              <li>${fmtShortDate(x.session.date)} · game ${x.gameNo}, frame ${x.frame + 1}: ${outcome(x)}</li>`).join('')}</ul>
            <a class="link" href="#/practice/${name}">Practice the ${name} →</a>
          </div>
        </details></li>`;
      }).join('')}</ul>
      <p class="hint">Aims use the 3-6-9 system from your usual strike line, moved a board or two by your own tries. ${infoButton('spareAim')}</p>
    </section>`;
}

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

// ---------- Monthly ----------

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

// ---------- Lifetime ----------

// What the tiles and Overview's Personal bests don't already show.
function soFarCard(t) {
  const center = t.centers[0];
  const ball = t.balls[0];
  const since = new Date(`${t.firstDate}T00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
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

// A filter box only shows when there's something to pick between (or it's in use).
const hideIf = (values, selected) => (values.length < 2 && !selected ? ' hidden' : '');

// One line on Overview when missed spares cost enough to mention; it opens Spares.
function spareCostLine(st) {
  const lost = st.games.length >= COST_MIN_GAMES ? sparePinsLost(st) : null;
  if (!lost || lost.all < COST_SHOWN) return '';
  return `<button type="button" class="link stat-link" id="sparesCost" data-goto="spares">Missed spares cost you about ${Math.round(lost.all)} pins a game →</button>`;
}

function spareCostCard(lost) {
  if (!lost) return '';
  const all = Math.round(lost.all);
  return `
    <section class="card" id="spareCost">
      <div class="card-h"><h3>What missed spares cost</h3><small>pins a game</small></div>
      ${all === 0 ? '<p class="hint">You made every spare you had a chance at. Nothing lost!</p>' : `
      <ul class="kv">
        ${kvRow('Missed spares', all, { sub: 'if you\'d made every one' })}
        ${kvRow('Missed single pins', Math.round(lost.singles), { sub: 'the easiest ones to fix' })}
      </ul>
      <p class="hint">A missed spare costs the pins left standing and the bonus your next ball would have added.</p>`}
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
  // League nights or the rest: only worth offering when there are both.
  const kinds = db.settings.league.on && db.sessions.some((x) => x.league) && db.sessions.some((x) => !x.league) ? ['league', 'other'] : [];
  if (!kinds.includes(filters.kind)) filters.kind = '';
  const ownDates = OWN_DATES.includes(tab);
  const sessions = filterSessions(db.sessions, ownDates ? { ...filters, days: 0 } : filters);
  const st = computeStats(sessions);
  const hints = tips(st, db.settings.hand, sessions, db.settings.speedUnit, (leave) => spareAimFor(leave, db.sessions, db.practice, db.settings.hand));
  const filtered = (!ownDates && filters.days) || filters.center || filters.ball || filters.oil || filters.kind;
  const practiced = db.practice.length;
  const practiceMade = db.practice.filter((p) => p.made).length;

  let body = '';
  let trend = null;
  let months = null;
  if (!st.games.length) {
    // The empty message below covers it.
  } else if (tab === 'monthly') {
    months = monthlyStats(sessions);
    body = monthlyBody(months);
  } else if (tab === 'lifetime') {
    body = lifetimeBody(st);
  } else if (tab === 'overview') {
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
      ${spareCostLine(st)}
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
      ${chainsCard(st)}
      ${byGameCard(st.byGame)}
      ${speedCard(st)}`;
  } else if (tab === 'spares') {
    body = `
      <div class="tiles pairs" id="spareTiles">
        ${tile(fmtPct(st.sparesMade, st.spareChances), 'Spares made', tileCount(st.sparesMade, st.spareChances))}
        ${tile(fmtPct(st.singleMade, st.singleChances), '1-pin spares', tileCount(st.singleMade, st.singleChances))}
        ${tile(fmtPct(st.multiMade, st.multiChances), `Multi-pin spares ${infoButton('multiPin')}`, tileCount(st.multiMade, st.multiChances))}
        ${tile(fmtPct(st.splitMade, st.splitChances), `Splits made ${infoButton('split')}`, tileCount(st.splitMade, st.splitChances))}
      </div>
      ${spareCostCard(sparePinsLost(st))}
      ${tipsHTML(hints.filter((t) => t.topic === 'spares'))}
      ${leavesCard(st, db.settings.hand)}
      ${practiced ? `<p class="meta" id="practiceLine">Spare practice: ${practiceMade} of ${practiced} made (${fmtPct(practiceMade, practiced)})</p>` : ''}
      <a class="btn block" href="#/practice">Go to Spare practice</a>`;
  } else {
    body = feelCard(st);
  }

  root.innerHTML = `
    ${topbar({ title: 'Stats' })}
    <div class="page">
      <div class="filters">
        <select id="fDays" aria-label="Date range"${ownDates ? ' hidden' : ''}>
          <option value="0"${filters.days === 0 ? ' selected' : ''}>All time</option>
          <option value="30"${filters.days === 30 ? ' selected' : ''}>Last 30 days</option>
          <option value="90"${filters.days === 90 ? ' selected' : ''}>Last 90 days</option>
        </select>
        <select id="fCenter" aria-label="Bowling center"${hideIf(centers, filters.center)}>${options(centers, filters.center, 'All centers')}</select>
        <select id="fBall" aria-label="Ball"${hideIf(balls, filters.ball)}>${options(balls, filters.ball, 'All balls')}</select>
        <select id="fOil" aria-label="Oil pattern"${hideIf(oils, filters.oil)}>${options(oils, filters.oil, 'All oil patterns')}</select>
        <select id="fKind" aria-label="League or other bowling"${hideIf(kinds, filters.kind)}>
          <option value="">All bowling</option>
          <option value="league"${filters.kind === 'league' ? ' selected' : ''}>League nights</option>
          <option value="other"${filters.kind === 'other' ? ' selected' : ''}>Other bowling</option>
        </select>
        ${filtered ? '<button type="button" class="link" id="clearFilters">Clear filters</button>' : ''}
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
    lineChart(root.querySelector('#trend'), trend.points, { refValue: Math.round(st.average), refLabel: 'avg', smooth: trend.smooth, smoothLabel: `${ROLL}-game avg` });
  }
  // The tab strip scrolls sideways on narrow phones; keep the open tab in sight.
  const strip = root.querySelector('.subtabs');
  const openTab = strip?.querySelector('[aria-selected="true"]');
  if (openTab) strip.scrollLeft = Math.max(0, openTab.offsetLeft - (strip.clientWidth - openTab.offsetWidth) / 2);
  if (scrollToCard) {
    // After the router has put the new screen at the top.
    const card = root.querySelector(scrollToCard);
    scrollToCard = null;
    if (card) setTimeout(() => card.scrollIntoView({ block: 'start' }), 0);
  }

  if (months?.length >= 2) {
    const points = months.map((m) => ({ value: Math.round(m.st.average), label: `${fmtMonth(m.key)} · ${plural(m.st.games.length, 'game')}` }));
    lineChart(root.querySelector('#monthTrend'), points, { refValue: Math.round(st.average), refLabel: 'avg' });
  }
  // The arrows next to the month name and the rows of the month table. A month picked from
  // the table, at the bottom of the page, opens at the top.
  root.querySelectorAll('[data-month-key]').forEach((el) => {
    el.onclick = () => {
      month = el.dataset.monthKey;
      render(root);
      if ('top' in el.dataset) window.scrollTo({ top: 0 });
      else root.querySelector(`#${el.id}`)?.focus();
    };
  });
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

  const clear = root.querySelector('#clearFilters');
  if (clear) {
    clear.onclick = () => {
      Object.assign(filters, NO_FILTERS);
      render(root);
    };
  }
  root.querySelector('#fDays').onchange = (e) => { filters.days = Number(e.target.value); render(root); };
  root.querySelector('#fCenter').onchange = (e) => { filters.center = e.target.value; render(root); };
  root.querySelector('#fBall').onchange = (e) => { filters.ball = e.target.value; render(root); };
  root.querySelector('#fOil').onchange = (e) => { filters.oil = e.target.value; render(root); };
  root.querySelector('#fKind').onchange = (e) => { filters.kind = e.target.value; render(root); };
  // Links that open another tab (Overview's line about missed spares).
  root.querySelectorAll('[data-goto]').forEach((el) => {
    el.onclick = () => {
      tab = el.dataset.goto;
      render(root);
      window.scrollTo({ top: 0 });
    };
  });
}
