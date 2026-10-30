// End-of-game summary: score, how it compares, marks, and a frame-by-frame review. Any ball
// can be opened to add or change its details (feet, arrow, pin hit…) after the game.

import { db, save, findSession, findGame, newGame, unstampGoals } from '../storage.js';
import { marks, isFreshRack, isSplit, ALL_PINS } from '../scoring.js';
import { scoreboardHTML } from '../scoreboard.js';
import { computeStats, tips, goalText, seriesOf, scoreWithSpares } from '../stats.js';
import { hitLabel } from '../terms.js';
import { miniPins } from '../pins.js';
import { esc, fmtPct, go, avg, plural, fmtSpeed } from '../util.js';
import { topbar, icon, tipsHTML } from '../ui.js';
import { reopenLastBall, ballsWithoutLine } from './game.js';

// Earlier games needed before "vs your average" means anything.
const MIN_FOR_AVERAGE = 3;

function shotRow(shots, i, m, f) {
  const s = shots[i];
  const fresh = isFreshRack(shots, i);
  const left = s.standing.length;
  // A spare you missed: offer to practise that leave.
  const missed = fresh && left > 0 && left < ALL_PINS.length && shots[i + 1]?.standing.length > 0;
  const parts = [];
  if (s.feet != null) parts.push(`Feet ${s.feet}`);
  if (s.target != null) parts.push(`Arrow ${s.target}`);
  if (s.breakpoint != null) parts.push(`Breakpoint ${s.breakpoint}`);
  if (s.hit) parts.push(hitLabel(s.hit));
  if (s.speed != null) parts.push(fmtSpeed(s.speed, db.settings.speedUnit));
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
        ${missed ? `<a class="link" href="#/practice/${s.standing.join('-')}">Practice the ${s.standing.join('-')} →</a>` : ''}
      </div>
      <button type="button" class="link shot-edit" data-f="${f}" data-s="${i}" aria-label="Edit frame ${f + 1}, ball ${i + 1}">Edit</button>
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
  const hints = tips(st, db.settings.hand, null, db.settings.speedUnit);
  // A record when it was bowled: higher than every finished game before it.
  const allGames = computeStats(db.sessions).games.map((x) => x.game);
  const earlier = allGames.slice(0, allGames.indexOf(game));
  const newHigh = earlier.length > 0 && game.score > Math.max(...earlier.map((g) => g.score));
  const reached = db.settings.goals.filter((g) => g.reachedGame === game.id);
  // Your average coming into this game.
  const before = earlier.length >= MIN_FOR_AVERAGE ? Math.round(avg(earlier.map((g) => g.score))) : null;
  const diff = before === null ? null : game.score - before;
  const withSpares = scoreWithSpares(game.frames);
  // The 3-game series, once this session's first three games are done (and this is one of them).
  const series = session.games.filter((g) => g.done).indexOf(game) < 3 ? seriesOf(session) : null;
  const missing = ballsWithoutLine(game).length;

  root.innerHTML = `
    ${topbar({ back: `#/session/${sid}`, title: `Game ${gameNo} summary`, sub: esc(session.center || '') })}
    <div class="page">
      <section class="hero final">
        <div class="hero-label">Final score</div>
        ${newHigh ? '<div class="pill new-high">New high game!</div>' : ''}
        ${reached.map((g) => `<div class="pill new-high goal-reached">Goal reached: ${goalText(g)}</div>`).join('')}
        <div class="final-score">${game.score}</div>
        ${diff !== null ? `
          <div class="hero-trend" id="vsAverage">
            <b class="${diff > 0 ? 'up' : diff < 0 ? 'down' : ''}">${diff > 0 ? `+${diff}` : diff < 0 ? `${diff}` : '±0'}</b>
            vs your average (${before})
          </div>` : ''}
        <div class="sb-wrap">${scoreboardHTML(game.frames)}</div>
      </section>
      <p class="hint center">Tap any ball to add or change its details.</p>
      ${missing ? `
        <button type="button" class="btn block" data-act="review" id="reviewBtn">${icon('edit', 20)} Add details · ${plural(missing, 'ball')} to fill in</button>` : ''}
      <div class="tiles four">
        <div class="tile"><div class="tv">${st.strikes}</div><div class="tl">Strikes</div></div>
        <div class="tile"><div class="tv">${st.sparesMade}/${st.spareChances}</div><div class="tl">Spares made</div></div>
        <div class="tile"><div class="tv">${st.opens}</div><div class="tl">Open frames</div></div>
        <div class="tile"><div class="tv">${st.firstBallAvg === null ? '–' : st.firstBallAvg.toFixed(1)}</div><div class="tl">1st-ball pins</div></div>
      </div>
      <p class="meta center">Strike rate ${fmtPct(st.strikes, st.firstBalls)} · Spare rate ${fmtPct(st.sparesMade, st.spareChances)}${st.splits ? ` · ${plural(st.splits, 'split')}` : ''}</p>
      ${withSpares > game.score ? `<p class="meta center" id="whatIf">If you'd picked up every spare: <strong>${withSpares}</strong></p>` : ''}
      ${series !== null ? `<p class="meta center" id="series">3-game series: <strong>${series}</strong></p>` : ''}

      ${tipsHTML(hints)}

      <div class="actions-row">
        <button class="btn primary" data-act="another">${icon('plus')} Another game</button>
        <a class="btn" href="#/">Done for today</a>
      </div>

      <h3 class="section">Frame by frame</h3>
      <div class="frames-review">
        ${game.frames.map((shots, f) => {
          const m = marks(shots);
          return `<div class="fr"><div class="fr-n">${f + 1}</div><div class="fr-shots">${shots.map((_, i) => shotRow(shots, i, m, f)).join('')}</div></div>`;
        }).join('')}
      </div>

      <div class="actions-row">
        <button class="btn" data-act="undo">${icon('undo', 20)} Undo last ball</button>
        <button class="btn danger" data-act="delete">${icon('trash', 20)} Delete game</button>
      </div>
    </div>`;

  // Editing screens replace the summary in the history and come back to it with replace too,
  // so the phone's Back button skips them.
  root.onclick = (e) => {
    const ball = e.target.closest('[data-f]');
    if (ball) {
      go(`#/edit/${sid}/${gid}/${ball.dataset.f}/${ball.dataset.s}`, { replace: true });
      return;
    }
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'review') {
      go(`#/review/${sid}/${gid}`, { replace: true });
    } else if (act === 'another') {
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
      unstampGoals(game);
      session.games.splice(session.games.indexOf(game), 1);
      save();
      go(`#/session/${sid}`);
    }
  };
}
