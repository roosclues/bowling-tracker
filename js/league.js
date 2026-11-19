// League nights: your book average and handicap, worked out the way leagues do.

import { finishedGames } from './stats.js';
import { avg } from './util.js';

export const LEAGUE_MIN_GAMES = 3; // league games before the app works out your average
export const LEAGUE_ESTABLISH = 9; // league games after which your own average replaces a typed one
export const LEAGUE_DEFAULTS = { on: false, base: 220, pct: 90, seasonStart: null, average: null };

// Your league ("book") average and handicap going into the night `before` (a session in
// `sessions`), or now when it's null. Like a league's entering average, an average typed in from
// the league sheet is used until you've logged LEAGUE_ESTABLISH league games this season; then
// it's your own games before that night, rounded down as league sheets do. With nothing typed,
// your own average counts from LEAGUE_MIN_GAMES games.
// Returns { average, typed, games, handicap }; average and handicap are null until there's one.
export function leagueStanding(sessions, league, before = null) {
  const upto = before ? sessions.slice(0, Math.max(0, sessions.indexOf(before))) : sessions;
  const season = upto.filter((s) => s.league && (!league.seasonStart || s.date >= league.seasonStart));
  const scores = finishedGames(season).map((g) => g.game.score);
  const typed = league.average != null && scores.length < LEAGUE_ESTABLISH;
  const own = scores.length >= LEAGUE_MIN_GAMES ? Math.floor(avg(scores)) : null;
  const average = typed ? league.average : own;
  const handicap = average == null ? null : Math.floor((Math.max(0, league.base - average) * league.pct) / 100);
  return { average, typed, games: scores.length, handicap };
}
