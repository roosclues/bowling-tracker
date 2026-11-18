// Milestones: things you reach once, like your first 200 game or 100 games bowled, with the
// game where you got there. Worked out from your games each time, so moving, editing or
// deleting a game updates them. Pure functions, no DOM.

import { finishedGames, gameMarks } from './stats.js';

// Each group is one running number; a milestone is reached when it gets to `target`.
export const MILESTONE_GROUPS = {
  games: { label: 'Games bowled', progress: (v, t) => `${v}/${t}` },
  high: { label: 'High game', progress: (v) => `your best is ${v}` },
  streak: { label: 'Strikes in a row', progress: (v) => (v ? `your best is ${v} in a row` : 'no strikes yet') },
  strikes: { label: 'Strikes', progress: (v, t) => `${v}/${t}` },
  series: { label: '3-game series', progress: (v) => (v ? `your best is ${v}` : 'bowl 3 games in a session') },
  clean: { label: 'Clean game', progress: () => 'a strike or spare in every frame' },
  split: { label: 'Split', progress: () => 'pick up a split' },
};

const defs = (group, targets, label) => targets.map((target) => ({ key: `${group}${target}`, group, target, label: label(target) }));

export const MILESTONES = [
  ...defs('games', [1, 10, 25, 50, 100, 250, 500], (n) => (n === 1 ? 'First game' : `${n} games bowled`)),
  ...defs('high', [100, 150, 175, 200, 225, 250, 300], (n) => (n === 300 ? 'Perfect game (300)' : `First ${n} game`)),
  ...defs('streak', [2, 3, 4, 6], (n) => ({ 2: 'First double', 3: 'First turkey' }[n] ?? `${n} strikes in a row`)),
  ...defs('strikes', [50, 100, 500], (n) => `${n} strikes`),
  ...defs('series', [450, 500, 600], (n) => `${n} series`),
  ...defs('clean', [1], () => 'Clean game (no open frames)'),
  ...defs('split', [1], () => 'First split picked up'),
];

// Every milestone with your current value in its group and `done` = { date, sid, gid } for
// the game that reached it, or null. Games are taken in date order.
export function milestones(sessions) {
  const value = { games: 0, high: 0, streak: 0, strikes: 0, series: 0, clean: 0, split: 0 };
  const done = new Map();
  const doneInSession = new Map();
  for (const { session, game } of finishedGames(sessions)) {
    const m = gameMarks(game);
    value.games++;
    value.high = Math.max(value.high, game.score);
    value.streak = Math.max(value.streak, m.streak);
    value.strikes += m.strikes;
    if (m.opens === 0) value.clean++;
    value.split += m.splitsMade;
    // A series is a session's first three finished games.
    const list = [...(doneInSession.get(session) ?? []), game.score];
    doneInSession.set(session, list);
    if (list.length === 3) value.series = Math.max(value.series, list[0] + list[1] + list[2]);
    for (const def of MILESTONES) {
      if (!done.has(def.key) && value[def.group] >= def.target) {
        done.set(def.key, { date: session.date, sid: session.id, gid: game.id });
      }
    }
  }
  return MILESTONES.map((def) => ({ ...def, value: value[def.group], done: done.get(def.key) ?? null }));
}

// "18/25", "your best is 187": how far you are toward a milestone you haven't reached.
export function milestoneProgress(m) {
  return MILESTONE_GROUPS[m.group].progress(m.value, m.target);
}

// The next milestone in each group, closest first.
export function nextMilestones(list, n = 3) {
  const seen = new Set();
  const next = [];
  for (const m of list) {
    if (m.done || seen.has(m.group)) continue;
    seen.add(m.group);
    next.push(m);
  }
  return next.sort((a, b) => b.value / b.target - a.value / a.target).slice(0, n);
}

// What one game reached: the highest milestone of each group, so a first 180 game shows
// "First 175 game" rather than 100, 150 and 175 as well.
export function milestonesForGame(list, gid) {
  const byGroup = new Map();
  for (const m of list) {
    if (m.done?.gid === gid) byGroup.set(m.group, m);
  }
  return [...byGroup.values()];
}
