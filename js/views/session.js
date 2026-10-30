// Session setup form and session detail (games, how the session went, tips, feet moves).

import { db, save, findSession, newGame, requestPersist, unstampGoals } from '../storage.js';
import { computeStats, tips, seriesOf, sessionMoves, MOVE_MIN } from '../stats.js';
import { infoButton } from '../terms.js';
import { topbar, icon, tipsHTML } from '../ui.js';
import { esc, uid, todayISO, fmtDate, go, toast, avg, fmtPct, plural } from '../util.js';
import { showStatsFor } from './stats.js';

const OILS = ['Unknown', 'House shot', 'Sport / league pattern', 'Dry lanes', 'Oily lanes'];

function distinct(field) {
  const seen = new Set();
  for (let i = db.sessions.length - 1; i >= 0; i--) {
    const v = db.sessions[i][field];
    if (v) seen.add(v);
  }
  return [...seen];
}

export function renderForm(root, sid) {
  const existing = sid ? findSession(sid) : null;
  const last = db.settings.last || {};
  const s = existing ?? { date: todayISO(), center: last.center ?? '', lane: '', ball: last.ball ?? '', oil: last.oil || 'Unknown', notes: '' };

  root.innerHTML = `
    ${topbar({ back: existing ? `#/session/${existing.id}` : '#/', title: existing ? 'Edit session' : 'New session' })}
    <form class="page form" id="sessionForm" autocomplete="off">
      <div class="card">
      <div class="field">
        <label for="date">Date</label>
        <input id="date" name="date" type="date" required value="${esc(s.date)}">
      </div>
      <div class="field">
        <label for="center">Bowling center</label>
        <input id="center" name="center" list="centers" placeholder="e.g. Strike Zone Lanes" value="${esc(s.center)}">
        <datalist id="centers">${distinct('center').map((c) => `<option value="${esc(c)}">`).join('')}</datalist>
      </div>
      <div class="field">
        <label for="lane">Lane number</label>
        <input id="lane" name="lane" inputmode="numeric" placeholder="e.g. 12" value="${esc(s.lane)}">
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
      </div>
      <button class="btn primary block big" type="submit">${existing ? `${icon('check')} Save` : `${icon('ball')} Start bowling`}</button>
    </form>`;

  root.querySelector('#sessionForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    const fields = {
      date: f.date, center: f.center.trim(), lane: f.lane.trim(),
      ball: f.ball.trim(), oil: f.oil, notes: f.notes.trim(),
    };
    db.settings.last = { center: fields.center, ball: fields.ball, oil: fields.oil };
    if (existing) {
      Object.assign(existing, fields);
      save();
      go(`#/session/${existing.id}`);
      return;
    }
    const session = { id: uid(), ...fields, games: [newGame()] };
    db.sessions.push(session);
    db.sessions.sort((a, b) => a.date.localeCompare(b.date));
    db.settings.sessionsSinceBackup = (db.settings.sessionsSinceBackup || 0) + 1;
    save();
    requestPersist();
    go(`#/game/${session.id}/${session.games[0].id}`);
  });
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
      <p class="meta">${[s.lane && `Lane ${esc(s.lane)}`, s.ball && esc(s.ball), s.oil && s.oil !== 'Unknown' && esc(s.oil)].filter(Boolean).join(' · ')}</p>
      ${s.notes ? `<p class="notes">${esc(s.notes)}</p>` : ''}
      ${tipsHTML(tips(st, db.settings.hand, null, db.settings.speedUnit))}
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
    } else if (act === 'delete') {
      if (!confirm(`Delete this session and its ${plural(s.games.length, 'game')}? This cannot be undone.`)) return;
      s.games.forEach(unstampGoals);
      db.sessions.splice(db.sessions.indexOf(s), 1);
      save();
      go('#/');
    }
  };
}
