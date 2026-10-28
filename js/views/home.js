// Home: continue/start bowling, headline stats, session history.

import { db, currentGame } from '../storage.js';
import { computeStats } from '../stats.js';
import { sparkline } from '../charts.js';
import { icon } from '../ui.js';
import { APP_VERSION } from '../version.js';
import { CHANGELOG } from '../changelog.js';
import { esc, fmtPct, dateParts } from '../util.js';

const RECENT_GAMES = 10;

function sessionRow(s) {
  const d = dateParts(s.date);
  return `
    <li>
      <a href="#/session/${s.id}">
        <span class="date-badge"><b>${d.day}</b><i>${esc(d.month)}</i></span>
        <span class="li-main">
          <span class="li-title">${esc(s.center || 'Bowling')}</span>
          <span class="li-sub">${esc(d.weekday)}${s.ball ? ' · ' + esc(s.ball) : ''}</span>
        </span>
        <span class="li-scores">${s.games.map((g) => `<span class="sc${g.done ? '' : ' live'}">${g.score}</span>`).join('')}</span>
      </a>
    </li>`;
}

export function render(root) {
  const cur = currentGame();
  const all = computeStats(db.sessions);
  const recent = all.scores.slice(-RECENT_GAMES);
  const recentAvg = recent.length ? Math.round(recent.reduce((a, b) => a + b, 0) / recent.length) : null;
  const sessions = db.sessions.slice().reverse();
  const needBackup = (db.settings.sessionsSinceBackup || 0) >= 5;
  const whatsNew = db.settings.seenVersion !== APP_VERSION && CHANGELOG.find((r) => r.version === APP_VERSION);

  const ctas = `
    ${cur ? `<a class="btn primary block big" href="#/game/${cur.session.id}/${cur.game.id}">${icon('ball')} Continue game · ${cur.game.score}</a>` : ''}
    <a class="btn ${cur ? 'on-dark' : 'primary'} block big" href="#/new">${icon('plus')} New session</a>`;

  root.innerHTML = `
    <header class="topbar brand">
      <span class="logo">${icon('ball', 22)}</span>
      <div class="tb-title"><div class="t1">Bowling Tracker</div></div>
    </header>
    <div class="page">
      ${whatsNew ? `
        <a class="banner" href="#/changelog">
          ${icon('list')}
          <span><strong>Updated: ${esc(whatsNew.title)}</strong>
          <span>Tap to see what's new in this version.</span></span>
        </a>` : ''}
      ${needBackup ? `
        <a class="banner" href="#/settings">
          ${icon('download')}
          <span><strong>Time for a backup</strong>
          <span>${db.settings.sessionsSinceBackup} sessions since your last one. Tap to save a copy.</span></span>
        </a>` : ''}

      ${all.games.length ? `
        <section class="hero">
          <div class="hero-row">
            <div>
              <div class="hero-label">Average · last ${recent.length} game${recent.length === 1 ? '' : 's'}</div>
              <div class="hero-num">${recentAvg}</div>
            </div>
            <dl class="hero-side">
              <div><dt>High</dt><dd>${all.high}</dd></div>
              <div><dt>Games</dt><dd>${all.games.length}</dd></div>
            </dl>
          </div>
          ${sparkline(recent)}
          ${ctas}
        </section>
        <div class="tiles">
          <div class="tile"><div class="tv">${fmtPct(all.strikes, all.firstBalls)}</div><div class="tl">Strikes</div></div>
          <div class="tile"><div class="tv">${fmtPct(all.sparesMade, all.spareChances)}</div><div class="tl">Spares</div></div>
          <div class="tile"><div class="tv">${all.firstBallAvg === null ? '–' : all.firstBallAvg.toFixed(1)}</div><div class="tl">1st-ball pins</div></div>
        </div>` : `
        <section class="hero welcome">
          <h2>Welcome to your bowling log</h2>
          <p>Log every ball: where your feet started, which arrow the ball rolled over, and which pins were left. After a few games, Stats shows which lines get you the most strikes.</p>
          ${ctas}
          <p class="hero-foot">New to the terms? <a href="#/help">Read the quick guide</a> · Left-handed? <a href="#/settings">Settings</a></p>
        </section>
        <h3 class="section">How it works</h3>
        <ol class="steps">
          <li><b>1</b><span><strong>Start a session</strong>Pick your bowling center, lane and ball.</span></li>
          <li><b>2</b><span><strong>Log every ball</strong>Tap the pins left standing, your feet board and the arrow you crossed.</span></li>
          <li><b>3</b><span><strong>See what works</strong>Stats ranks your feet + arrow lines by strike rate, so you know where to stand.</span></li>
        </ol>`}

      ${sessions.length ? `<h3 class="section">Sessions</h3>
      <ul class="list sessions">${sessions.map(sessionRow).join('')}</ul>` : ''}
    </div>`;
}
