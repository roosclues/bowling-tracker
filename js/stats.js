// Stat calculations over sessions. Pure functions, no DOM.

import { pinsBefore, isFreshRack, isSplit, frameDone } from './scoring.js';
import { avg } from './util.js';

// Every recorded ball, with context.
export function collectShots(sessions) {
  const out = [];
  for (const session of sessions) {
    session.games.forEach((game) => {
      game.frames.forEach((shots, frame) => {
        shots.forEach((shot, i) => {
          const before = pinsBefore(shots, i);
          out.push({
            session, game, frame, index: i, shot,
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

export function filterSessions(sessions, { days = 0, center = '', ball = '' } = {}) {
  let cutoff = '';
  if (days) {
    // Local calendar date, to match how session dates are stored.
    const d = new Date();
    d.setDate(d.getDate() - days);
    const pad = (n) => String(n).padStart(2, '0');
    cutoff = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }
  return sessions.filter((s) => (!cutoff || s.date >= cutoff) && (!center || s.center === center) && (!ball || s.ball === ball));
}

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

  // Most common leaves after the first ball.
  const leaveMap = new Map();
  for (const x of leaveShots) {
    const k = x.shot.standing.join('-');
    const e = leaveMap.get(k) ?? { standing: x.shot.standing, count: 0, chances: 0, made: 0, split: isSplit(x.shot.standing) };
    e.count++;
    if (x.next) {
      e.chances++;
      if (x.next.standing.length === 0) e.made++;
    }
    leaveMap.set(k, e);
  }
  const leaves = [...leaveMap.values()].sort((a, b) => b.count - a.count);

  // Feet + arrow combinations on first balls.
  const comboMap = new Map();
  for (const x of first) {
    const { feet, target, hit } = x.shot;
    if (feet == null || target == null) continue;
    const k = `${feet}|${target}`;
    const e = comboMap.get(k) ?? { feet, target, n: 0, strikes: 0, pins: 0, hitN: 0, pocket: 0 };
    e.n++;
    e.pins += x.knocked;
    if (x.shot.standing.length === 0) e.strikes++;
    if (hit) {
      e.hitN++;
      if (hit === 'pocket') e.pocket++;
    }
    comboMap.set(k, e);
  }
  const combos = [...comboMap.values()].sort((a, b) =>
    (b.strikes / b.n) - (a.strikes / a.n)
    || (b.hitN ? b.pocket / b.hitN : 0) - (a.hitN ? a.pocket / a.hitN : 0)
    || b.n - a.n);

  const hits = {};
  for (const x of first) if (x.shot.hit) hits[x.shot.hit] = (hits[x.shot.hit] ?? 0) + 1;

  const tags = {};
  for (const x of shots) for (const t of x.shot.tags ?? []) tags[t] = (tags[t] ?? 0) + 1;

  const speeds = shots.map((x) => x.shot.speed).filter((v) => typeof v === 'number');

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
    leaves, combos, hits, tags,
    speedAvg: avg(speeds),
    speedCount: speeds.length,
  };
}

// Simple coaching hints from the data. Returns a list of { title, text }.
export function tips(stats, hand) {
  const out = [];
  const handSide = hand === 'L' ? 'left' : 'right';
  const otherSide = hand === 'L' ? 'right' : 'left';
  const h = stats.hits;
  const light = h.light ?? 0;
  const high = (h.high ?? 0) + (h.brooklyn ?? 0);
  const pocket = h.pocket ?? 0;
  const n = light + high + pocket;
  // Name real boards: start from the feet position used most on first balls.
  const feet = stats.combos.reduce((best, c) => (!best || c.n > best.n ? c : best), null)?.feet ?? 20;
  const move = (d) => `board ${feet} → ${Math.min(39, Math.max(1, feet + d))}`;

  if (n >= 3) {
    if (light / n >= 0.5) {
      out.push({ title: 'Mostly light hits', text: `Keep the same arrow and move your feet 2 boards ${handSide}, toward your bowling-hand side (${move(-2)}).` });
    } else if (high / n >= 0.5) {
      out.push({ title: 'Mostly high hits', text: `Keep the same arrow and move your feet 2 boards ${otherSide}, away from your bowling-hand side (${move(2)}).` });
    } else if (pocket / n >= 0.5) {
      out.push({ title: 'Pocket hits!', text: 'Your line is working. Keep the same feet and arrow, and focus on repeating your release.' });
    }
  }
  if (stats.singleChances >= 4 && stats.singleMade / stats.singleChances < 0.6) {
    out.push({ title: 'Single-pin spares', text: 'Single pins are the easiest spares to improve. Throw them straight, walk toward your target, and cross the lane: for pins on your hand side, stand on the far side of the approach.' });
  }
  const missTags = (stats.tags['Missed left'] ?? 0) + (stats.tags['Missed right'] ?? 0);
  if (missTags >= 3 && missTags > (stats.tags['Hit my arrow'] ?? 0)) {
    out.push({ title: 'Watch the arrow', text: 'You often missed your arrow. Keep your eyes on the arrow (not the pins) until the ball rolls over it.' });
  }
  return out;
}
