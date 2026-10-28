// End-to-end run of the app inside a phone-sized iframe.
// Open tests/e2e.html (served over http). Add ?stop=<step> to freeze the app at a step for screenshots:
// welcome, summary300, pins, game, summary, home, stats, help, settings, lefty.

const STOP = new URLSearchParams(location.search).get('stop');
const frame = document.getElementById('app');
const out = document.getElementById('out');
const log = [];
const errors = [];
let W;
let D;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const $ = (s) => D.querySelector(s);
const text = (s) => ($(s)?.textContent ?? '').trim();

class Stop extends Error {}

function report() {
  const failed = log.filter((l) => l.startsWith('FAIL')).length + errors.length;
  out.textContent = log.join('\n') + (errors.length ? '\n\nPAGE ERRORS:\n' + errors.join('\n') : '') +
    `\n\n${failed ? 'FAILED' : 'ALL PASSED'} (${log.length} checks)`;
  document.title = failed ? 'FAILED' : 'PASSED';
}
function check(name, cond, detail = '') {
  log.push(`${cond ? 'PASS' : 'FAIL'} ${name}${cond ? '' : ' :: ' + detail}`);
  report();
}
function stopAt(step) {
  if (STOP === step) throw new Stop();
}
async function click(sel) {
  const el = typeof sel === 'string' ? $(sel) : sel;
  if (!el) throw new Error('missing element ' + sel);
  el.dispatchEvent(new W.MouseEvent('click', { bubbles: true, cancelable: true }));
  // Save / Undo ignore a second tap within 350 ms (double-tap guard), so wait it out.
  const guarded = el.matches('#saveBtn, [data-act="undo"], [data-act="saveEdit"]');
  await sleep(guarded ? 400 : 60);
}
async function nav(hash) {
  W.location.hash = hash;
  await sleep(80);
}
function db() {
  return JSON.parse(localStorage.getItem('bowltrack.v1'));
}

const ZONE_Y = { feet: 222, target: 128, breakpoint: 40 };
async function tapLane(zone, board, hand = 'R') {
  const svg = $('#lane svg');
  const r = svg.getBoundingClientRect();
  const fromLeft = hand === 'L' ? board - 1 : 39 - board;
  const vx = 16 + fromLeft * 10 + 5;
  const opts = {
    bubbles: true, pointerId: 1, isPrimary: true,
    clientX: r.left + (vx / 422) * r.width,
    clientY: r.top + (ZONE_Y[zone] / 250) * r.height,
  };
  svg.dispatchEvent(new W.PointerEvent('pointerdown', opts));
  svg.dispatchEvent(new W.PointerEvent('pointerup', opts));
  await sleep(20);
}
async function tapPins(pins) {
  for (const p of pins) await click(`#pins .pin[data-pin="${p}"]`);
}
async function ball(standing = []) {
  await tapPins(standing);
  await click('#saveBtn');
}
const laneVal = (k) => text(`.lr-row[data-k="${k}"] .lr-val`);

async function run() {
  localStorage.clear();
  await new Promise((res) => {
    frame.onload = res;
    frame.src = '../index.html';
  });
  W = frame.contentWindow;
  D = W.document;
  W.addEventListener('error', (e) => { errors.push(e.message); report(); });
  W.addEventListener('unhandledrejection', (e) => { errors.push(String(e.reason)); report(); });
  W.confirm = () => true;
  await sleep(150);

  check('home shows welcome on first run', !!$('.welcome'));
  stopAt('welcome');

  // ---- New session ----
  await click('a[href="#/new"]');
  check('session form shown', !!$('#sessionForm'));
  $('#center').value = 'Test Lanes';
  $('#lane').value = '7';
  $('#ball').value = 'House 12 lb';
  $('#sessionForm').requestSubmit();
  await sleep(120);
  const [, sid, gid1] = W.location.hash.match(/#\/game\/(\w+)\/(\w+)/) ?? [];
  check('starts game after session form', !!gid1, W.location.hash);

  // ---- Game 1: perfect game ----
  check('feet empty before first ever ball', laneVal('feet') === '–', laneVal('feet'));
  await tapLane('feet', 20);
  await tapLane('target', 10);
  check('feet tap sets center dot', laneVal('feet') === 'Board 20 · center dot', laneVal('feet'));
  check('target tap sets 2nd arrow', laneVal('target') === 'Board 10 · 2nd arrow', laneVal('target'));
  check('save label says strike with no pins tapped', text('#saveBtn').includes('Strike'), text('#saveBtn'));
  for (let i = 0; i < 12; i++) await click('#saveBtn');
  await sleep(100);
  check('perfect game goes to summary', W.location.hash.startsWith('#/summary/'), W.location.hash);
  check('perfect game scores 300', text('.final-score') === '300', text('.final-score'));
  stopAt('summary300');

  // ---- Game 2: mixed game with details, undo and edit ----
  await click('[data-act="another"]');
  await sleep(80);
  const gid2 = W.location.hash.match(/#\/game\/\w+\/(\w+)/)?.[1];
  check('second game opened', gid2 && gid2 !== gid1, W.location.hash);
  check('feet carried forward', laneVal('feet') === 'Board 20 · center dot', laneVal('feet'));
  check('arrow carried forward', laneVal('target') === 'Board 10 · 2nd arrow', laneVal('target'));

  // Frame 1: leave the 10 pin, record details, then spare.
  await tapLane('breakpoint', 6);
  check('breakpoint tap', laneVal('breakpoint') === 'Board 6', laneVal('breakpoint'));
  $('#more').open = true;
  await click('[data-hit="light"]');
  await click('[data-tag="Missed right"]');
  const speed = $('#speed');
  speed.value = '15.5';
  speed.dispatchEvent(new W.Event('input', { bubbles: true }));
  await tapPins([10]);
  check('save label counts pins', text('#saveBtn') === 'Save · 9 pins', text('#saveBtn'));
  stopAt('pins');
  await click('#saveBtn');
  check('second ball shows 1 pin to pick up', text('.shot-head .pill') === '1 pin to pick up', text('.shot-head .pill'));
  check('7 and others are not tappable on 2nd ball', $('#pins .pin[data-pin="7"]').classList.contains('gone'));
  check('save label says spare', text('#saveBtn').includes('Spare'), text('#saveBtn'));
  await ball([]);

  // Frame 2: 7-10 split, then miss both.
  await ball([7, 10]);
  check('split marked on scoreboard', !!$('.frame:nth-child(2) .box.split'));
  await click('[data-act="allup"]');
  check('all-up gives 0 pins', text('#saveBtn') === 'Save · 0 pins', text('#saveBtn'));
  await click('#saveBtn');

  stopAt('game');

  // Frame 3: strike, tapped twice by accident (the second tap must not record another strike).
  $('#saveBtn').dispatchEvent(new W.MouseEvent('click', { bubbles: true }));
  $('#saveBtn').dispatchEvent(new W.MouseEvent('click', { bubbles: true }));
  await sleep(400);
  check('double tap on Save records one ball', text('.shot-head h2') === 'Frame 4 · Ball 1', text('.shot-head h2'));

  // Frame 4: gutter (tagged "Rushed") then 5.
  $('#more').open = true;
  await click('[data-tag="Rushed"]');
  await click('[data-act="allup"]');
  await click('#saveBtn');
  await ball([1, 2, 3, 4, 5]);
  // Undo both balls, then put them back: each keeps its own details.
  await click('[data-act="undo"]');
  check('undo returns to frame 4 ball 2', text('.shot-head h2') === 'Frame 4 · Ball 2', text('.shot-head h2'));
  check('undo restores the removed pins', text('#saveBtn') === 'Save · 5 pins', text('#saveBtn'));
  await click('[data-act="undo"]');
  check('second undo returns to frame 4 ball 1', text('.shot-head h2') === 'Frame 4 · Ball 1', text('.shot-head h2'));
  check('second undo restores that ball', text('#saveBtn') === 'Save · 0 pins' && $('[data-tag="Rushed"]').classList.contains('on'), text('#saveBtn'));
  await click('#saveBtn');
  check('first undone ball comes back after re-saving', text('#saveBtn') === 'Save · 5 pins', text('#saveBtn'));
  await click('#saveBtn');

  // Frames 5-9 strikes, 10th: X X 9.
  for (let i = 0; i < 5; i++) await ball([]);
  await ball([]);
  await ball([]);
  check('10th frame third ball available', text('.shot-head h2') === 'Frame 10 · Ball 3', text('.shot-head h2'));
  await ball([10]);
  await sleep(100);
  check('mixed game scores 225', text('.final-score') === '225', text('.final-score'));

  const g2 = db().sessions[0].games[1];
  const s1 = g2.frames[0][0];
  check('details saved on shot', s1.hit === 'light' && s1.speed === 15.5 && s1.tags.includes('Missed right') && s1.breakpoint === 6, JSON.stringify(s1));
  check('carried feet saved on later shots', g2.frames[5][0].feet === 20 && g2.frames[5][0].target === 10);
  stopAt('summary');

  // ---- Edit an earlier ball's details ----
  await nav(`#/game/${sid}/${gid2}`);
  check('finished game redirects to summary', W.location.hash.startsWith('#/summary/'), W.location.hash);
  await click('[data-act="undo"]');
  await sleep(80);
  check('summary undo reopens game at 10th ball 3', text('.shot-head h2') === 'Frame 10 · Ball 3', text('.shot-head h2'));
  await click('.frame:nth-child(1) .box[data-s="0"]');
  check('edit mode opens', text('.shot-head h2').startsWith('Editing'), text('.shot-head h2'));
  $('#more').open = true;
  await click('[data-hit="pocket"]');
  await tapPins([10, 9]); // was the 10 pin left; it was really the 9
  await click('[data-act="saveEdit"]');
  const edited = db().sessions[0].games[1].frames[0][0];
  check('edit saved', edited.hit === 'pocket' && JSON.stringify(edited.standing) === '[9]', JSON.stringify(edited));
  check('back to entering after edit', text('.shot-head h2') === 'Frame 10 · Ball 3', text('.shot-head h2'));
  // Turning the frame 3 strike into a 9 would need a second ball: refused.
  await click('.frame:nth-child(3) .box[data-s="0"]');
  await tapPins([10]);
  await click('[data-act="saveEdit"]');
  check('pin edit that changes the frame is refused', text('.shot-head h2').startsWith('Editing') && db().sessions[0].games[1].frames[2][0].standing.length === 0);
  await click('[data-act="cancel"]');
  check('undone last ball is still waiting after edits', text('#saveBtn') === 'Save · 9 pins', text('#saveBtn'));
  await click('#saveBtn');
  await sleep(100);
  check('game finished again at 225', text('.final-score') === '225', text('.final-score'));

  // ---- Session & home ----
  await nav(`#/session/${sid}`);
  check('session lists 2 games', D.querySelectorAll('.list li').length === 2);
  await nav('#/');
  check('home shows session with scores', text('.li-scores').includes('300') && text('.li-scores').includes('225'), text('.li-scores'));
  stopAt('home');

  // ---- Stats ----
  await nav('#/stats');
  check('stats average 263', text('.tiles .tile:first-child .tv') === '263', text('.tiles .tile:first-child .tv'));
  check('trend chart rendered', !!$('#trend svg .c-line'));
  check('combo table has feet 20 row', !!$('.tbl tbody tr td') && [...D.querySelectorAll('.tbl tbody tr')].some((tr) => tr.textContent.includes('2nd arrow')));
  check('7-10 leave listed as split', [...D.querySelectorAll('.leaves li')].some((li) => li.textContent.includes('7-10') && li.textContent.includes('split')));
  $('#fDays').value = '30';
  $('#fDays').dispatchEvent(new W.Event('change'));
  await sleep(50);
  check('date filter keeps today\'s games', text('.tiles .tile:first-child .tv') === '263');
  $('#fDays').value = '0';
  $('#fDays').dispatchEvent(new W.Event('change'));
  stopAt('stats');

  // ---- Glossary pop-up & help ----
  await nav('#/help');
  check('help glossary rendered', D.querySelectorAll('.glossary dt').length >= 8);
  await click('.info');
  check('info dialog opens', D.getElementById('infoDialog').open);
  await click('[data-close]');
  stopAt('help');

  // ---- Settings: left-handed flips the lane ----
  await nav('#/settings');
  await click('[data-hand="L"]');
  check('left-handed saved', db().settings.hand === 'L');
  stopAt('settings');
  await nav(`#/session/${sid}`);
  await click('[data-act="newgame"]');
  await sleep(80);
  await tapLane('feet', 5, 'L');
  check('lefty lane maps taps to boards', laneVal('feet') === 'Board 5', laneVal('feet'));
  stopAt('lefty');

  // ---- Back button: redirects replace history instead of adding to it ----
  await nav('#/');
  const len = W.history.length;
  await nav('#/bowl');
  await sleep(80);
  check('Bowl tab redirect adds one history entry', W.history.length === len + 1 && W.location.hash.startsWith('#/game/'), `${len} -> ${W.history.length}`);

  // ---- Backup round trip ----
  const storage = await import('../js/storage.js');
  const before = localStorage.getItem('bowltrack.v1');
  storage.restoreBackup(before);
  check('backup restores cleanly', JSON.parse(localStorage.getItem('bowltrack.v1')).sessions.length === 1);
  let rejected = false;
  try { storage.restoreBackup('{"foo":1}'); } catch { rejected = true; }
  check('bad backup file rejected', rejected);

  // A damaged backup is repaired instead of crashing the app, and the restore can be undone.
  await nav('#/');
  storage.restoreBackup('{"sessions":[{"id":"x","games":[{}]}]}');
  await sleep(150);
  check('app picks up data saved by another copy', D.querySelectorAll('.sessions li').length === 1 && !text('.li-scores').includes('300'), text('.li-scores'));
  check('undo restore available', storage.canUndoRestore());
  storage.undoRestore();
  await sleep(150);
  check('undo restore brings the games back', text('.li-scores').includes('300'), text('.li-scores'));
}

run()
  .catch((e) => { if (!(e instanceof Stop)) check('run completed', false, e.stack || e.message); })
  .finally(() => {
    log.push(STOP ? `(stopped at ${STOP})` : '');
    report();
    // Picked up by tests/run_tests.py; harmless when opened by hand.
    if (!STOP) fetch('/__results', { method: 'POST', body: out.textContent }).catch(() => {});
  });
