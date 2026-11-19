// Stats → First ball: best lines, how repeatable the shot is, where the ball hit, carry,
// strikes in a row, game by game and ball speed.

import { db } from '../../storage.js';
import { speedBands, strikeChains, frameMap, frameTrend, FRAME_READ_GAMES, MAX_GAME_NO } from '../../stats.js';
import { barList } from '../../charts.js';
import { miniPins } from '../../pins.js';
import { HITS, infoButton, carryNote } from '../../terms.js';
import { kvRow } from '../../ui.js';
import { fmtPct, pct, plural, fmtSpeed, SPEED_UNITS } from '../../util.js';
import { hitCount, table, tile } from './parts.js';

const MIN_COMBO = 3;
const MIN_CARRY = 5; // pocket hits before the carry card shows its numbers

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

const FRAMES_FROM = 5; // finished games before Frame by frame shows

// Strike % and open % for each frame of the game. With enough games (frameTrend), frames well
// above or below your usual are colored, and one line says if you start slow or fade late.
function frameMapCard(st) {
  if (st.games.length < FRAMES_FROM) return '';
  const rows = frameMap(st);
  const read = frameTrend(rows);
  const cells = (k) => rows.map((r, i) => `<td class="num${read?.[k][i] ? ` ${read[k][i]}` : ''}">${pct(r[k], r.n)}</td>`).join('');
  const note = read?.trend === 'fade' ? `You strike less late in the game (frames 1–3: ${read.early}%, 8–10: ${read.late}%). Keep the same routine and speed right to the end; tiredness and nerves show up in the last frames.`
    : read?.trend === 'slow' ? `You start slow (frames 1–3: ${read.early}%, 8–10: ${read.late}%). Use your practice balls to find your line, and bowl the 1st frame like any other.`
    : '';
  const colored = read && [...read.strikes, ...read.opens].some(Boolean);
  return `
    <section class="card" id="frameMap">
      <div class="card-h"><h3>Frame by frame</h3><small>${plural(st.games.length, 'game')}</small></div>
      ${table(`
        <thead><tr><th>Frame</th>${rows.map((r) => `<th class="num">${r.frame}</th>`).join('')}</tr></thead>
        <tbody>
          <tr><td>Strike %</td>${cells('strikes')}</tr>
          <tr><td>Open %</td>${cells('opens')}</tr>
        </tbody>`, 'frames')}
      ${note ? `<p class="hint" id="frameNote">${note}</p>` : ''}
      ${colored ? '<p class="hint">Green and red: frames well above or below your usual.</p>' : ''}
      ${read ? '' : `<p class="hint">After ${FRAME_READ_GAMES} games this points out where in the game you do best and worst.</p>`}
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

export function body({ st }) {
  return `
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
      ${frameMapCard(st)}
      ${byGameCard(st.byGame)}
      ${speedCard(st)}`;
}
