// Goals (Home → Set a goal): targets measured over your most recent games.

import { computeStats, statsOfGames } from './stats.js';
import { pct } from './util.js';

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
