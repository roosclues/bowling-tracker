import { scoreGame, nextShot, gameDone, marks, isSplit, frameDone } from '../js/scoring.js';
import { normalizeDB } from '../js/normalize.js';

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

const failed = results.filter((r) => !r.ok);
const out = document.getElementById('out');
out.textContent =
  results.map((r) => `${r.ok ? 'PASS' : 'FAIL'} ${r.name}${r.ok ? '' : ' :: ' + r.msg}`).join('\n') +
  `\n\n${results.length - failed.length}/${results.length} passed`;
document.title = failed.length ? 'FAILED' : 'PASSED';
// Picked up by tests/run_tests.py; harmless when opened by hand.
fetch('/__results', { method: 'POST', body: out.textContent }).catch(() => {});
