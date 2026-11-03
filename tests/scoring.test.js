import { scoreGame, nextShot, gameDone, marks, isSplit, frameDone } from '../js/scoring.js';
import { normalizeDB } from '../js/normalize.js';
import {
  computeStats, progress, personalBests, sessionAverages, seriesScores, seriesOf, goalStatus, goalsCrossed, goalText, tips,
  scoreWithSpares, sessionMoves, spareAimFor,
} from '../js/stats.js';
import { carryNote } from '../js/terms.js';
import { spareAim, keyPin, adjustAim, aimText } from '../js/spares.js';
import { findNote, saveNote, notesAt, laneWarning } from '../js/lanenotes.js';
import { leaveRead, ballRead, gameRead, coachContext, answer, brief, questions } from '../js/coach.js';
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

test('carry counts what pocket hits left', () => {
  const pocket = (standing) => [{ standing, hit: 'pocket' }, ...(standing.length ? [{ standing: [] }] : [])];
  const frames = [pocket([]), pocket([10]), pocket([10]), pocket([4]), [{ standing: [7], hit: 'high' }, { standing: [] }]];
  const db = normalizeDB({ sessions: [{ id: 'a', date: '2026-10-01', games: [{ id: 'g', frames }] }] });
  const { carry } = computeStats(db.sessions);
  eq([carry.pocket, carry.strikes], [4, 1]);
  eq(carry.leaves.map((l) => [l.pins.join('-'), l.n]), [['10', 2], ['4', 1]]);
});

test('carry notes are mirrored for left-handers', () => {
  eq(carryNote([10], 'R').label, 'Weak hit');
  eq(carryNote([7], 'L').label, 'Weak hit');
  eq(carryNote([10], 'R').text.includes('2 boards left'), true);
  eq(carryNote([7], 'L').text.includes('2 boards right'), true);
  eq([carryNote([4], 'R').label, carryNote([6], 'L').label], ['Too strong', 'Too strong']);
  eq([carryNote([7], 'R').fix, carryNote([10], 'L').fix], [false, false]);
  eq(carryNote([2, 8], 'R'), null);
});

test('a tip names the pin your pocket hits keep leaving', () => {
  const pocket = (standing) => [{ standing, hit: 'pocket' }, ...(standing.length ? [{ standing: [] }] : [])];
  const frames = [pocket([]), pocket([]), pocket([]), pocket([]), pocket([10]), pocket([10]), pocket([10]), pocket([10]), pocket([9]), pocket([5])];
  const db = normalizeDB({ sessions: [{ id: 'a', date: '2026-10-01', games: [{ id: 'g', frames }] }] });
  const tip = tips(computeStats(db.sessions), 'R').find((t) => t.title.startsWith('Pocket hits leaving'));
  eq(!!tip && tip.title.endsWith('the 10') && tip.text.includes('4 of 10'), true);
});

test('moves: a kept feet change counts, a one-off board or arrow change does not', () => {
  // First balls by feet board (and arrow); every ball is a strike unless it leaves the 10.
  const ball = (feet, target, strike = false) => (strike ? [{ standing: [], feet, target }] : [{ standing: [10], feet, target }, { standing: [] }]);
  const frames = [
    ball(20, 10), ball(20, 10), ball(23, 10), ball(20, 12), // a one-off board 23, then an arrow-only change
    ball(22, 11, true), ball(22, 11, true), ball(22, 11), ball(22, 11, true), ball(22, 11, true), ball(22, 11, true),
  ];
  const db = normalizeDB({ sessions: [{ id: 'a', date: '2026-10-01', games: [{ id: 'g', frames }] }] });
  const moves = sessionMoves(db.sessions[0]);
  eq(moves.map((m) => [m.gameNo, m.frame, m.from, m.to]), [[1, 4, 20, 22]]);
  const [m] = moves;
  eq([m.before.n, m.before.strikes, m.after.n, m.after.strikes, m.before.arrow, m.after.arrow], [4, 0, 6, 5, 10, 11]);
});

test('moves need 3 first balls on each side', () => {
  const ball = (feet) => [{ standing: [10], feet, target: 10 }, { standing: [] }];
  const db = normalizeDB({ sessions: [{ id: 'a', date: '2026-10-01', games: [{ id: 'g', frames: [ball(20), ball(20), ball(22), ball(22), ball(22)] }] }] });
  eq(sessionMoves(db.sessions[0]), []);
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

test('restore keeps valid practice tries, goals and what to log', () => {
  const db = normalizeDB({
    sessions: [],
    practice: [{ leave: [10, 10, 11], made: true, feet: 32 }, { leave: [] }, 'x'],
    settings: { quick: true, goals: [{ key: 'spares', target: 60 }, { key: 'spares', target: 70 }, { key: 'nope', target: 1 }, { key: 'average', target: 999 }] },
  });
  eq(db.practice.map((p) => [p.leave, p.made, p.feet, p.target]), [[[10], true, 32, null]]);
  eq(db.settings.goals.map((g) => [g.key, g.target, g.reachedOn]), [['spares', 60, null]]);
  // Old quick mode on → Pins only; off or missing → Feet & arrow. A saved level is kept, a bad one isn't.
  const log = (settings) => normalizeDB({ sessions: [], settings }).settings.log;
  eq([db.settings.log, log({ quick: false }), log(undefined), log({ log: 'all' }), log({ log: 'nope', quick: true })],
    ['pins', 'line', 'line', 'all', 'pins']);
});

test('the spare aim moves toward what works for you', () => {
  const aim = spareAim([10], { feet: 20, target: 10 }, 'R'); // feet 32
  const miss = (way, offset = 0) => ({ offset, made: false, miss: way });
  const made = (offset = 0) => ({ offset, made: true, miss: null });
  const four = (t) => [t, t, t, t];
  // Missing left: move the feet left, a higher board for a right-hander, a lower one for a lefty.
  eq(adjustAim(aim, four(miss('left')), 'R').feet, 33);
  const lefty = spareAim([7], { feet: 20, target: 10 }, 'L');
  eq(adjustAim(lefty, four(miss('left')), 'L').feet, lefty.feet - 1);
  // Makes 2 boards from the aim pull it there; never more than 2 boards.
  eq(adjustAim(aim, four(made(2)), 'R').feet, 34);
  eq(adjustAim(aim, four(made(5)), 'R').feet, 34);
  // Misses both ways, or too few tries that say something, leave it alone.
  eq(adjustAim(aim, [miss('left'), miss('right'), miss('left'), miss('right')], 'R'), aim);
  eq(adjustAim(aim, [miss('left'), miss('left'), miss('left'), miss(null), { offset: null, made: true }], 'R'), aim);
  // Only the last 8 count, so old misses are forgotten once you make it.
  eq(adjustAim(aim, [...Array(8).fill(miss('right')), ...Array(8).fill(made())], 'R'), aim);
  const moved = adjustAim(aim, [made(), miss('left'), miss('left'), miss('left')], 'R');
  eq([moved.feet, moved.base, moved.learned], [33, 32, { n: 4, made: 1, left: 3, right: 0, dir: 'left' }]);
  const why = aimText(moved);
  if (!why.includes('(board 20 → 32)') || !why.includes('Moved 1 board left from there (board 32 → 33), from your last 4 tries at this pin: 1 made, 3 missed left.')) throw new Error(why);
});

test('spareAimFor learns from game spares and practice', () => {
  // The 10 pin left four times from feet 20, and the spare missed left from the 3-6-9 board 32.
  const frame = [{ standing: [10], feet: 20, target: 10, tags: [] }, { standing: [10], feet: 32, target: 10, tags: ['Missed left'] }];
  const sessions = [{ date: '2026-10-01', center: 'X', games: [{ frames: [frame, frame, frame, frame, [], [], [], [], [], []], done: false }] }];
  eq(spareAimFor([10], sessions, [], 'R').feet, 33);
  // The 6-10's key pin is the 6, so tries at the 10 pin don't move its aim.
  eq(spareAimFor([6, 10], sessions, [], 'R').learned, undefined);
  // Practice tries count too: four makes from board 34 with no games.
  const practice = Array.from({ length: 4 }, () => ({ date: '2026-10-02', leave: [10], made: true, miss: null, feet: 34, target: 10 }));
  eq(spareAimFor([10], [], practice, 'R').feet, 34);
});

test('lane notes: one per center and lane, known problems only', () => {
  const db = normalizeDB({
    sessions: [],
    practice: [{ leave: [10], made: true, miss: 'left' }, { leave: [10], miss: 'up' }, { leave: [10], miss: 'right' }],
    laneNotes: [
      { center: 'Strike Zone', lane: '07', verdict: 'avoid', tags: ['Ball return', 'Haunted'], text: 'jams', date: '2026-10-01' },
      { center: 'strike zone ', lane: '7', verdict: 'good', tags: ['Oily'], text: 'fixed', date: '2026-10-20' },
      { center: 'Strike Zone', lane: '  ', verdict: 'avoid' },
      { center: 'Strike Zone', lane: '12', verdict: 'maybe', tags: 'Oily' },
      'x',
    ],
  });
  eq(db.practice.map((p) => p.miss), [null, null, 'right']);
  eq(db.laneNotes.map((n) => [n.center, n.lane, n.verdict, n.tags, n.text]), [['strike zone', '7', 'good', ['Oily'], 'fixed'], ['Strike Zone', '12', null, [], '']]);
  eq(findNote(db.laneNotes, 'STRIKE ZONE', '007')?.text, 'fixed');
  eq(findNote(db.laneNotes, 'Strike Zone', ''), null);
  // Saving a lane that has a note replaces it; Avoid lanes come first.
  saveNote(db.laneNotes, { center: 'Strike Zone', lane: '12', verdict: 'avoid', tags: ['Pinsetter'], text: ' stuck ' });
  saveNote(db.laneNotes, { center: 'Strike Zone', lane: '3', verdict: 'avoid' });
  eq(db.laneNotes.length, 3);
  eq(notesAt(db.laneNotes, 'Strike Zone').map((n) => n.lane), ['3', '12', '7']);
  eq(findNote(db.laneNotes, 'Strike Zone', '12').text, 'stuck');
  eq(laneWarning(db.laneNotes, 'strike zone'), 'Avoid lanes 3, 12 here · Good: 7');
  eq(laneWarning(db.laneNotes, 'Elsewhere'), '');
});

test('the coach reads a leave as a light or high hit', () => {
  const read = (keys, hand) => keys.map((k) => leaveRead(k.split('-').map(Number), hand));
  eq(read(['2-4-5', '1-2-4-7', '2-8', '4-6', '4-9', '7-10', '1-3-6-10', '10', '6-10', '5'], 'R'),
    ['light', 'light', 'light', 'high', 'high', 'high', 'high', null, null, null]);
  // Lefties leave the mirror image: the 3-5-6 is their light leave.
  eq(read(['3-5-6', '1-3-6-10', '4-6', '7'], 'L'), ['light', 'light', 'high', null]);
  // A recorded pin hit counts first, then a missed-arrow tag, then the leave.
  eq(ballRead({ standing: [2, 4, 5], hit: 'high', tags: [] }, 'R'), 'high');
  eq(ballRead({ standing: [2, 4, 5], tags: ['Missed left'] }, 'R'), 'high');
  eq(ballRead({ standing: [2, 4, 5], tags: ['Missed left'] }, 'L'), 'light');
  eq(ballRead({ standing: [], tags: [] }, 'R'), 'strike');
});

test('the coach reads the game you are in', () => {
  const strike = [{ standing: [], feet: 20, target: 10 }];
  const light = [{ standing: [2, 4, 5], feet: 20, target: 10 }, { standing: [] }];
  const high = [{ standing: [4, 6], feet: 20, target: 10 }, { standing: [] }];
  const one = (frames, hand = 'R', tags = []) => {
    const db = normalizeDB({ sessions: [{ id: 's', date: '2026-10-01', games: [{ id: 'g', frames }] }], settings: { hand } });
    db.sessions[0].games[0].frames.forEach((f) => f[0] && (f[0].tags = tags));
    return gameRead(db.sessions[0].games[0], db.sessions[0], db);
  };
  // Two light hits: move the feet 2 boards toward the hand side, a lower board for either hand.
  const r = one([light, light]);
  eq([r.moves[0].title, r.moves[0].text.includes('(feet 20 → 18, keep arrow 10)')], ['Hitting light', true]);
  const l = one([[{ ...light[0], standing: [3, 5, 6] }, light[1]], [{ ...light[0], standing: [3, 5, 6] }, light[1]]], 'L');
  eq([l.moves[0].text.includes('2 boards left'), l.moves[0].text.includes('20 → 18')], [true, true]);
  // A missed-left tag on those same balls says high instead: feet the other way.
  eq(one([light, light], 'R', ['Missed left']).moves[0].text.includes('(feet 20 → 22, keep arrow 10)'), true);
  // Striking, then high hits: the lane is changing, so move feet 2 and arrow 1.
  const t = one([strike, strike, strike, high, high]);
  eq([t.moves[0].title, t.moves[0].text.includes('(feet 20 → 22, arrow 10 → 11)')], ['The lane is changing', true]);
  eq(one([strike, strike, strike]).moves[0].title, 'Keep doing that');
  // One ball is not a pattern: no move, just where the game stands (a spare counts once the next ball is in).
  const c = one([light]);
  eq([c.moves.length, c.summary.title], [0, 'Through 1 frame: 0']);
});

test('the coach knows when it is: before, during or after', () => {
  const perfect = [...Array(9).fill([{ standing: [] }]), [{ standing: [] }, { standing: [] }, { standing: [] }]];
  const done = normalizeDB({ sessions: [{ id: 's', date: '2026-11-04', center: 'X', games: [{ id: 'g', frames: perfect }] }], settings: { last: { center: 'X' } } });
  eq(coachContext(done, '2026-11-04').when, 'after');
  eq([coachContext(done, '2026-11-05').when, coachContext(done, '2026-11-05').center], ['before', 'X']);
  const open = normalizeDB({ sessions: [{ id: 's', date: '2026-11-04', games: [{ id: 'g', frames: perfect }, { id: 'h', frames: [] }] }] });
  eq(coachContext(open, '2026-11-04').game.id, 'h');
  // With nothing logged: the basics, and questions that don't need data.
  const empty = normalizeDB({ sessions: [] });
  eq(brief(empty, '')[0].title, 'Welcome! Let\'s find your line');
  eq(questions(empty, coachContext(empty)).map((q) => q.key), ['speed', 'findline', 'arrows']);
  eq(answer('speed', empty, coachContext(empty))[0].title, 'Log a few speeds first');
});

const failed = results.filter((r) => !r.ok);
const out = document.getElementById('out');
out.textContent =
  results.map((r) => `${r.ok ? 'PASS' : 'FAIL'} ${r.name}${r.ok ? '' : ' :: ' + r.msg}`).join('\n') +
  `\n\n${results.length - failed.length}/${results.length} passed`;
document.title = failed.length ? 'FAILED' : 'PASSED';
// Picked up by tests/run_tests.py; harmless when opened by hand.
fetch('/__results', { method: 'POST', body: out.textContent }).catch(() => {});
