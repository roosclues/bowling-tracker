// Session setup form and session detail (games, how the session went, tips, feet moves,
// your note on the lane). The form shows your lane notes as you type the center and lane.

import { db, save, findSession, findGame, newGame, requestPersist, unstampGoals, sortSessions, moveGame } from '../storage.js';
import { computeStats, tips, seriesOf, sessionMoves, MOVE_MIN, spareAimFor, leagueStanding, LEAGUE_MIN_GAMES } from '../stats.js';
import { infoButton } from '../terms.js';
import { topbar, icon, tipsHTML, logChips } from '../ui.js';
import { esc, uid, todayISO, fmtDate, go, toast, avg, fmtPct, plural } from '../util.js';
import { showStatsFor } from './stats.js';
import { showLanes, laneNoteRow } from './lanes.js';
import { findNote, notesAt, noteSummary, laneWarning } from '../lanenotes.js';

const OILS = ['Unknown', 'House shot', 'Sport / league pattern', 'Dry lanes', 'Oily lanes'];

function distinct(field) {
  const seen = new Set();
  for (let i = db.sessions.length - 1; i >= 0; i--) {
    const v = db.sessions[i][field];
    if (v) seen.add(v);
  }
  return [...seen];
}

// Starts a session with its first game and opens that game. Used by the form and by Home's
// one-tap "Bowl at …", which repeats the last center, ball and oil.
export function startSession(fields) {
  const league = db.settings.league.on && !!fields.league;
  db.settings.last = { center: fields.center, ball: fields.ball, oil: fields.oil, league };
  const session = { id: uid(), ...fields, league, games: [newGame()] };
  db.sessions.push(session);
  sortSessions();
  db.settings.sessionsSinceBackup = (db.settings.sessionsSinceBackup || 0) + 1;
  save();
  requestPersist();
  go(`#/game/${session.id}/${session.games[0].id}`);
}

// A new session shows only center, lane and what to log; the rest keeps last time's values
// under "More details". Editing a session opens everything.
export function renderForm(root, sid) {
  const existing = sid ? findSession(sid) : null;
  const last = db.settings.last || {};
  const s = existing ?? { date: todayISO(), center: last.center ?? '', lane: '', ball: last.ball ?? '', oil: last.oil || 'Unknown', notes: '', league: !!last.league };
  let level = db.settings.log;
  const leagueOn = db.settings.league.on;

  root.innerHTML = `
    ${topbar({ back: existing ? `#/session/${existing.id}` : '#/', title: existing ? 'Edit session' : 'New session' })}
    <form class="page form" id="sessionForm" autocomplete="off">
      <div class="card">
      ${leagueOn ? `
      <label class="switch-row" id="leagueRow">
        <span><span class="sw-label">League night</span><span class="hint">Counts toward your league average and handicap.</span></span>
        <input type="checkbox" class="switch" name="league" id="leagueNight"${s.league ? ' checked' : ''}>
      </label>` : ''}
      <div class="field">
        <label for="center">Bowling center</label>
        <input id="center" name="center" list="centers" placeholder="e.g. Strike Zone Lanes" value="${esc(s.center)}">
        <datalist id="centers">${distinct('center').map((c) => `<option value="${esc(c)}">`).join('')}</datalist>
      </div>
      <div class="field">
        <label for="lane">Lane number</label>
        <input id="lane" name="lane" inputmode="numeric" placeholder="e.g. 12" value="${esc(s.lane)}">
        <p class="hint lane-hint" id="laneHint" aria-live="polite" hidden></p>
      </div>
      ${existing ? '' : `
      <div class="field">
        <label>What to log ${infoButton('log')}</label>
        <div class="seg full" id="logLevel">${logChips(level)}</div>
        <p class="hint">Your score and spares always count. Feet and arrow carry over from ball to ball, so you only change them when you move. You can switch during the game.</p>
      </div>`}
      </div>
      <details class="card more" id="sessionMore"${existing ? ' open' : ''}>
        <summary>More details <small>date, ball, oil, notes</small></summary>
        <div class="field">
          <label for="date">Date</label>
          <input id="date" name="date" type="date" value="${esc(s.date)}">
          ${existing && existing.games.length > 1 ? `<p class="hint" id="dateHint">This moves all ${existing.games.length} games. Only one on the wrong date? Open that game and tap Move to another date.</p>` : ''}
        </div>
        <div class="field">
          <label for="ball">Ball</label>
          <input id="ball" name="ball" list="balls" placeholder="e.g. House ball 12 lb" value="${esc(s.ball)}">
          <datalist id="balls">${distinct('ball').map((c) => `<option value="${esc(c)}">`).join('')}</datalist>
        </div>
        <div class="field">
          <label for="oil">Oil pattern ${infoButton('oil')}</label>
          <select id="oil" name="oil">${OILS.map((o) => `<option${o === s.oil ? ' selected' : ''}>${o}</option>`).join('')}</select>
        </div>
        <div class="field">
          <label for="notes">Notes</label>
          <textarea id="notes" name="notes" rows="2" placeholder="How you felt, what you're working on…">${esc(s.notes)}</textarea>
        </div>
      </details>
      <button class="btn primary block big" type="submit">${existing ? `${icon('check')} Save` : `${icon('ball')} Start bowling`}</button>
    </form>`;

  // Your note on the lane you type, or the lanes you marked at the center: while you're at
  // the desk you can still ask for another lane.
  const centerInput = root.querySelector('#center');
  const laneInput = root.querySelector('#lane');
  const hint = root.querySelector('#laneHint');
  const showLaneHint = () => {
    const note = findNote(db.laneNotes, centerInput.value, laneInput.value);
    const warn = note ? '' : laneWarning(db.laneNotes, centerInput.value);
    const avoid = note ? note.verdict === 'avoid' : notesAt(db.laneNotes, centerInput.value).some((n) => n.verdict === 'avoid');
    hint.innerHTML = note ? `Your note on lane ${esc(note.lane)}: ${noteSummary(note)}` : warn;
    hint.classList.toggle('warn', avoid);
    hint.hidden = !hint.innerHTML;
  };
  centerInput.addEventListener('input', showLaneHint);
  laneInput.addEventListener('input', showLaneHint);
  showLaneHint();

  root.querySelector('#logLevel')?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-log]');
    if (!btn) return;
    level = btn.dataset.log;
    e.currentTarget.innerHTML = logChips(level);
  });

  root.querySelector('#sessionForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    // The date sits in the folded section, so an emptied box can't block the form: it means today.
    const fields = {
      date: f.date || todayISO(), center: f.center.trim(), lane: f.lane.trim(),
      ball: f.ball.trim(), oil: f.oil, notes: f.notes.trim(),
      // With league off the switch isn't shown, so a session keeps what it was.
      league: leagueOn ? f.league === 'on' : !!existing?.league,
    };
    if (existing) {
      // Fixing an older session doesn't change what Home's "Bowl at" repeats.
      if (existing === db.sessions.at(-1)) db.settings.last = { center: fields.center, ball: fields.ball, oil: fields.oil, league: fields.league };
      Object.assign(existing, fields);
      sortSessions(); // a new date can put it before or after other sessions
      save();
      go(`#/session/${existing.id}`);
      return;
    }
    db.settings.log = level;
    startSession(fields);
  });
}

// Move a finished game to another date: into a session already on that date, or a new one with
// the same center, lane, ball and oil. Opened from the game summary.
export function renderMove(root, sid, gid) {
  const session = findSession(sid);
  const game = findGame(sid, gid);
  if (!game?.done) {
    root.innerHTML = `<div class="page"><p>Game not found.</p><a class="btn" href="#/">Home</a></div>`;
    return;
  }
  const gameNo = session.games.indexOf(game) + 1;
  const only = session.games.length === 1;
  const back = `#/summary/${sid}/${gid}`;
  const where = esc(session.center || 'this center');
  const today = todayISO();
  let pick = null; // a session id, or 'new'
  let changed = false; // the date box has been touched

  root.innerHTML = `
    ${topbar({ back, title: `Move game ${gameNo}`, sub: fmtDate(session.date) })}
    <div class="page form">
      <div class="card">
        <div class="field">
          <label for="moveDate">Date it was bowled</label>
          <input id="moveDate" type="date" max="${today}" value="${esc(session.date)}">
        </div>
        <div class="field">
          <label id="moveToLabel">Put it in</label>
          <div class="move-to" id="moveTo" role="group" aria-labelledby="moveToLabel"></div>
          <p class="hint" id="moveHint" aria-live="polite"></p>
        </div>
      </div>
      <button type="button" class="btn primary block big" data-act="move" id="moveBtn">${icon('check')} Move game</button>
      <p class="hint center">To move the whole session, change its date with Edit on the session screen.</p>
    </div>`;

  const dateInput = root.querySelector('#moveDate');
  const box = root.querySelector('#moveTo');
  const label = root.querySelector('#moveToLabel');
  const hint = root.querySelector('#moveHint');
  const btn = root.querySelector('#moveBtn');

  // The choices for the date in the box: sessions already on that day, then a new session.
  const choices = () => {
    const date = dateInput.value;
    if (!date || date > today) return []; // a finished game can't be from a day still to come
    const list = db.sessions.filter((x) => x.date === date && x !== session).map((x) => ({
      id: x.id,
      center: x.center,
      label: [esc(x.center || 'Bowling session'), x.lane && `lane ${esc(x.lane)}`, plural(x.games.length, 'game')].filter(Boolean).join(' · '),
    }));
    if (date !== session.date) list.push({ id: 'new', label: only ? `Its own session at ${where}` : `A new session at ${where}` });
    return list;
  };

  const draw = () => {
    const list = choices();
    if (!list.some((c) => c.id === pick)) {
      pick = (list.find((c) => c.id !== 'new' && c.center === session.center) ?? list.find((c) => c.id === 'new') ?? list[0])?.id ?? null;
    }
    box.innerHTML = list.map((c) => `
      <button type="button" class="chip${c.id === pick ? ' on' : ''}" data-to="${c.id}" aria-pressed="${c.id === pick}">${c.label}</button>`).join('');
    label.hidden = !list.length;
    if (dateInput.value > today) hint.textContent = 'That day is still to come. Pick today or earlier.';
    else if (!list.length && changed && dateInput.value) hint.textContent = 'This game is already on that date. Pick another one.';
    else if (!list.length) hint.textContent = 'Pick the date this game was bowled.';
    else if (only && pick === 'new') hint.textContent = 'This is the session\'s only game, so the session moves with it, notes and all.';
    else if (only) hint.textContent = 'This is the session\'s only game, so the session joins that one. Its notes go along.';
    else hint.textContent = '';
    btn.disabled = !pick;
  };
  dateInput.addEventListener('input', () => {
    changed = true;
    draw();
  });
  draw();

  root.onclick = (e) => {
    // Back replaces this screen, like the other edit screens, so the phone's Back button
    // doesn't come back here from the summary.
    if (e.target.closest('.tb-back')) {
      e.preventDefault();
      go(back, { replace: true });
      return;
    }
    const to = e.target.closest('[data-to]');
    if (to) {
      pick = to.dataset.to;
      draw();
      return;
    }
    if (e.target.closest('[data-act="move"]') && pick) {
      const into = moveGame(session, game, dateInput.value, pick === 'new' ? null : pick);
      if (!into) { // moved or deleted from another copy of the app in the meantime
        go('#/', { replace: true });
        return;
      }
      toast(`Game moved to ${fmtDate(into.date)}`);
      go(`#/summary/${into.id}/${gid}`, { replace: true });
    }
  };
}

// A league night's handicap (from the league average going into it) and its series with it.
function leagueLine(s, series) {
  if (!s.league || !db.settings.league.on) return '';
  const st = leagueStanding(db.sessions, db.settings.league, s);
  const text = st.handicap == null
    ? `Handicap starts after ${LEAGUE_MIN_GAMES} league games <span class="nowrap">(${st.games} so far).</span>`
    : [`Handicap ${st.handicap} a game`, series != null && `series <strong>${series + 3 * st.handicap}</strong> with handicap`].filter(Boolean).join(' · ');
  return `<p class="meta" id="leagueLine"><span class="tag-league">League</span> ${text}</p>`;
}

// "3 strikes in 9 · 7.8 pins", plus pocket hits when enough were recorded.
function runText(r) {
  return [`${r.strikes} ${r.strikes === 1 ? 'strike' : 'strikes'} in ${r.n}`, `${r.pins.toFixed(1)} pins`,
    r.hitN >= MOVE_MIN && `${r.pocket}/${r.hitN} pocket`].filter(Boolean).join(' · ');
}

// Feet moves during the session and how the first balls went before and after each one.
function movesCard(moves, hand) {
  if (!moves.length) return '';
  const side = (d) => ((d > 0) === (hand !== 'L') ? 'left' : 'right'); // boards count from the hand side
  return `
    <section class="card" id="moves">
      <div class="card-h"><h3>Your moves</h3><small>1st balls</small></div>
      <ul class="moves">${moves.map((m) => {
        const d = m.to - m.from;
        const { arrow: a } = m.before;
        const { arrow: b } = m.after;
        const arrow = a != null && b != null ? `, arrow ${a === b ? a : `${a} → ${b}`}` : '';
        return `
        <li>
          <span class="move-title">Game ${m.gameNo} · frame ${m.frame + 1}: feet ${m.from} → ${m.to} (${plural(Math.abs(d), 'board')} ${side(d)})${arrow}</span>
          <span class="sub">Before: ${runText(m.before)}</span>
          <span class="sub">After: ${runText(m.after)}</span>
        </li>`;
      }).join('')}</ul>
      <p class="hint">A move is a new feet board you kept for at least 2 balls; a one-off ball doesn't count. One session is a small sample, so look for the same pattern over a few sessions.</p>
    </section>`;
}

export function renderDetail(root, sid) {
  const s = findSession(sid);
  if (!s) {
    root.innerHTML = `<div class="page"><p>Session not found.</p><a class="btn" href="#/">Home</a></div>`;
    return;
  }
  const done = s.games.filter((g) => g.done);
  const average = avg(done.map((g) => g.score));
  const series = seriesOf(s);
  const st = computeStats([s]);

  root.innerHTML = `
    ${topbar({
      back: '#/',
      title: esc(s.center || 'Bowling session'),
      sub: fmtDate(s.date),
      right: `<a class="tb-action" href="#/session/${s.id}/edit" aria-label="Edit session">${icon('edit', 20)}</a>`,
    })}
    <div class="page">
      <div class="tiles four" id="sessionTiles">
        <div class="tile"><div class="tv">${s.games.length}</div><div class="tl">Games</div></div>
        <div class="tile"><div class="tv">${average === null ? '–' : Math.round(average)}</div><div class="tl">Average</div></div>
        <div class="tile"><div class="tv">${done.length ? Math.max(...done.map((g) => g.score)) : '–'}</div><div class="tl">High</div></div>
        <div class="tile"><div class="tv">${series ?? '–'}</div><div class="tl">Series</div></div>
        <div class="tile"><div class="tv">${fmtPct(st.strikes, st.firstBalls)}</div><div class="tl">Strikes</div></div>
        <div class="tile"><div class="tv">${fmtPct(st.sparesMade, st.spareChances)}</div><div class="tl">Spares made</div></div>
        <div class="tile"><div class="tv">${st.games.length ? (st.opens / st.games.length).toFixed(1) : '–'}</div><div class="tl">Open frames a game</div></div>
        <div class="tile"><div class="tv">${st.firstBallAvg === null ? '–' : st.firstBallAvg.toFixed(1)}</div><div class="tl">1st-ball pins</div></div>
      </div>
      ${leagueLine(s, series)}
      <p class="meta">${[s.lane && `Lane ${esc(s.lane)}`, s.ball && esc(s.ball), s.oil && s.oil !== 'Unknown' && esc(s.oil)].filter(Boolean).join(' · ')}</p>
      ${laneNoteRow(s)}
      ${s.notes ? `<p class="notes">${esc(s.notes)}</p>` : ''}
      ${tipsHTML(tips(st, db.settings.hand, null, db.settings.speedUnit, (leave) => spareAimFor(leave, db.sessions, db.practice, db.settings.hand)))}
      ${movesCard(sessionMoves(s), db.settings.hand)}
      ${s.center && done.length ? `<button type="button" class="link" data-act="stats" id="centerStats">See all your stats at ${esc(s.center)} →</button>` : ''}
      <ul class="list">
        ${s.games.map((g, i) => `
          <li>
            <a href="${g.done ? `#/summary/${s.id}/${g.id}` : `#/game/${s.id}/${g.id}`}">
              <span class="li-main"><span class="li-title">Game ${i + 1}</span>${g.done ? '' : '<span class="li-sub">In progress</span>'}</span>
              <span class="score${g.done ? '' : ' live'}">${g.score}</span>
              <span class="chev">${icon('chevR', 18)}</span>
            </a>
          </li>`).join('')}
      </ul>
      <button class="btn primary block big" data-act="newgame">${icon('plus')} Bowl another game</button>
      <button class="btn danger block" data-act="delete">${icon('trash', 20)} Delete this session</button>
    </div>`;

  root.onclick = (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'newgame') {
      const open = s.games.find((g) => !g.done);
      if (open) {
        toast('Finish the game in progress first');
        go(`#/game/${s.id}/${open.id}`);
        return;
      }
      const g = newGame();
      s.games.push(g);
      save();
      go(`#/game/${s.id}/${g.id}`);
    } else if (act === 'stats') {
      showStatsFor({ center: s.center });
    } else if (act === 'lanenote') {
      showLanes({ center: s.center, lane: s.lane, sid: s.id, back: `#/session/${s.id}` });
    } else if (act === 'delete') {
      if (!confirm(`Delete this session and its ${plural(s.games.length, 'game')}? This cannot be undone.`)) return;
      s.games.forEach(unstampGoals);
      db.sessions.splice(db.sessions.indexOf(s), 1);
      save();
      go('#/');
    }
  };
}
