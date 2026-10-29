import { scoreGame, nextShot, gameDone, marks, isSplit, frameDone } from '../js/scoring.js';
import { normalizeDB } from '../js/normalize.js';
import {
  computeStats, progress, personalBests, sessionAverages, seriesScores, seriesOf, goalStatus, goalsCrossed, goalText, tips,
  scoreWithSpares,
} from '../js/stats.js';
import { spareAim, keyPin } from '../js/spares.js';
import { plural } from '../js/util.js';

// Build frames from a list of pin counts, e.g. [10, 7, 3, ...].
function game(rolls) {
  const frames = Array.from({ length: 10 }, () => []);
  let available = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  for (const k of rolls) {
    const pos = nextShot(frames);
    if (!pos) throw new Error('too many rolls');
    if (pos.shot === 0) available = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const standing = available.slice(k);
    frames[pos.frame].push({ standing });
    available = standing.length ? standing : [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  }
  return frames;
}

const results = [];
function test(name, fn) {
  try {
    fn();
    results.push({ name, ok: true });
  } catch (e) {
    results.push({ name, ok: false, msg: e.message });
  }
}
function eq(actual, expected) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) throw new Error(`expected ${b}, got ${a}`);
}

test('perfect game is 300', () => {
  const g = game(Array(12).fill(10));
  eq(scoreGame(g).total, 300);
  eq(gameDone(g), true);
  eq(marks(g[9]), ['X', 'X', 'X']);
});

test('all gutters is 0', () => {
  const g = game(Array(20).fill(0));
  eq(scoreGame(g).total, 0);
  eq(gameDone(g), true);
  eq(marks(g[0]), ['-', '-']);
});

test('all 5/5 spares with a 5 bonus is 150', () => {
  const g = game(Array(21).fill(5));
  eq(scoreGame(g).total, 150);
  eq(marks(g[9]), ['5', '/', '5']);
});

test('open 10th frame ends after two balls', () => {
  const g = game([...Array(18).fill(0), 7, 2]);
  eq(gameDone(g), true);
  eq(scoreGame(g).total, 9);
});

test('10th frame spare earns a third ball', () => {
  const g = game([...Array(18).fill(0), 7, 3]);
  eq(gameDone(g), false);
  eq(nextShot(g), { frame: 9, shot: 2 });
  g[9].push({ standing: [] });
  eq(scoreGame(g).total, 20);
  eq(marks(g[9]), ['7', '/', 'X']);
});

test('10th frame strike then 7 then spare', () => {
  const g = game([...Array(18).fill(0), 10, 7, 3]);
  eq(gameDone(g), true);
  eq(scoreGame(g).total, 20);
  eq(marks(g[9]), ['X', '7', '/']);
});

test('0 then 10 on second ball is a spare, not a strike', () => {
  const g = game([0, 10, 3, 0]);
  eq(marks(g[0]), ['-', '/']);
  eq(scoreGame(g).cumulative.slice(0, 2), [13, 16]);
});

test('strike bonus waits for the next two balls', () => {
  const g = game([10, 4]);
  eq(scoreGame(g).cumulative[0], null);
  const g2 = game([10, 4, 3]);
  eq(scoreGame(g2).cumulative.slice(0, 2), [17, 24]);
});

test('known mixed game scores 167', () => {
  // X 7/ 9- X -8 8/ -6 X X X81
  const g = game([10, 7, 3, 9, 0, 10, 0, 8, 8, 2, 0, 6, 10, 10, 10, 8, 1]);
  eq(scoreGame(g).total, 167);
});

test('frame done rules', () => {
  eq(frameDone(0, [{ standing: [] }]), true);
  eq(frameDone(0, [{ standing: [7] }]), false);
  eq(frameDone(9, [{ standing: [] }, { standing: [] }]), false);
});

test('split detection', () => {
  eq(isSplit([7, 10]), true);
  eq(isSplit([4, 6]), true);
  eq(isSplit([3, 10]), true);
  eq(isSplit([2, 8]), false);
  eq(isSplit([1, 7]), false);
  eq(isSplit([10]), false);
  // side by side with the pin in front down
  eq(isSplit([5, 6]), true);
  eq(isSplit([9, 10]), true);
  eq(isSplit([4, 5]), true);
  // ...but not when the front pin is still standing
  eq(isSplit([2, 4, 5]), false);
  eq(isSplit([6, 9, 10]), false);
  eq(isSplit([2, 4]), false);
});

test('restore rejects files that are not backups', () => {
  for (const bad of [null, {}, { foo: 1 }, { sessions: 'x' }, { sessions: [{ id: 'a' }] }]) {
    let threw = false;
    try { normalizeDB(bad); } catch { threw = true; }
    eq(threw, true);
  }
});

test('restore replaces unsafe ids', () => {
  const db = normalizeDB({ sessions: [{ id: 'x"><img src=x onerror=alert(1)>', games: [{ id: '"><b>' }] }] });
  eq(/^\w+$/.test(db.sessions[0].id), true);
  eq(/^\w+$/.test(db.sessions[0].games[0].id), true);
});

test('restore repairs damaged games instead of crashing', () => {
  const db = normalizeDB({ sessions: [{ id: 'a', date: 'nope', games: [{}, { frames: 'x' }] }] });
  eq(db.sessions[0].games.map((g) => [g.frames.length, g.done, g.score]), [[10, false, 0], [10, false, 0]]);
  eq(/^\d{4}-\d{2}-\d{2}$/.test(db.sessions[0].date), true);
});

test('restore drops impossible pins and bad numbers', () => {
  const frames = [[{ standing: [11, '3', 3, 3, 7], feet: 99, target: 10, speed: 'fast', hit: 'zap', tags: ['ok', 5] }]];
  const shot = normalizeDB({ sessions: [{ id: 'a', games: [{ id: 'g', frames }] }] }).sessions[0].games[0].frames[0][0];
  eq(shot.standing, [3, 7]);
  eq([shot.feet, shot.target, shot.speed, shot.hit, shot.tags], [null, 10, null, null, ['ok']]);
});

test('restore recomputes score and done from the balls', () => {
  const perfect = game(Array(12).fill(10));
  const g = normalizeDB({ sessions: [{ id: 'a', games: [{ id: 'g', frames: perfect, score: 5, done: false }] }] }).sessions[0].games[0];
  eq([g.score, g.done], [300, true]);
});

test('restore ignores balls after an unfinished frame', () => {
  const frames = [[{ standing: [10] }], [{ standing: [] }]];
  const g = normalizeDB({ sessions: [{ id: 'a', games: [{ id: 'g', frames }] }] }).sessions[0].games[0];
  eq(g.frames[1].length, 0);
});

test('restore keeps a known theme and resets an unknown one to Minimal', () => {
  eq(normalizeDB({ sessions: [], settings: { skin: 'classic' } }).settings.skin, 'classic');
  eq(normalizeDB({ sessions: [], settings: { skin: '<b>' } }).settings.skin, 'minimal');
  eq(normalizeDB({ sessions: [] }).settings.skin, 'minimal');
});

// A session on `date` with one finished game per list of rolls.
function session(date, ...rollLists) {
  return normalizeDB({
    sessions: [{ id: date.replace(/-/g, ''), date, games: rollLists.map((r, i) => ({ id: `g${i}`, frames: game(r) })) }],
  }).sessions[0];
}
const OPEN_90 = Array(10).fill([9, 0]).flat();
const SPARES_190 = [...Array(10).fill([9, 1]).flat(), 9];
const TURKEY_141 = [10, 10, 10, ...Array(7).fill([9, 0]).flat()];

test('progress waits for 4 finished games', () => {
  eq(progress([session('2026-10-01', OPEN_90, OPEN_90, OPEN_90)]), null);
});

test('progress compares the first and last games', () => {
  const p = progress([session('2026-10-01', OPEN_90, OPEN_90), session('2026-10-08', SPARES_190, SPARES_190)]);
  eq([p.k, p.first.average, p.last.average, p.first.opens, p.last.opens], [2, 90, 190, 20, 0]);
  eq([p.first.sparesMade, p.last.sparesMade, p.last.spareChances], [0, 20, 20]);
});

test('progress uses at most 10 games a side', () => {
  const many = Array.from({ length: 25 }, () => OPEN_90);
  eq(progress([session('2026-10-01', ...many)]).k, 10);
});

test('personal bests and where they were set', () => {
  const st = computeStats([
    session('2026-10-01', OPEN_90, OPEN_90),
    session('2026-10-08', TURKEY_141),
    session('2026-10-15', SPARES_190, TURKEY_141),
  ]);
  const b = personalBests(st);
  eq([b.high.score, b.high.session.date], [190, '2026-10-15']);
  eq([b.strikes.strikes, b.strikes.session.date, b.streak.streak], [3, '2026-10-08', 3]);
  eq([b.fewestOpens.opens, b.fewestOpens.session.date], [0, '2026-10-15']);
  eq([b.session.average, b.session.games, b.session.session.date], [165.5, 2, '2026-10-15']);
  eq(sessionAverages(st).map((x) => [x.average, x.games]), [[90, 2], [141, 1], [165.5, 2]]);
});

test('a perfect game is 12 strikes in a row', () => {
  eq(personalBests(computeStats([session('2026-10-01', Array(12).fill(10))])).streak.streak, 12);
});

test('3-game series uses the first three finished games of a session', () => {
  const st = computeStats([session('2026-10-01', OPEN_90, OPEN_90), session('2026-10-08', OPEN_90, SPARES_190, TURKEY_141, OPEN_90)]);
  eq(seriesScores(st).map((x) => x.score), [421]);
  eq(personalBests(st).series.score, 421);
});

test('scores by game number in a session', () => {
  const st = computeStats([session('2026-10-01', OPEN_90, SPARES_190, TURKEY_141), session('2026-10-08', OPEN_90, OPEN_90)]);
  eq(st.byGame.map((b) => [b.no, b.games, b.average]), [[1, 2, 90], [2, 2, 140], [3, 1, 141]]);
});

test('spare aim: 3-6-9 from the strike line, mirrored for lefties', () => {
  const line = { feet: 20, target: 10 };
  eq([spareAim([10], line, 'R').feet, spareAim([7], line, 'R').feet, spareAim([2, 4, 5, 8], line, 'R').feet], [32, 11, 17]);
  eq([spareAim([7], line, 'L').feet, spareAim([10], line, 'L').feet], [32, 11]);
  eq([spareAim([3, 6, 10], line, 'R').pin, spareAim([3, 6, 10], line, 'R').feet], [3, 24]);
  eq([keyPin([7, 10], 'R'), keyPin([7, 10], 'L')], [7, 10]);
  const edge = spareAim([10], { feet: 35, target: 15 }, 'R');
  eq([edge.feet, edge.target, edge.clamped], [39, 15, true]);
  eq([spareAim([1, 2, 4], null, 'R').feet, spareAim([1, 2, 4], null, 'R').target], [20, 10]);
});

test('leaves remember each time and the spare line that worked', () => {
  const f = (feet, made) => [{ standing: [10], feet: 20, target: 10 }, { standing: made ? [] : [10], feet, target: 10 }];
  const db = normalizeDB({ sessions: [{ id: 'a', date: '2026-10-01', games: [{ id: 'g', frames: [f(32, true), f(32, true), f(25, false)] }] }] });
  const [l] = computeStats(db.sessions).leaves;
  eq([l.count, l.made, l.chances, l.history.length], [3, 2, 3, 3]);
  eq(l.worked, { feet: 32, target: 10, n: 2, made: 2 });
});

test('tips name the leave you keep missing, with an aim', () => {
  const miss = [{ standing: [7], feet: 20, target: 10 }, { standing: [7] }];
  const db = normalizeDB({ sessions: [{ id: 'a', date: '2026-10-01', games: [{ id: 'g', frames: [miss, miss, miss, miss] }] }] });
  const tip = tips(computeStats(db.sessions), 'R').find((t) => t.title.startsWith('The 7 '));
  eq(!!tip && tip.text.includes('board 11') && tip.basis.includes('4 tries'), true);
});

test('feel tags track how first balls turned out', () => {
  const ball = (standing, tags) => [{ standing, tags }, ...(standing.length ? [{ standing: [] }] : [])];
  const db = normalizeDB({ sessions: [{ id: 'a', date: '2026-10-01', games: [{ id: 'g', frames: [ball([], ['Felt smooth']), ball([10], ['Rushed']), ball([7], ['Rushed'])] }] }] });
  const st = computeStats(db.sessions);
  eq(st.feel.map((f) => [f.tag, f.n, f.firstN, f.strikes]), [['Rushed', 2, 2, 0], ['Felt smooth', 1, 1, 1]]);
});

test('goals are measured over the last 10 games', () => {
  const [spares, opens] = goalStatus([session('2026-10-01', OPEN_90, OPEN_90, SPARES_190)], [{ key: 'spares', target: 30 }, { key: 'opens', target: 6 }]);
  eq([spares.value, spares.met, spares.progress, opens.value, opens.met], [33, true, 1, 6.7, false]);
  eq(Math.round(opens.progress * 100), 90);
  eq(goalStatus([session('2026-10-01', OPEN_90)], [{ key: 'average', target: 100 }])[0].value, null);
  const many = [session('2026-10-01', ...Array(5).fill(OPEN_90)), session('2026-10-08', ...Array(10).fill(SPARES_190))];
  eq(goalStatus(many, [{ key: 'average', target: 190 }])[0].met, true);
  // Leaving out the newest game shows where you stood before it.
  const last = many[1].games.at(-1);
  eq(goalStatus(many, [{ key: 'average', target: 190 }], last)[0].value, 180);
});

test('a goal is credited only to the game that got you there', () => {
  const s = session('2026-10-01', OPEN_90, OPEN_90, OPEN_90, SPARES_190);
  const last = s.games.at(-1);
  // Average 90 → 115 with the last game: an "at least 100" goal is crossed by it.
  eq(goalsCrossed([s], [{ key: 'average', target: 100 }], last).map((g) => g.key), ['average']);
  // Already beating an "at most 10 open frames" goal before it: not credited.
  eq(goalsCrossed([s], [{ key: 'opens', target: 10 }], last), []);
  // Not reached even after it.
  eq(goalsCrossed([s], [{ key: 'average', target: 200 }], last), []);
  eq(goalText({ key: 'opens', target: 2.5 }), 'Open frames a game at most 2.5');
});

test('score with every spare made', () => {
  eq(scoreWithSpares(game(OPEN_90)), 190);
  eq(scoreWithSpares(game(SPARES_190)), 190);
  eq(scoreWithSpares(game(Array(12).fill(10))), 300);
  // Strikes, then X 7-2 in the 10th (286): the 2 becomes the spare.
  eq([scoreGame(game([...Array(10).fill(10), 7, 2])).total, scoreWithSpares(game([...Array(10).fill(10), 7, 2]))], [286, 287]);
});

test('series, empty leaves and plurals', () => {
  eq([seriesOf(session('2026-10-01', OPEN_90, OPEN_90)), seriesOf(session('2026-10-01', OPEN_90, OPEN_90, SPARES_190, OPEN_90))], [null, 370]);
  eq([keyPin([], 'R'), spareAim([], null, 'R')], [null, null]);
  eq([plural(1, 'game'), plural(3, 'game'), plural(1, 'try', 'tries'), plural(0, 'try', 'tries')], ['1 game', '3 games', '1 try', '0 tries']);
});

test('arrow accuracy counts first balls only', () => {
  const frame = (tags) => [{ standing: [10], tags }, { standing: [], tags: ['Missed left'] }];
  const db = normalizeDB({ sessions: [{ id: 'a', date: '2026-10-01', games: [{ id: 'g', frames: [frame(['Hit my arrow']), frame(['Hit my arrow'])] }] }] });
  const { accuracy } = computeStats(db.sessions);
  eq([accuracy.arrowHit, accuracy.arrowMiss], [2, 0]);
});

test('restore drops a goal credit pointing at a missing game', () => {
  const db = normalizeDB({
    sessions: [{ id: 'a', date: '2026-10-01', games: [{ id: 'g1', frames: [] }] }],
    settings: { goals: [{ key: 'spares', target: 50, reachedGame: 'g1', reachedOn: '2026-10-01' }, { key: 'average', target: 150, reachedGame: 'gone', reachedOn: '2026-10-01' }] },
  });
  eq(db.settings.goals.map((g) => [g.key, g.reachedGame]), [['spares', 'g1'], ['average', null]]);
});

test('restore keeps valid practice tries, goals and quick mode', () => {
  const db = normalizeDB({
    sessions: [],
    practice: [{ leave: [10, 10, 11], made: true, feet: 32 }, { leave: [] }, 'x'],
    settings: { quick: true, goals: [{ key: 'spares', target: 60 }, { key: 'spares', target: 70 }, { key: 'nope', target: 1 }, { key: 'average', target: 999 }] },
  });
  eq(db.practice.map((p) => [p.leave, p.made, p.feet, p.target]), [[[10], true, 32, null]]);
  eq(db.settings.goals.map((g) => [g.key, g.target, g.reachedOn]), [['spares', 60, null]]);
  eq([db.settings.quick, normalizeDB({ sessions: [] }).settings.quick], [true, false]);
});

const failed = results.filter((r) => !r.ok);
const out = document.getElementById('out');
out.textContent =
  results.map((r) => `${r.ok ? 'PASS' : 'FAIL'} ${r.name}${r.ok ? '' : ' :: ' + r.msg}`).join('\n') +
  `\n\n${results.length - failed.length}/${results.length} passed`;
document.title = failed.length ? 'FAILED' : 'PASSED';
// Picked up by tests/run_tests.py; harmless when opened by hand.
fetch('/__results', { method: 'POST', body: out.textContent }).catch(() => {});
