// Stat calculations over sessions. Pure functions, no DOM.

import { pinsBefore, isFreshRack, isSplit, frameDone, scoreGame } from './scoring.js';
import { spareAim, keyPin, adjustAim } from './spares.js';
import { TAG } from './terms.js';
import { avg, pct, toSpeedUnit } from './util.js';

// ---------- Cache ----------
// Working out stats takes a while with hundreds of games, and one screen asks for them several
// times (the spare aim, goals, tips...). So results are kept until the data changes: storage
// calls dataChanged() on every save. Until it does (the unit tests), nothing is kept.
let caching = false;
const cache = new Map();
export function dataChanged() {
  caching = true;
  cache.clear();
}
// Back to working everything out each time (for tests).
export function stopCaching() {
  caching = false;
  cache.clear();
}
// Which games a list holds and where they stand. Lists made for a single game reuse its session's id.
const gamesKey = (sessions) => sessions.map((s) => `${s.id}:${s.games.map((g) => `${g.id}${g.done ? '' : '~'}${g.score}`).join('.')}`).join('|');
function kept(name, sessions, work) {
  if (!caching) return work();
  const key = `${name}|${gamesKey(sessions)}`;
  if (!cache.has(key)) {
    if (cache.size >= 200) cache.clear(); // one entry per month on Monthly, so room for years of them
    cache.set(key, work());
  }
  return cache.get(key);
}

// Every recorded ball, with context.
export function collectShots(sessions) {
  return kept('shots', sessions, () => shotsOf(sessions));
}
function shotsOf(sessions) {
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

// `kind`: '' for everything, 'league' for league nights only, 'other' for everything else.
export function filterSessions(sessions, { days = 0, center = '', ball = '', oil = '', kind = '' } = {}) {
  let cutoff = '';
  if (days) {
    // Local calendar date, to match how session dates are stored.
    const d = new Date();
    d.setDate(d.getDate() - days);
    const pad = (n) => String(n).padStart(2, '0');
    cutoff = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }
  return sessions.filter((s) => (!cutoff || s.date >= cutoff) && (!center || s.center === center)
    && (!ball || s.ball === ball) && (!oil || s.oil === oil)
    && (!kind || (kind === 'league') === !!s.league));
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

// Every finished game as { session, game, number (its place in the session) }, oldest first.
export function finishedGames(sessions) {
  const games = [];
  sessions.forEach((s) => s.games.forEach((g, i) => { if (g.done) games.push({ session: s, game: g, number: i + 1 }); }));
  return games.sort((a, b) => a.session.date.localeCompare(b.session.date));
}

export function computeStats(sessions) {
  return kept('stats', sessions, () => statsOf(sessions));
}
function statsOf(sessions) {
  const games = finishedGames(sessions);
  const scores = games.map((x) => x.game.score);

  const shots = collectShots(sessions);
  const first = shots.filter((x) => x.fresh);
  const strikes = first.filter((x) => x.shot.standing.length === 0);
  const leaveShots = first.filter((x) => x.shot.standing.length > 0);
  const spareChances = leaveShots.filter((x) => x.next);
  const sparesMade = spareChances.filter((x) => x.next.standing.length === 0);
  const singleChances = spareChances.filter((x) => x.shot.standing.length === 1);
  const singleMade = singleChances.filter((x) => x.next.standing.length === 0);
  // The other spare chances: splits, and leaves of 2 or more pins that aren't splits.
  const splitChances = spareChances.filter((x) => isSplit(x.shot.standing));
  const splitMade = splitChances.filter((x) => x.next.standing.length === 0);
  const multiChances = spareChances.filter((x) => x.shot.standing.length > 1 && !isSplit(x.shot.standing));
  const multiMade = multiChances.filter((x) => x.next.standing.length === 0);
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
    multiChances: multiChances.length,
    multiMade: multiMade.length,
    splitChances: splitChances.length,
    splitMade: splitMade.length,
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

const missOf = (tags) => (tags.includes(TAG.missedLeft) ? 'left' : tags.includes(TAG.missedRight) ? 'right' : null);

// Your spare tries at leaves with key pin `pin`, oldest first, for adjustAim: the feet you used
// compared with the 3-6-9 feet for that try. A game spare starts from that frame's first-ball
// feet (your strike line that day, at that center); practice from your usual strike line.
function spareTries(sessions, practice, pin, hand, line) {
  const out = [];
  for (const x of collectShots(sessions)) {
    if (!x.fresh || !x.shot.standing.length || !x.next || keyPin(x.shot.standing, hand) !== pin) continue;
    const from = x.shot.feet != null ? { feet: x.shot.feet, target: x.shot.target } : line;
    const aim = spareAim(x.shot.standing, from, hand);
    out.push({ date: x.session.date, offset: x.next.feet == null ? null : x.next.feet - aim.feet, made: !x.next.standing.length, miss: missOf(x.next.tags) });
  }
  for (const p of practice) {
    if (keyPin(p.leave, hand) !== pin) continue;
    const aim = spareAim(p.leave, line, hand);
    out.push({ date: p.date, offset: p.feet == null ? null : p.feet - aim.feet, made: p.made, miss: p.miss });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

// The spare aim for `leave`: the 3-6-9 system from your usual strike line, moved a board or
// two by your own tries. The game screen, Stats and Spare practice all use this.
export function spareAimFor(leave, sessions, practice, hand) {
  const line = strikeLineFor(sessions);
  const aim = spareAim(leave, line, hand);
  return aim && adjustAim(aim, spareTries(sessions, practice, aim.pin, hand, line), hand);
}

// The score if every missed spare had been made. Open frames get a spare instead; an open
// 10th frame also gets its extra ball, repeating the first ball there.
// With `singlesOnly`, only missed single-pin spares are counted as made.
export function scoreWithSpares(frames, { singlesOnly = false } = {}) {
  const fixed = frames.map((shots, f) => {
    const out = shots.map((s) => ({ standing: s.standing }));
    for (let i = 0; i < out.length - 1; i++) {
      if (isFreshRack(out, i) && out[i].standing.length && out[i + 1].standing.length
        && (!singlesOnly || out[i].standing.length === 1)) out[i + 1] = { standing: [] };
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
export function statsOfGames(list) {
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

// Strikes, longest run of strikes, turkeys (each separate run of 3 or more), open frames and
// splits picked up in one finished game.
export function gameMarks(game) {
  let strikes = 0;
  let run = 0;
  let streak = 0;
  let turkeys = 0;
  let opens = 0;
  let splitsMade = 0;
  game.frames.forEach((shots) => {
    shots.forEach((shot, i) => {
      if (!isFreshRack(shots, i)) return;
      if (shot.standing.length === 0) {
        strikes++;
        if (++run === 3) turkeys++;
        streak = Math.max(streak, run);
      } else {
        run = 0;
        if (isSplit(shot.standing) && shots[i + 1]?.standing.length === 0) splitsMade++;
      }
    });
    if (shots[0].standing.length > 0 && shots[1]?.standing.length !== 0) opens++;
  });
  return { strikes, streak, turkeys, opens, splitsMade };
}

// Each frame of the game, 1 to 10, over finished games: how often its first ball is a strike
// and how often it's left open (no strike, no spare). Shows whether you start slow or fade late.
export function frameMap(stats) {
  const rows = Array.from({ length: 10 }, (_, i) => ({ frame: i + 1, n: 0, strikes: 0, opens: 0 }));
  for (const { game } of stats.games) {
    game.frames.forEach((shots, f) => {
      if (!shots.length) return;
      rows[f].n++;
      if (shots[0].standing.length === 0) rows[f].strikes++;
      else if (shots[1]?.standing.length !== 0) rows[f].opens++;
    });
  }
  return rows;
}

// Reading frameMap rows: from FRAME_READ_GAMES games, your strike % in frames 1-3 against 8-10
// and the frames well away from your usual. Fewer games than that are mostly luck.
// Returns null before then, or { early, late, trend: 'slow' | 'fade' | null, strikes, opens },
// where strikes and opens hold 'better', 'worse' or null for each frame.
export const FRAME_READ_GAMES = 20;
const FRAME_TREND_GAP = 10; // points between the start and the end of the game
const FRAME_CELL_GAP = 15;  // points between one frame and your usual
export function frameTrend(rows) {
  if (Math.min(...rows.map((r) => r.n)) < FRAME_READ_GAMES) return null;
  const rate = (k, list) => pct(list.reduce((a, r) => a + r[k], 0), list.reduce((a, r) => a + r.n, 0));
  const early = rate('strikes', rows.slice(0, 3));
  const late = rate('strikes', rows.slice(7));
  const mark = (k, up) => rows.map((r) => {
    const d = pct(r[k], r.n) - rate(k, rows);
    return Math.abs(d) < FRAME_CELL_GAP ? null : (d > 0) === up ? 'better' : 'worse';
  });
  const trend = early - late >= FRAME_TREND_GAP ? 'fade' : late - early >= FRAME_TREND_GAP ? 'slow' : null;
  return { early, late, trend, strikes: mark('strikes', true), opens: mark('opens', false) };
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

// What missed spares cost: the average pins a game you'd have added by making every spare,
// and by making only the single-pin ones. Null before any finished games.
// Kept with the stats it was worked out from: Overview and Spares both ask, and it scores every game twice.
const lostOf = new WeakMap();
export function sparePinsLost(stats) {
  if (!stats.games.length) return null;
  if (!lostOf.has(stats)) {
    const lost = (opts) => avg(stats.games.map(({ game }) => scoreWithSpares(game.frames, opts) - game.score));
    lostOf.set(stats, { all: lost(), singles: lost({ singlesOnly: true }) });
  }
  return lostOf.get(stats);
}

// How much your scores swing: the standard deviation of your finished games, and how many of
// them land within that many pins of your average. Null before 5 games.
export const SWING_MIN_GAMES = 5;
export function scoreSwing(stats) {
  const scores = stats.games.map((g) => g.game.score);
  if (scores.length < SWING_MIN_GAMES) return null;
  const mean = avg(scores);
  const sd = Math.sqrt(avg(scores.map((x) => (x - mean) ** 2)));
  const within = scores.filter((x) => Math.abs(x - mean) <= sd).length;
  return { sd: Math.round(sd), within, games: scores.length };
}

// The average of each value and the k - 1 before it; null until there are k values.
export function rollingAverage(values, k = 5) {
  return values.map((_, i) => (i < k - 1 ? null : avg(values.slice(i - k + 1, i + 1))));
}

// Strike chains and the 10th frame, over finished games. A first ball counts toward
// afterStrike or afterOther by how the rack before it in the same game went.
export function strikeChains(stats) {
  const afterStrike = { n: 0, strikes: 0 };
  const afterOther = { n: 0, strikes: 0 };
  const tenth = { n: 0, marks: 0 };
  for (const { game } of stats.games) {
    let prev = null; // was the last first ball a strike?
    game.frames.forEach((shots, f) => {
      shots.forEach((shot, i) => {
        if (!isFreshRack(shots, i)) return;
        const strike = shot.standing.length === 0;
        if (prev !== null) {
          const bucket = prev ? afterStrike : afterOther;
          bucket.n++;
          if (strike) bucket.strikes++;
        }
        prev = strike;
      });
      if (f === 9 && shots.length) {
        tenth.n++;
        if (shots[0].standing.length === 0 || shots[1]?.standing.length === 0) tenth.marks++;
      }
    });
  }
  return { afterStrike, afterOther, tenth };
}

// ---------- Months and lifetime ----------

// One entry per calendar month with finished games, oldest first:
// { key: 'YYYY-MM', sessions, st (computeStats of that month), days (days bowled) }.
export function monthlyStats(sessions) {
  const byMonth = new Map();
  for (const s of sessions) {
    const key = s.date.slice(0, 7);
    if (!byMonth.has(key)) byMonth.set(key, []);
    byMonth.get(key).push(s);
  }
  return [...byMonth]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, list]) => ({ key, sessions: list, st: computeStats(list) }))
    .filter((m) => m.st.games.length)
    .map((m) => ({ ...m, days: new Set(m.st.games.map((g) => g.session.date)).size }));
}

// Most games first: [{ name, games }] for a session field such as center or ball.
function mostPlayed(stats, field) {
  const counts = new Map();
  for (const { session } of stats.games) {
    const name = session[field];
    if (name) counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return [...counts].map(([name, games]) => ({ name, games })).sort((a, b) => b.games - a.games);
}

// Totals over every finished game in `stats`.
export function lifetimeTotals(stats) {
  const marks = stats.games.map((g) => gameMarks(g.game));
  const sum = (key) => marks.reduce((a, m) => a + m[key], 0);
  const series = seriesScores(stats);
  return {
    games: stats.games.length,
    sessions: new Set(stats.games.map((g) => g.session)).size,
    days: new Set(stats.games.map((g) => g.session.date)).size,
    firstDate: stats.games[0]?.session.date ?? null,
    frames: stats.frames,
    pins: stats.games.reduce((a, g) => a + g.game.score, 0),
    strikes: stats.strikes,
    sparesMade: stats.sparesMade,
    spareChances: stats.spareChances,
    splitsMade: sum('splitsMade'),
    turkeys: sum('turkeys'),
    cleanGames: marks.filter((m) => m.opens === 0).length,
    over200: stats.games.filter((g) => g.game.score >= 200).length,
    highSeries: series.length ? Math.max(...series.map((x) => x.score)) : null,
    centers: mostPlayed(stats, 'center'),
    balls: mostPlayed(stats, 'ball'),
  };
}

export const SPREAD_BUCKETS = [
  { label: 'Under 100', min: 0 },
  { label: '100–124', min: 100 },
  { label: '125–149', min: 125 },
  { label: '150–174', min: 150 },
  { label: '175–199', min: 175 },
  { label: '200–249', min: 200 },
  { label: '250+', min: 250 },
];

// How many games fall in each score range, and how often you break 150 and 200.
export function scoreSpread(stats) {
  const scores = stats.games.map((g) => g.game.score);
  const rows = SPREAD_BUCKETS.map((b, i) => {
    const max = SPREAD_BUCKETS[i + 1]?.min ?? Infinity;
    return { label: b.label, value: scores.filter((s) => s >= b.min && s < max).length };
  });
  return {
    rows,
    games: scores.length,
    pct150: pct(scores.filter((s) => s >= 150).length, scores.length),
    pct200: pct(scores.filter((s) => s >= 200).length, scores.length),
  };
}
