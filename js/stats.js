// Stat calculations over sessions. Pure functions, no DOM.

import { pinsBefore, isFreshRack, isSplit, frameDone, scoreGame } from './scoring.js';
import { spareAim } from './spares.js';
import { TAG, carryNote } from './terms.js';
import { avg, pct, plural, toSpeedUnit, SPEED_UNITS } from './util.js';

// Every recorded ball, with context.
export function collectShots(sessions) {
  const out = [];
  for (const session of sessions) {
    session.games.forEach((game, gi) => {
      game.frames.forEach((shots, frame) => {
        shots.forEach((shot, i) => {
          const before = pinsBefore(shots, i);
          out.push({
            session, game, gameNo: gi + 1, frame, index: i, shot,
            fresh: isFreshRack(shots, i),
            knocked: before.length - shot.standing.length,
            next: shots[i + 1] ?? null,
          });
        });
      });
    });
  }
  return out;
}

export function filterSessions(sessions, { days = 0, center = '', ball = '', oil = '' } = {}) {
  let cutoff = '';
  if (days) {
    // Local calendar date, to match how session dates are stored.
    const d = new Date();
    d.setDate(d.getDate() - days);
    const pad = (n) => String(n).padStart(2, '0');
    cutoff = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }
  return sessions.filter((s) => (!cutoff || s.date >= cutoff) && (!center || s.center === center)
    && (!ball || s.ball === ball) && (!oil || s.oil === oil));
}

// The most common value of shot[key] among `list`, or null.
function usual(list, key) {
  const counts = new Map();
  for (const x of list) if (x.shot[key] != null) counts.set(x.shot[key], (counts.get(x.shot[key]) ?? 0) + 1);
  let best = null;
  for (const [v, n] of counts) if (best === null || n > counts.get(best)) best = v;
  return best;
}

// How tightly a line repeats: the usual board, and how many balls were within a board of it.
function repeatability(list, key) {
  const rec = list.filter((x) => x.shot[key] != null);
  const board = usual(rec, key);
  return { board, n: rec.length, near: rec.filter((x) => Math.abs(x.shot[key] - board) <= 1).length };
}

export const MAX_GAME_NO = 4; // games 4, 5, ... of a session are grouped as "4+"

export function computeStats(sessions) {
  const games = [];
  sessions.forEach((s) => s.games.forEach((g, i) => { if (g.done) games.push({ session: s, game: g, number: i + 1 }); }));
  games.sort((a, b) => a.session.date.localeCompare(b.session.date));
  const scores = games.map((x) => x.game.score);

  const shots = collectShots(sessions);
  const first = shots.filter((x) => x.fresh);
  const strikes = first.filter((x) => x.shot.standing.length === 0);
  const leaveShots = first.filter((x) => x.shot.standing.length > 0);
  const spareChances = leaveShots.filter((x) => x.next);
  const sparesMade = spareChances.filter((x) => x.next.standing.length === 0);
  const singleChances = spareChances.filter((x) => x.shot.standing.length === 1);
  const singleMade = singleChances.filter((x) => x.next.standing.length === 0);
  const splits = leaveShots.filter((x) => isSplit(x.shot.standing));

  // Open frames: completed frames with no strike or spare.
  let frames = 0;
  let opens = 0;
  for (const { game } of games) {
    game.frames.forEach((fs, f) => {
      if (!frameDone(f, fs)) return;
      frames++;
      const mark = fs[0].standing.length === 0 || (fs[1] && fs[1].standing.length === 0);
      if (!mark) opens++;
    });
  }

  // Most common leaves after the first ball, with the spare lines tried on each.
  const leaveMap = new Map();
  for (const x of leaveShots) {
    const k = x.shot.standing.join('-');
    const e = leaveMap.get(k) ?? {
      standing: x.shot.standing, count: 0, chances: 0, made: 0, split: isSplit(x.shot.standing), lines: new Map(), history: [],
    };
    e.count++;
    e.history.push(x);
    if (x.next) {
      e.chances++;
      const made = x.next.standing.length === 0;
      if (made) e.made++;
      const { feet, target } = x.next;
      if (feet != null && target != null) {
        const line = e.lines.get(`${feet}|${target}`) ?? { feet, target, n: 0, made: 0 };
        line.n++;
        if (made) line.made++;
        e.lines.set(`${feet}|${target}`, line);
      }
    }
    leaveMap.set(k, e);
  }
  const leaves = [...leaveMap.values()].sort((a, b) => b.count - a.count).map(({ lines, ...e }) => ({
    ...e,
    // The spare line that has worked best here: tried twice or more, made at least half the time.
    worked: [...lines.values()].filter((l) => l.n >= 2 && l.made / l.n >= 0.5)
      .sort((a, b) => b.made / b.n - a.made / a.n || b.n - a.n)[0] ?? null,
  }));

  // Feet + arrow combinations on first balls, with the typical breakpoint.
  const comboMap = new Map();
  for (const x of first) {
    const { feet, target, hit, breakpoint } = x.shot;
    if (feet == null || target == null) continue;
    const k = `${feet}|${target}`;
    const e = comboMap.get(k) ?? { feet, target, n: 0, strikes: 0, pins: 0, hitN: 0, pocket: 0, bps: [] };
    e.n++;
    e.pins += x.knocked;
    if (x.shot.standing.length === 0) e.strikes++;
    if (hit) {
      e.hitN++;
      if (hit === 'pocket') e.pocket++;
    }
    if (breakpoint != null) e.bps.push(breakpoint);
    comboMap.set(k, e);
  }
  const combos = [...comboMap.values()].map(({ bps, ...c }) => ({ ...c, breakpoint: bps.length ? Math.round(avg(bps)) : null }))
    .sort((a, b) => (b.strikes / b.n) - (a.strikes / a.n)
      || (b.hitN ? b.pocket / b.hitN : 0) - (a.hitN ? a.pocket / a.hitN : 0)
      || b.n - a.n);

  const hits = {};
  for (const x of first) if (x.shot.hit) hits[x.shot.hit] = (hits[x.shot.hit] ?? 0) + 1;

  // Strike carry: what pocket hits left standing.
  const pocketShots = first.filter((x) => x.shot.hit === 'pocket');
  const carryMap = new Map();
  for (const x of pocketShots) {
    if (!x.shot.standing.length) continue;
    const k = x.shot.standing.join('-');
    const e = carryMap.get(k) ?? { pins: x.shot.standing, n: 0 };
    e.n++;
    carryMap.set(k, e);
  }
  const carry = {
    pocket: pocketShots.length,
    strikes: pocketShots.filter((x) => x.shot.standing.length === 0).length,
    leaves: [...carryMap.values()].sort((a, b) => b.n - a.n),
  };

  // "How it felt" tags, and how first balls with each tag turned out.
  const tags = {};
  const feelMap = new Map();
  for (const x of shots) {
    for (const t of x.shot.tags ?? []) {
      tags[t] = (tags[t] ?? 0) + 1;
      const e = feelMap.get(t) ?? { tag: t, n: 0, firstN: 0, strikes: 0, pins: 0 };
      e.n++;
      if (x.fresh) {
        e.firstN++;
        e.pins += x.knocked;
        if (x.shot.standing.length === 0) e.strikes++;
      }
      feelMap.set(t, e);
    }
  }
  const feel = [...feelMap.values()].sort((a, b) => b.n - a.n);

  const speeds = shots.map((x) => x.shot.speed).filter((v) => typeof v === 'number');
  const speedAvg = avg(speeds);
  const speedSD = speeds.length >= 2 ? Math.sqrt(avg(speeds.map((v) => (v - speedAvg) ** 2))) : null;
  // First balls with a speed, for speedBands().
  const speedFirst = first
    .filter((x) => typeof x.shot.speed === 'number')
    .map((x) => ({ speed: x.shot.speed, knocked: x.knocked, strike: x.shot.standing.length === 0 }));

  // First balls only, like the rest of the line stats.
  const firstTagged = (t) => first.filter((x) => x.shot.tags?.includes(t)).length;
  const accuracy = {
    feet: repeatability(first, 'feet'),
    target: repeatability(first, 'target'),
    arrowHit: firstTagged(TAG.hitArrow),
    arrowMiss: firstTagged(TAG.missedLeft) + firstTagged(TAG.missedRight),
  };

  // Game 1, 2, 3, 4+ of a session (finished games only): shows when the lane starts to change under you.
  const byGame = Array.from({ length: MAX_GAME_NO }, (_, i) => ({ no: i + 1, scores: [], firstBalls: 0, strikes: 0, hitN: 0, pocket: 0 }));
  for (const g of games) byGame[Math.min(g.number, MAX_GAME_NO) - 1].scores.push(g.game.score);
  for (const x of first) {
    if (!x.game.done) continue;
    const b = byGame[Math.min(x.gameNo, MAX_GAME_NO) - 1];
    b.firstBalls++;
    if (x.shot.standing.length === 0) b.strikes++;
    if (x.shot.hit) {
      b.hitN++;
      if (x.shot.hit === 'pocket') b.pocket++;
    }
  }

  return {
    games, scores,
    average: avg(scores),
    high: scores.length ? Math.max(...scores) : null,
    firstBalls: first.length,
    strikes: strikes.length,
    firstBallAvg: avg(first.map((x) => x.knocked)),
    spareChances: spareChances.length,
    sparesMade: sparesMade.length,
    singleChances: singleChances.length,
    singleMade: singleMade.length,
    splits: splits.length,
    leaveCount: leaveShots.length,
    frames, opens,
    leaves, combos, hits, carry, tags, feel,
    speedAvg, speedSD, speedFirst,
    speedCount: speeds.length,
    accuracy,
    byGame: byGame.filter((b) => b.scores.length).map((b) => ({ ...b, games: b.scores.length, average: avg(b.scores) })),
  };
}

// The line you play most on first balls: { feet, target }, or null before any are recorded.
// First balls grouped by speed in the given unit: 1 mph or 2 km/h wide.
// Returns [{ from, to, n, strikes, pins }], slowest first.
export function speedBands(stats, unit) {
  const width = unit === 'mph' ? 1 : 2;
  const bands = new Map();
  for (const x of stats.speedFirst) {
    const from = Math.floor(toSpeedUnit(x.speed, unit) / width) * width;
    const e = bands.get(from) ?? { from, to: from + width, n: 0, strikes: 0, pins: 0 };
    e.n++;
    e.pins += x.knocked;
    if (x.strike) e.strikes++;
    bands.set(from, e);
  }
  return [...bands.values()].sort((a, b) => a.from - b.from);
}

export const MOVE_MIN = 3; // first balls needed on each side of a move to list it

// How a run of first balls went, for comparing before and after a move.
function runOf(list) {
  const hit = list.filter((x) => x.shot.hit);
  return {
    n: list.length,
    strikes: list.filter((x) => x.shot.standing.length === 0).length,
    pins: avg(list.map((x) => x.knocked)),
    hitN: hit.length,
    pocket: hit.filter((x) => x.shot.hit === 'pocket').length,
    arrow: usual(list, 'target'),
  };
}

// Feet moves within a session: a new feet board on a first ball that the next first ball with
// feet keeps. A one-off board, or a different arrow, is a throw that varied, not a move.
// Each move compares the first balls since the move before with those up to the next one.
// Returns [{ gameNo, frame, from, to, before, after }], leaving out moves with fewer than
// MOVE_MIN first balls on either side.
export function sessionMoves(session) {
  const first = collectShots([session]).filter((x) => x.fresh);
  const withFeet = first.filter((x) => x.shot.feet != null);
  const moves = [];
  let spot = withFeet[0]?.shot.feet ?? null;
  withFeet.forEach((x, i) => {
    const feet = x.shot.feet;
    if (feet !== spot && withFeet[i + 1]?.shot.feet === feet) {
      moves.push({ at: first.indexOf(x), gameNo: x.gameNo, frame: x.frame, from: spot, to: feet });
      spot = feet;
    }
  });
  const cuts = [0, ...moves.map((m) => m.at), first.length];
  return moves
    .map(({ at, ...m }, j) => ({ ...m, before: runOf(first.slice(cuts[j], at)), after: runOf(first.slice(at, cuts[j + 2])) }))
    .filter((m) => m.before.n >= MOVE_MIN && m.after.n >= MOVE_MIN);
}

export function strikeLine(stats) {
  const c = stats.combos.reduce((best, x) => (!best || x.n > best.n ? x : best), null);
  return c ? { feet: c.feet, target: c.target } : null;
}

// Your usual strike line over all your games. Every spare aim starts from this, so the game
// screen, Stats and Spare practice always agree.
export function strikeLineFor(sessions) {
  return strikeLine(computeStats(sessions));
}

// The score if every missed spare had been made. Open frames get a spare instead; an open
// 10th frame also gets its extra ball, repeating the first ball there.
export function scoreWithSpares(frames) {
  const fixed = frames.map((shots, f) => {
    const out = shots.map((s) => ({ standing: s.standing }));
    for (let i = 0; i < out.length - 1; i++) {
      if (isFreshRack(out, i) && out[i].standing.length && out[i + 1].standing.length) out[i + 1] = { standing: [] };
    }
    if (f === 9 && out.length && !frameDone(9, out)) out.push({ standing: out[0].standing });
    return out;
  });
  return scoreGame(fixed).total;
}

// Spare practice tries grouped by leave: key "3-6-10" → { leave, n, made, todayN, todayMade }.
export function practiceByLeave(practice, today = '') {
  const map = new Map();
  for (const p of practice) {
    const k = p.leave.join('-');
    const e = map.get(k) ?? { leave: p.leave, n: 0, made: 0, todayN: 0, todayMade: 0 };
    e.n++;
    if (p.made) e.made++;
    if (p.date === today) {
      e.todayN++;
      if (p.made) e.todayMade++;
    }
    map.set(k, e);
  }
  return map;
}

// Your earliest finished games vs. your most recent ones: the same number of each (up to
// `maxGames`), so the two sides are fair to compare. Null until there are 4 finished games.
export function progress(sessions, maxGames = 10) {
  const { games } = computeStats(sessions);
  const k = Math.min(maxGames, Math.floor(games.length / 2));
  if (k < 2) return null;
  return { k, total: games.length, first: statsOfGames(games.slice(0, k)), last: statsOfGames(games.slice(-k)) };
}

// Stats over a hand-picked list of { session, game } entries.
function statsOfGames(list) {
  return computeStats(list.map(({ session, game }) => ({ ...session, games: [game] })));
}

function scoresBySession(stats) {
  const bySession = new Map();
  for (const { session, game } of stats.games) {
    if (!bySession.has(session)) bySession.set(session, []);
    bySession.get(session).push(game.score);
  }
  return [...bySession];
}

// One point per session: the average of its finished games, in date order.
export function sessionAverages(stats) {
  return scoresBySession(stats).map(([session, scores]) => ({ session, games: scores.length, average: avg(scores) }));
}

// A session's 3-game series: its first three finished games added up, or null.
export function seriesOf(session) {
  const done = session.games.filter((g) => g.done);
  return done.length >= 3 ? done[0].score + done[1].score + done[2].score : null;
}

// The series of every session in `stats` that has one.
export function seriesScores(stats) {
  return [...new Set(stats.games.map((g) => g.session))]
    .map((session) => ({ session, score: seriesOf(session) }))
    .filter((x) => x.score !== null);
}

// Strikes, longest run of strikes, and open frames in one finished game.
function gameMarks(game) {
  let strikes = 0;
  let run = 0;
  let streak = 0;
  let opens = 0;
  game.frames.forEach((shots) => {
    shots.forEach((shot, i) => {
      if (!isFreshRack(shots, i)) return;
      if (shot.standing.length === 0) {
        strikes++;
        streak = Math.max(streak, ++run);
      } else {
        run = 0;
      }
    });
    if (shots[0].standing.length > 0 && shots[1]?.standing.length !== 0) opens++;
  });
  return { strikes, streak, opens };
}

// Personal records, each with the game (and so the date) where it was first set.
export function personalBests(stats) {
  if (!stats.games.length) return null;
  const games = stats.games.map((g) => ({ ...g, score: g.game.score, ...gameMarks(g.game) }));
  const best = (key, better = (a, b) => b > a) => games.reduce((a, b) => (better(a[key], b[key]) ? b : a));
  const sessions = sessionAverages(stats).filter((x) => x.games >= 2);
  const series = seriesScores(stats);
  return {
    high: best('score'),
    strikes: best('strikes'),
    streak: best('streak'),
    fewestOpens: best('opens', (a, b) => b < a),
    session: sessions.length ? sessions.reduce((a, b) => (b.average > a.average ? b : a)) : null,
    series: series.length ? series.reduce((a, b) => (b.score > a.score ? b : a)) : null,
  };
}

// ---------- Goals ----------

// Goals are measured over your most recent games, so they follow your current form.
export const GOAL_WINDOW = 10;
export const GOAL_MIN_GAMES = 3;
const tenths = (v) => Math.round(v * 10) / 10;

export const GOAL_TYPES = [
  { key: 'average', label: 'Average score', get: (s) => s.average, round: Math.round, fmt: (v) => String(v), up: true, start: 150, step: 5, max: 300 },
  { key: 'spares', label: 'Spares made', get: (s) => pct(s.sparesMade, s.spareChances), round: (v) => v, fmt: (v) => `${v}%`, up: true, start: 50, step: 5, max: 100 },
  { key: 'single', label: '1-pin spares', get: (s) => pct(s.singleMade, s.singleChances), round: (v) => v, fmt: (v) => `${v}%`, up: true, start: 80, step: 5, max: 100 },
  { key: 'strikes', label: 'Strikes', get: (s) => pct(s.strikes, s.firstBalls), round: (v) => v, fmt: (v) => `${v}%`, up: true, start: 25, step: 5, max: 100 },
  { key: 'opens', label: 'Open frames a game', get: (s) => s.opens / s.games.length, round: tenths, fmt: (v) => String(v), up: false, start: 3, step: 0.5, max: 10 },
  { key: 'firstBall', label: '1st-ball pins', get: (s) => s.firstBallAvg, round: tenths, fmt: (v) => v.toFixed(1), up: true, start: 8, step: 0.5, max: 10 },
];

// Stats over your last GOAL_WINDOW finished games, leaving out `exclude` (a game object).
export function recentStats(sessions, exclude = null) {
  const { games } = computeStats(sessions);
  return statsOfGames(games.filter((g) => g.game !== exclude).slice(-GOAL_WINDOW));
}

// Where each goal stands: { goal, type, value, met, progress (0-1), games }.
export function goalStatus(sessions, goals, exclude = null) {
  const st = recentStats(sessions, exclude);
  const enough = st.games.length >= GOAL_MIN_GAMES;
  return goals.map((goal) => {
    const type = GOAL_TYPES.find((t) => t.key === goal.key);
    const raw = enough ? type.get(st) : null;
    const value = raw == null ? null : type.round(raw);
    const met = value != null && (type.up ? value >= goal.target : value <= goal.target);
    let progress = 0;
    if (met) progress = 1;
    else if (value != null) progress = type.up ? (goal.target ? value / goal.target : 1) : (value ? goal.target / value : 1);
    return { goal, type, value, met, progress: Math.max(0, Math.min(1, progress)), games: st.games.length };
  });
}

// "Spares made at least 60%", "Open frames a game at most 2.5".
export function goalText(goal) {
  const type = GOAL_TYPES.find((t) => t.key === goal.key);
  return `${type.label} ${type.up ? 'at least' : 'at most'} ${type.fmt(goal.target)}`;
}

// The goals that finishing `game` took from not met to met. A goal you were already beating
// before this game isn't credited to it.
export function goalsCrossed(sessions, goals, game) {
  const before = goalStatus(sessions, goals, game);
  return goalStatus(sessions, goals).filter((s, i) => s.met && !before[i].met).map((s) => s.goal);
}

// ---------- Coaching tips ----------

// The best-ranked line with at least `min` first balls, or null.
function bestCombo(stats, min) {
  return stats.combos.find((c) => c.n >= min) ?? null;
}

// Coaching hints from the data. Returns a list of { title, text, basis, topic, link? }:
// basis says how much data the hint stands on, topic is 'spares' or 'line' (which Stats tab
// it belongs on), and link is an optional screen to act on it. Pass `sessions` to also
// compare bowling centers. `speedUnit` is 'kph' or 'mph'.
export function tips(stats, hand, sessions = null, speedUnit = 'kph') {
  const out = [];
  const handSide = hand === 'L' ? 'left' : 'right';
  const otherSide = hand === 'L' ? 'right' : 'left';
  const h = stats.hits;
  const light = h.light ?? 0;
  const high = (h.high ?? 0) + (h.brooklyn ?? 0);
  const pocket = h.pocket ?? 0;
  const n = light + high + pocket;
  // Name real boards: start from the feet position used most on first balls.
  const line = strikeLine(stats);
  const feet = line?.feet ?? 20;
  const move = (d) => `board ${feet} → ${Math.min(39, Math.max(1, feet + d))}`;
  const hitBasis = `From ${plural(n, 'first ball')} with a pin hit recorded.`;

  if (n >= 3) {
    if (light / n >= 0.5) {
      out.push({ topic: 'line', title: 'Mostly light hits', text: `Keep the same arrow and move your feet 2 boards ${handSide}, toward your bowling-hand side (${move(-2)}).`, basis: hitBasis });
    } else if (high / n >= 0.5) {
      out.push({ topic: 'line', title: 'Mostly high hits', text: `Keep the same arrow and move your feet 2 boards ${otherSide}, away from your bowling-hand side (${move(2)}).`, basis: hitBasis });
    } else if (pocket / n >= 0.5) {
      out.push({ topic: 'line', title: 'Pocket hits!', text: 'Your line is working. Keep the same feet and arrow, and focus on repeating your release.', basis: hitBasis });
    }
  }

  // Pocket hits that don't carry, mostly leaving the same pins.
  const { carry } = stats;
  const notCarried = carry.pocket - carry.strikes;
  const topLeave = carry.leaves[0];
  const carryFix = topLeave && carryNote(topLeave.pins, hand);
  if (carry.pocket >= 10 && carry.strikes / carry.pocket < 0.6 && topLeave.n / notCarried >= 0.4 && carryFix?.fix) {
    out.push({
      topic: 'line',
      title: `Pocket hits leaving the ${topLeave.pins.join('-')}`,
      text: `You left the ${topLeave.pins.join('-')} on ${topLeave.n} of ${carry.pocket} pocket hits. ${carryFix.text}`,
      basis: `From ${plural(carry.pocket, 'pocket hit')}.`,
    });
  }

  // The leave you miss most (not splits: those are hard for everyone).
  const missed = stats.leaves.filter((l) => !l.split && l.chances >= 4 && l.made / l.chances < 0.5)
    .sort((a, b) => a.made / a.chances - b.made / b.chances || b.chances - a.chances)[0];
  if (missed) {
    const name = missed.standing.join('-');
    const aim = spareAim(missed.standing, line, hand);
    out.push({
      topic: 'spares',
      title: `The ${name} keeps getting away`,
      text: `You picked it up ${missed.made} of ${missed.chances} times. Try feet on board ${aim.feet} and the board ${aim.target} arrow (the 3-6-9 system), and work on it in Spare practice.`,
      basis: `From ${plural(missed.chances, 'try', 'tries')} at this leave.`,
      link: { href: `#/practice/${name}`, label: `Practice the ${name}` },
    });
  } else if (stats.singleChances >= 4 && stats.singleMade / stats.singleChances < 0.6) {
    out.push({
      topic: 'spares',
      title: 'Single-pin spares',
      text: 'Single pins are the easiest spares to improve. Throw them straight, walk toward your target, and cross the lane: for pins on your hand side, stand on the far side of the approach.',
      basis: `From ${plural(stats.singleChances, 'single-pin spare')}.`,
    });
  }

  if (stats.firstBalls >= 20 && stats.splits / stats.firstBalls >= 0.12) {
    out.push({
      topic: 'line',
      title: 'A lot of splits',
      text: `${pct(stats.splits, stats.firstBalls)}% of your first balls leave a split. Splits mostly come from high hits: try moving your feet 1–2 boards ${otherSide}, or slowing the ball down a little.`,
      basis: `From ${plural(stats.firstBalls, 'first ball')}.`,
    });
  }

  const missTags = stats.accuracy.arrowMiss;
  if (missTags >= 3 && missTags > stats.accuracy.arrowHit) {
    out.push({
      topic: 'line',
      title: 'Watch the arrow',
      text: 'You often missed your arrow. Keep your eyes on the arrow (not the pins) until the ball rolls over it.',
      basis: `From ${plural(missTags + stats.accuracy.arrowHit, 'first ball')} tagged with how you hit your arrow.`,
    });
  }

  if (stats.speedCount >= 8 && stats.speedSD >= 1) {
    out.push({
      topic: 'line',
      title: 'Steady your speed',
      text: `Your speed changes by about ±${toSpeedUnit(stats.speedSD, speedUnit).toFixed(1)} ${SPEED_UNITS[speedUnit]} from ball to ball, which changes how much the ball hooks. Use the same steps and the same push-away every time.`,
      basis: `From ${plural(stats.speedCount, 'ball')} with a speed recorded.`,
    });
  }

  const baseRate = stats.firstBalls ? stats.strikes / stats.firstBalls : 0;
  for (const f of stats.feel) {
    if (f.firstN < 4 || ![TAG.rushed, TAG.late].includes(f.tag)) continue;
    if (baseRate - f.strikes / f.firstN < 0.15) continue;
    const rushed = f.tag === TAG.rushed;
    out.push({
      topic: 'line',
      title: rushed ? 'Rushing costs you' : 'Late releases cost you',
      text: `When you tagged "${f.tag}" you struck ${pct(f.strikes, f.firstN)}% of the time, against ${pct(stats.strikes, stats.firstBalls)}% overall. ${rushed ? 'Take a breath and set up the same way before every ball.' : 'Let the ball go as your sliding foot stops, not after.'}`,
      basis: `From ${plural(f.firstN, 'first ball')} tagged "${f.tag}".`,
    });
  }

  const [g1, , g3] = stats.byGame;
  if (g1?.no === 1 && g3?.no === 3 && g1.games >= 3 && g3.games >= 3 && g1.average - g3.average >= 12) {
    out.push({
      topic: 'line',
      title: 'Scores drop later in a session',
      text: `Game 1 averages ${Math.round(g1.average)}, game 3 averages ${Math.round(g3.average)}. As the oil wears off the ball hooks sooner. When you start hitting high, move your feet 2 boards and your arrow 1 board away from your bowling-hand side.`,
      basis: `From ${g1.games} first games and ${g3.games} third games.`,
    });
  }

  if (sessions) {
    const overall = bestCombo(stats, 5);
    const centers = [...new Set(sessions.map((s) => s.center).filter(Boolean))];
    for (const center of centers.length > 1 ? centers : []) {
      const here = bestCombo(computeStats(sessions.filter((s) => s.center === center)), 5);
      if (!overall || !here || (here.feet === overall.feet && here.target === overall.target)) continue;
      out.push({
        topic: 'line',
        title: `A different line at ${center}`,
        text: `There, feet ${here.feet} + arrow ${here.target} strikes ${pct(here.strikes, here.n)}% of the time. Your best line overall is feet ${overall.feet} + arrow ${overall.target}. Start with the one that works at the center you're at.`,
        basis: `From ${plural(here.n, 'first ball')} on that line at ${center}.`,
      });
    }
  }
  return out;
}
