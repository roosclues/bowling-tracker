// End-of-game summary: score, marks, and a frame-by-frame review.

import { db, save, findSession, findGame, newGame } from '../storage.js';
import { marks, isFreshRack, isSplit } from '../scoring.js';
import { scoreboardHTML } from '../scoreboard.js';
import { computeStats, tips } from '../stats.js';
import { hitLabel } from '../terms.js';
import { miniPins } from '../pins.js';
import { esc, fmtPct, go } from '../util.js';
import { topbar, icon } from '../ui.js';
import { reopenLastBall } from './game.js';

function shotRow(shots, i, m) {
  const s = shots[i];
  const fresh = isFreshRack(shots, i);
  const left = s.standing.length;
  const parts = [];
  if (s.feet != null) parts.push(`Feet ${s.feet}`);
  if (s.target != null) parts.push(`Arrow ${s.target}`);
  if (s.breakpoint != null) parts.push(`Breakpoint ${s.breakpoint}`);
  if (s.hit) parts.push(hitLabel(s.hit));
  if (s.speed != null) parts.push(`${s.speed} mph`);
  const split = fresh && isSplit(s.standing);
  let result = fresh ? 'Strike' : 'Spare';
  if (left === 10) result = 'No pins down';
  else if (left) result = `Left ${s.standing.join('-')}${split ? ' <span class="tag-split">split</span>' : ''}`;
  return `
    <div class="shot-row">
      <span class="mark">${m[i]}</span>
      ${left ? miniPins(s.standing, 34) : '<span class="mini-gap"></span>'}
      <div class="shot-info">
        <div>${result}</div>
        ${parts.length ? `<div class="sub">${parts.join(' · ')}</div>` : ''}
        ${(s.tags?.length || s.note) ? `<div class="sub">${[...(s.tags ?? []), s.note].filter(Boolean).map(esc).join(' · ')}</div>` : ''}
      </div>
    </div>`;
}

export function render(root, sid, gid) {
  const session = findSession(sid);
  const game = findGame(sid, gid);
  if (!game) {
    root.innerHTML = `<div class="page"><p>Game not found.</p><a class="btn" href="#/">Home</a></div>`;
    return;
  }
  if (!game.done) {
    go(`#/game/${sid}/${gid}`, { replace: true });
    return;
  }
  const st = computeStats([{ ...session, games: [game] }]);
  const gameNo = session.games.indexOf(game) + 1;
  const hints = tips(st, db.settings.hand);

  root.innerHTML = `
    ${topbar({ back: `#/session/${sid}`, title: `Game ${gameNo} summary`, sub: esc(session.center || '') })}
    <div class="page">
      <section class="hero final">
        <div class="hero-label">Final score</div>
        <div class="final-score">${game.score}</div>
        <div class="sb-wrap">${scoreboardHTML(game.frames)}</div>
      </section>
      <div class="tiles four">
        <div class="tile"><div class="tv">${st.strikes}</div><div class="tl">Strikes</div></div>
        <div class="tile"><div class="tv">${st.sparesMade}/${st.spareChances}</div><div class="tl">Spares</div></div>
        <div class="tile"><div class="tv">${st.opens}</div><div class="tl">Open frames</div></div>
        <div class="tile"><div class="tv">${st.firstBallAvg === null ? '–' : st.firstBallAvg.toFixed(1)}</div><div class="tl">1st-ball pins</div></div>
      </div>
      <p class="meta center">Strike rate ${fmtPct(st.strikes, st.firstBalls)} · Spare rate ${fmtPct(st.sparesMade, st.spareChances)}${st.splits ? ` · ${st.splits} split${st.splits > 1 ? 's' : ''}` : ''}</p>

      ${hints.map((t) => `<div class="tip"><strong>${t.title}</strong><p>${t.text}</p></div>`).join('')}

      <div class="actions-row">
        <button class="btn primary" data-act="another">${icon('plus')} Another game</button>
        <a class="btn" href="#/">Done for today</a>
      </div>

      <h3 class="section">Frame by frame</h3>
      <div class="frames-review">
        ${game.frames.map((shots, f) => {
          const m = marks(shots);
          return `<div class="fr"><div class="fr-n">${f + 1}</div><div class="fr-shots">${shots.map((_, i) => shotRow(shots, i, m)).join('')}</div></div>`;
        }).join('')}
      </div>

      <div class="actions-row">
        <button class="btn" data-act="undo">${icon('undo', 20)} Undo last ball</button>
        <button class="btn danger" data-act="delete">${icon('trash', 20)} Delete game</button>
      </div>
    </div>`;

  root.onclick = (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'another') {
      const open = session.games.find((g) => !g.done);
      const g = open ?? newGame();
      if (!open) session.games.push(g);
      save();
      go(`#/game/${sid}/${g.id}`);
    } else if (act === 'undo') {
      if (!confirm('Take back the last ball and reopen this game?')) return;
      reopenLastBall(game);
      go(`#/game/${sid}/${gid}`, { replace: true });
    } else if (act === 'delete') {
      if (!confirm('Delete this game? This cannot be undone.')) return;
      session.games.splice(session.games.indexOf(game), 1);
      save();
      go(`#/session/${sid}`);
    }
  };
}
