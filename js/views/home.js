// Home: continue/start bowling, practice and goals, headline stats, session history.

import { db, currentGame, backupDue } from '../storage.js';
import { computeStats, progress, goalStatus, practiceByLeave, GOAL_WINDOW, GOAL_MIN_GAMES } from '../stats.js';
import { goalListHTML } from './goals.js';
import { sparkline } from '../charts.js';
import { icon } from '../ui.js';
import { APP_VERSION } from '../version.js';
import { CHANGELOG } from '../changelog.js';
import { esc, fmtPct, dateParts, avg, plural, todayISO } from '../util.js';

const RECENT_GAMES = GOAL_WINDOW; // the hero average and goals look at the same games

// "the 10 pin" or "the 3-6-10".
const leaveName = (pins) => (pins.length === 1 ? `the ${pins[0]} pin` : `the ${pins.join('-')}`);

// Today's practice in one line, for the leave you worked on most. Empty if none today.
function practiceToday() {
  const today = todayISO();
  const top = [...practiceByLeave(db.practice, today).values()].filter((e) => e.todayN)
    .sort((a, b) => b.todayN - a.todayN)[0];
  if (!top) return '';
  return `
    <a class="hero-trend" id="practiceToday" href="#/practice/${top.leave.join('-')}">
      Today's practice: <b>${top.todayMade}/${top.todayN}</b> on ${leaveName(top.leave)}
    </a>`;
}

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

// Sessions newest first, one group per month with that month's average. The latest two
// months are open; older ones start collapsed.
function sessionGroups(sessions) {
  const months = new Map();
  for (const s of sessions) {
    const key = s.date.slice(0, 7);
    months.set(key, [...(months.get(key) ?? []), s]);
  }
  return [...months].map(([key, list], i) => {
    const [y, m] = key.split('-').map(Number);
    const name = new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    const scores = list.flatMap((s) => s.games.filter((g) => g.done).map((g) => g.score));
    const sub = [scores.length && `avg ${Math.round(avg(scores))}`, plural(scores.length, 'game')].filter(Boolean).join(' · ');
    return `
      <details class="month"${i < 2 ? ' open' : ''}>
        <summary><span class="month-name">${esc(name)}</span><span class="month-sub">${sub}</span></summary>
        <ul class="list sessions">${list.map(sessionRow).join('')}</ul>
      </details>`;
  }).join('');
}

export function render(root) {
  const cur = currentGame();
  const all = computeStats(db.sessions);
  const recent = all.scores.slice(-RECENT_GAMES);
  const recentAvg = recent.length ? Math.round(avg(recent)) : null;
  const sessions = db.sessions.slice().reverse();
  const backup = backupDue();
  const goals = db.settings.goals.length ? goalStatus(db.sessions, db.settings.goals) : null;
  // Goals need a few games to measure; once some are set, their card has an Edit link instead.
  const offerGoals = !goals && all.games.length >= GOAL_MIN_GAMES;
  const prog = progress(db.sessions);
  const change = prog && Math.round(prog.last.average) - Math.round(prog.first.average);
  const whatsNew = db.settings.seenVersion !== APP_VERSION && CHANGELOG.find((r) => r.version === APP_VERSION);

  const ctas = `
    ${cur ? `<a class="btn primary block big" href="#/game/${cur.session.id}/${cur.game.id}">${icon('ball')} Continue game · ${cur.game.score}</a>` : ''}
    <a class="btn ${cur ? 'on-dark' : 'primary'} block big" href="#/new">${icon('plus')} New session</a>
    <div class="actions-row">
      <a class="btn on-dark" href="#/practice">${icon('target', 20)} Spare practice</a>
      ${offerGoals ? `<a class="btn on-dark" href="#/goals">${icon('flag', 20)} Set a goal</a>` : ''}
    </div>
    ${practiceToday()}`;

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
      ${backup ? `
        <a class="banner" href="#/settings">
          ${icon('download')}
          <span><strong>Time for a backup</strong>
          <span>${backup.never ? 'No backup yet' : `Last backup ${plural(backup.days, 'day')} ago`}, ${plural(backup.sessions, 'session')} since. Your games live only on this phone: tap to save a copy.</span></span>
        </a>` : ''}

      ${all.games.length ? `
        <section class="hero">
          <div class="hero-row">
            <div>
              <div class="hero-label">Average · last ${plural(recent.length, 'game')}</div>
              <div class="hero-num">${recentAvg}</div>
            </div>
            <dl class="hero-side">
              <div><dt>High</dt><dd>${all.high}</dd></div>
              <div><dt>Games</dt><dd>${all.games.length}</dd></div>
            </dl>
          </div>
          ${prog ? `
            <a class="hero-trend" href="#/stats">
              <b class="${change > 0 ? 'up' : change < 0 ? 'down' : ''}">${change > 0 ? `▲ +${change}` : change < 0 ? `▼ ${change}` : '= same'}</b>
              average, last ${prog.k} games vs. your first ${prog.k}
            </a>` : ''}
          ${sparkline(recent)}
          ${ctas}
        </section>
        <div class="tiles">
          <div class="tile"><div class="tv">${fmtPct(all.strikes, all.firstBalls)}</div><div class="tl">Strikes</div></div>
          <div class="tile"><div class="tv">${fmtPct(all.sparesMade, all.spareChances)}</div><div class="tl">Spares made</div></div>
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

      ${goals ? `
        <section class="card" id="homeGoals">
          <div class="card-h"><h3>Goals</h3><a class="link" href="#/goals">Edit</a></div>
          ${goalListHTML(goals)}
        </section>` : ''}

      ${sessions.length ? `<h3 class="section">Sessions</h3>
      <div id="sessionMonths">${sessionGroups(sessions)}</div>` : ''}
    </div>`;
}
