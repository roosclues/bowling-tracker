// End-to-end run of the app inside a phone-sized iframe.
// Open tests/e2e.html (served over http). Add ?stop=<step> to freeze the app at a step for screenshots:
// welcome, form, summary300, pins, spareaim, game, summary, lanes, session, home, stats, statsfirst, statsspares, practicemiss, help,
// lanetop, lanebottom, changelog, settings, about, lefty, feetarrow, adddetails, review, progress, practice, goals, goalreached, minsettings, minhome,
// minstats, mingame, minhelp, calendar, carry, moves, coach, coachgame.
// Add &scroll=<selector> to scroll a card into view there, and &skin=minimal to look at the Minimal theme up to the "progress" step (a restore resets it).
// Add &size=360x780 for a smaller phone (the default is 412x915).

const PARAMS = new URLSearchParams(location.search);
const STOP = PARAMS.get('stop');
const SKIN = PARAMS.get('skin');
const frame = document.getElementById('app');
const [FRAME_W, FRAME_H] = (PARAMS.get('size') ?? '').split('x').map(Number);
if (FRAME_W && FRAME_H) Object.assign(frame.style, { width: `${FRAME_W}px`, height: `${FRAME_H}px` });
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
  if (STOP !== step) return;
  // &scroll=<selector> brings a card below the fold into view for a screenshot.
  const scroll = PARAMS.get('scroll');
  if (scroll && $(scroll)) W.scrollTo(0, $(scroll).getBoundingClientRect().top + W.scrollY - 130); // clear the sticky bars
  $('#toast .toast-x')?.click(); // so a message doesn't cover the card
  throw new Stop();
}
async function click(sel) {
  const el = typeof sel === 'string' ? $(sel) : sel;
  if (!el) throw new Error('missing element ' + sel);
  el.dispatchEvent(new W.MouseEvent('click', { bubbles: true, cancelable: true }));
  // Save / Undo ignore a second tap within 350 ms (double-tap guard), so wait it out.
  const guarded = el.matches('#saveBtn, [data-act="undo"], [data-act="saveEdit"], [data-act="saveNext"], [data-act="made"], [data-act^="miss"]');
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
  const [, top, w, h] = svg.getAttribute('viewBox').split(' ').map(Number); // starts lower without the breakpoint band
  const fromLeft = hand === 'L' ? board - 1 : 39 - board;
  const vx = 16 + fromLeft * 10 + 5;
  const opts = {
    bubbles: true, pointerId: 1, isPrimary: true,
    clientX: r.left + (vx / w) * r.width,
    clientY: r.top + ((ZONE_Y[zone] - top) / h) * r.height,
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
// The carried-over line row: "20 10" for feet 20, arrow 10.
const lineRow = () => `${text('#feetVal')} ${text('#targetVal')}`;
const tabsShown = () => W.getComputedStyle($('.tabbar')).display !== 'none';

let SW_VERSION = '';
const swVersionNow = () => SW_VERSION;

async function run() {
  SW_VERSION = (await (await fetch('../sw.js')).text()).match(/const VERSION = '([^']+)'/)?.[1] ?? '';
  localStorage.clear();
  if (SKIN) localStorage.setItem('bowltrack.v1', JSON.stringify({ sessions: [], settings: { skin: SKIN } }));
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
  await nav('#/coach');
  check('with nothing logged, the coach starts with the basics', text('#coachChat').startsWith("Welcome! Let's find your line") && !!$('[data-q="findline"]'), text('#coachChat').slice(0, 80));
  await nav('#/');

  // ---- New session ----
  await click('a[href="#/new"]');
  check('session form shown', !!$('#sessionForm'));
  check('the form folds away date, ball, oil and notes', !$('#sessionMore').open && ['#date', '#ball', '#oil', '#notes'].every((sel) => $('#sessionMore').contains($(sel))));
  check('the form offers 3 logging levels, Feet & arrow picked', D.querySelectorAll('#logLevel [data-log]').length === 3 && $('[data-log="line"]').classList.contains('on'));
  await click('[data-log="pins"]');
  check('the form offers Pins only', $('[data-log="pins"]').classList.contains('on') && !$('[data-log="line"]').classList.contains('on'));
  await click('[data-log="all"]'); // the next games record every detail
  stopAt('form');
  $('#center').value = 'Test Lanes';
  $('#lane').value = '7';
  $('#ball').value = 'House 12 lb';
  $('#notes').value = 'Keep my head down';
  $('#sessionForm').requestSubmit();
  await sleep(120);
  const [, sid, gid1] = W.location.hash.match(/#\/game\/(\w+)\/(\w+)/) ?? [];
  check('starts game after session form', !!gid1, W.location.hash);
  check('the logging choice is saved', db().settings.log === 'all');
  check('session notes show on the game screen', text('#focus').includes('Keep my head down'), text('#focus'));
  check('no tab bar during a game', !tabsShown() && D.body.classList.contains('in-game'));
  check('Everything shows the breakpoint and More details', !!$('.lr-row[data-k="breakpoint"]') && !!$('#more'));

  // ---- Game 1: perfect game ----
  check('feet empty before first ever ball', laneVal('feet') === '–', laneVal('feet'));
  await tapLane('feet', 20);
  await tapLane('target', 10);
  check('feet tap sets center dot', laneVal('feet') === 'Board 20 · center dot', laneVal('feet'));
  check('target tap sets 2nd arrow', laneVal('target') === 'Board 10 · 2nd arrow', laneVal('target'));
  {
    const cx = [...D.querySelectorAll('#lane .dot')].map((c) => Number(c.getAttribute('cx'))).sort((a, b) => a - b);
    const want = [35, 30, 25, 20, 15, 10, 5].map((b) => 16 + (39 - b) * 10 + 5);
    check('approach dots on boards 5, 10, ... 35', JSON.stringify(cx) === JSON.stringify(want), JSON.stringify(cx));
  }
  check('save label says strike with no pins tapped', text('#saveBtn').includes('Strike'), text('#saveBtn'));
  for (let i = 0; i < 12; i++) await click('#saveBtn');
  await sleep(100);
  check('perfect game goes to summary', W.location.hash.startsWith('#/summary/'), W.location.hash);
  check('perfect game scores 300', text('.final-score') === '300', text('.final-score'));
  check('the tab bar is back on the summary', tabsShown() && !D.body.classList.contains('in-game'));
  stopAt('summary300');

  // ---- Game 2: mixed game with details, undo and edit ----
  await click('[data-act="another"]');
  await sleep(80);
  const gid2 = W.location.hash.match(/#\/game\/\w+\/(\w+)/)?.[1];
  check('second game opened', gid2 && gid2 !== gid1, W.location.hash);
  check('a carried line shows as one row', lineRow() === '20 10' && !$('#lane'), lineRow());
  // Frame 1: leave the 10 pin, record details, then spare.
  await tapPins([10]);
  await click('[data-act="line"]');
  check('Change opens the lane and keeps the pins tapped', !!$('#lane') && $('#pins .pin[data-pin="10"]').classList.contains('up'));
  check('feet carried forward', laneVal('feet') === 'Board 20 · center dot', laneVal('feet'));
  check('arrow carried forward', laneVal('target') === 'Board 10 · 2nd arrow', laneVal('target'));
  await tapLane('breakpoint', 6);
  check('breakpoint tap', laneVal('breakpoint') === 'Board 6', laneVal('breakpoint'));
  $('#more').open = true;
  await click('[data-hit="light"]');
  await click('[data-tag="Missed right"]');
  const speed = $('#speed');
  check('speed is asked in km/h by default', $('label[for="speed"]').textContent.includes('km/h'));
  speed.value = '25';
  speed.dispatchEvent(new W.Event('input', { bubbles: true }));
  check('save label counts pins', text('#saveBtn') === 'Save · 9 pins', text('#saveBtn'));
  stopAt('pins');
  await click('#saveBtn');
  check('second ball shows 1 pin to pick up', text('.shot-head .pill') === '1 pin to pick up', text('.shot-head .pill'));
  check('7 and others are not tappable on 2nd ball', $('#pins .pin[data-pin="7"]').classList.contains('gone'));
  check('save label says spare', text('#saveBtn').includes('Spare'), text('#saveBtn'));
  check('a spare you have not logged before starts on the spare aim (feet 32 for the 10 pin)', lineRow() === '32 10' && text('#aim').includes('On your spare aim'), `${lineRow()} | ${text('#aim')}`);
  check('the spare aim shows once, under your line', D.querySelectorAll('.aim').length === 1 && $('#lineCard').contains($('#aim')));
  stopAt('spareaim');
  await click('[aria-label="Feet left"]');
  check('Feet left moves a right-hander a board higher', lineRow() === '33 10', lineRow());
  check('off the aim, the aim shows with Use', text('#aim').includes('feet 32 · arrow 10') && !!$('#aim [data-act="aim"]'), text('#aim'));
  await click('[data-act="aim"]');
  check('Use goes back to the spare aim', lineRow() === '32 10' && text('#aim').includes('On your spare aim'), `${lineRow()} | ${text('#aim')}`);
  await click('[data-act="line"]');
  await tapLane('feet', 30);
  await click('[data-act="aim"]');
  check('Use puts the spare aim on the lane', laneVal('feet') === 'Board 32' && laneVal('target') === 'Board 10 · 2nd arrow', laneVal('feet'));
  await ball([]);
  check('no spare aim on a first ball', !$('#aim'));
  check('the next ball shows its line as one row again', !!$('#lineRow') && !$('#lane'));

  // Frame 2 first ball: "Same as last ball" copies frame 1's breakpoint and speed.
  await click('[data-act="line"]');
  await click('[data-act="repeat"]');
  check('"Same as last ball" copies breakpoint and speed', laneVal('breakpoint') === 'Board 6' && $('#speed').value === '25', `${laneVal('breakpoint')} ${$('#speed').value}`);

  // Frame 2: 7-10 split, then miss both.
  await ball([7, 10]);
  check('split marked on scoreboard', !!$('.frame:nth-child(2) .box.split'));
  check('no Missed row while the spare is still made', !!$('#missRow') && $('#missRow').hidden);
  await tapPins([7]);
  check('a pin left up shows the Missed row', !$('#missRow').hidden);
  await click('#missRow [aria-label="Missed right"]');
  await click('#missRow [aria-label="Missed left"]');
  check('Missed left and right exclusive, and in step with More details', $('#missRow [aria-label="Missed left"]').classList.contains('on')
    && !$('#missRow [aria-label="Missed right"]').classList.contains('on') && $('#more [data-tag="Missed left"]').classList.contains('on'));
  await tapPins([7]);
  check('making the spare after all hides the row and drops the direction', $('#missRow').hidden && !$('#more [data-tag="Missed left"]').classList.contains('on'));
  await click('[data-act="allup"]');
  check('all-up gives 0 pins', text('#saveBtn') === 'Save · 0 pins', text('#saveBtn'));
  check('All still up shows the Missed row', !$('#missRow').hidden);
  await click('#missRow [aria-label="Missed left"]');
  await click('#saveBtn');
  check('the direction is saved with the ball', JSON.stringify(db().sessions[0].games[1].frames[1][1].tags) === '["Missed left"]', JSON.stringify(db().sessions[0].games[1].frames[1][1].tags));

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
  check('summary shows the score with every spare made', text('#whatIf').includes('257'), text('#whatIf'));
  check('missed spares link to practice', !!$('.frames-review a[href="#/practice/7-10"]'));

  const g2 = db().sessions[0].games[1];
  const s1 = g2.frames[0][0];
  check('details saved on shot', s1.hit === 'light' && Math.abs(s1.speed * 1.609344 - 25) < 1e-9 && s1.tags.includes('Missed right') && s1.breakpoint === 6, JSON.stringify(s1));
  check('carried feet saved on later shots', g2.frames[5][0].feet === 20 && g2.frames[5][0].target === 10);
  stopAt('summary');
  check('the summary offers a note about the lane', text('#laneRow') === 'Add a note about lane 7', text('#laneRow'));
  await click('#laneRow [data-act="lanenote"]');
  check('from the summary, lane notes open on lane 7 and Back goes to the summary', W.location.hash === '#/lanes' && $('#noteLane').value === '7'
    && $('.tb-back').getAttribute('href').startsWith('#/summary/'), $('.tb-back')?.getAttribute('href'));

  // ---- Edit an earlier ball's details ----
  await nav(`#/game/${sid}/${gid2}`);
  check('finished game redirects to summary', W.location.hash.startsWith('#/summary/'), W.location.hash);
  await click('[data-act="undo"]');
  await sleep(80);
  check('summary undo reopens game at 10th ball 3', text('.shot-head h2') === 'Frame 10 · Ball 3', text('.shot-head h2'));
  await click('.frame:nth-child(1) .box[data-s="0"]');
  check('edit mode opens', text('.shot-head h2').startsWith('Editing'), text('.shot-head h2'));
  check('editing always shows the lane', !!$('#lane') && !$('#lineRow'));
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
  check('session shows strikes, spares and open frames', ['Strikes', 'Spares made', 'Open frames a game'].every((t) => text('#sessionTiles').includes(t)), text('#sessionTiles'));
  check('session links to that center\'s stats', text('#centerStats').includes('Test Lanes'), text('#centerStats'));

  // ---- Lane notes ----
  check('the session offers a note about its lane', text('#laneRow') === 'Add a note about lane 7', text('#laneRow'));
  await click('#laneRow [data-act="lanenote"]');
  check('lane notes open on the session\'s center and lane', W.location.hash === '#/lanes' && text('.topbar .t2') === 'Test Lanes' && $('#noteLane').value === '7', `${W.location.hash} ${text('.topbar .t2')}`);
  await click('[data-act="save"]');
  check('an empty note is not saved', db().laneNotes.length === 0 && text('#toast .toast-msg').startsWith('Pick Avoid'), text('#toast .toast-msg'));
  await click('[data-verdict="avoid"]');
  await click('[data-lane-tag="Ball return"]');
  $('#noteText').value = 'Jams a lot';
  $('#noteText').dispatchEvent(new W.Event('input', { bubbles: true }));
  await click('[data-act="save"]');
  {
    const [n] = db().laneNotes;
    check('the lane note is saved', db().laneNotes.length === 1 && n.center === 'Test Lanes' && n.lane === '7' && n.verdict === 'avoid'
      && JSON.stringify(n.tags) === '["Ball return"]' && n.text === 'Jams a lot', JSON.stringify(db().laneNotes));
  }
  check('the list shows it', text('#laneList li').startsWith('Lane 7') && text('#laneList li').includes('Avoid · Ball return · “Jams a lot”'), text('#laneList li'));
  stopAt('lanes');
  await nav(`#/session/${sid}`);
  check('the session shows the note', text('#laneRow').startsWith('Lane 7 · Avoid · Ball return'), text('#laneRow'));
  stopAt('session');
  await nav('#/');
  check('home shows session with scores', text('.li-scores').includes('300') && text('.li-scores').includes('225'), text('.li-scores'));
  check('home offers to bowl again at the last center', text('#bowlAgain') === 'Bowl at Test Lanes' && text('#bowlAgainInfo') === 'House 12 lb · Everything', `${text('#bowlAgain')} | ${text('#bowlAgainInfo')}`);
  check('Home warns about the lane to avoid', text('#laneWarn') === 'Avoid lane 7 here' && $('#laneWarn').classList.contains('warn'), text('#laneWarn'));
  stopAt('home');
  // One tap starts today's session with the same center, ball and oil, then delete it again.
  await click('#bowlAgain');
  await sleep(80);
  {
    const again = db().sessions.at(-1);
    check('"Bowl at" opens game 1 of a new session', W.location.hash === `#/game/${again.id}/${again.games[0].id}` && db().sessions.length === 2, W.location.hash);
    check('it repeats the center, ball and oil', again.center === 'Test Lanes' && again.ball === 'House 12 lb' && again.oil === 'Unknown' && again.lane === '' && again.date === db().sessions[0].date, JSON.stringify(again));
    // A note from a session with no lane yet fills in the session's lane.
    await nav(`#/session/${again.id}`);
    check('a session with no lane offers a lane note', text('#laneRow') === 'Add a lane note', text('#laneRow'));
    await click('#laneRow [data-act="lanenote"]');
    check('the lane starts empty', $('#noteLane').value === '');
    $('#noteLane').value = '12';
    $('#noteLane').dispatchEvent(new W.Event('input', { bubbles: true }));
    await click('[data-verdict="good"]');
    await click('[data-act="save"]');
    check('saving it sets the session\'s lane', db().laneNotes.length === 2 && db().sessions.at(-1).lane === '12', db().sessions.at(-1).lane);
    check('Avoid lanes are listed first', [...D.querySelectorAll('#laneList .ln-lane')].map((x) => x.textContent).join() === 'Lane 7,Lane 12');
    await click('[aria-label="Edit lane 12"]');
    check('Edit opens that note', $('#noteLane').value === '12' && $('[data-verdict="good"]').classList.contains('on') && !!$('[data-act="delete"]'));
    await click('[data-act="delete"]');
    check('Delete removes it', db().laneNotes.length === 1 && db().laneNotes[0].lane === '7', JSON.stringify(db().laneNotes));
    // Typing a lane that has a note opens it ("07" is lane 7).
    $('#noteLane').value = '07';
    $('#noteLane').dispatchEvent(new W.Event('input', { bubbles: true }));
    $('#noteLane').dispatchEvent(new W.Event('change', { bubbles: true }));
    check('typing a noted lane opens its note', $('[data-verdict="avoid"]').classList.contains('on') && $('#noteText').value === 'Jams a lot');
    await nav(`#/session/${again.id}`);
    await click('[data-act="delete"]');
    check('the extra session is gone', db().sessions.length === 1);
  }

  // The session form shows your notes as you type the center and lane.
  await nav('#/new');
  check('the form warns about lanes at the last center', text('#laneHint') === 'Avoid lane 7 here' && $('#laneHint').classList.contains('warn'), text('#laneHint'));
  $('#lane').value = '07';
  $('#lane').dispatchEvent(new W.Event('input', { bubbles: true }));
  check('typing a noted lane shows its note', text('#laneHint').startsWith('Your note on lane 7: Avoid · Ball return · “Jams a lot”'), text('#laneHint'));
  $('#center').value = 'Elsewhere';
  $('#center').dispatchEvent(new W.Event('input', { bubbles: true }));
  check('another center has no notes', $('#laneHint').hidden);

  // ---- Stats ----
  await nav('#/stats');
  const tabOn = (key) => $(`[data-subtab="${key}"]`)?.getAttribute('aria-selected') === 'true';
  check('stats opens on Overview', tabOn('overview'));
  check('stats average 263', text('.tiles .tile:first-child .tv') === '263', text('.tiles .tile:first-child .tv'));
  check('trend chart rendered', !!$('#trend svg .c-line'));
  check('Overview leaves the line tables to their tab', !$('#lines') && !$('#leaves'));

  await click('[data-subtab="first"]');
  check('First ball tab shows the lines table', tabOn('first') && !!$('#lines') && !$('#progress'));
  check('combo table has a feet 20 + arrow 10 row', [...D.querySelectorAll('#lines tbody tr')].some((tr) => tr.children[0].textContent === '20' && tr.children[1].textContent === '10'));
  check('combo table shows the average breakpoint', [...D.querySelectorAll('#lines tbody tr')].some((tr) => tr.children[2]?.textContent === '6'));
  check('tables sit in a sideways-scrolling box', !!$('#lines .tbl-wrap .tbl'));
  check('accuracy card shows feet repeatability', text('#accuracy').includes('board 20'), text('#accuracy'));
  check('game-by-game table has games 1 and 2', D.querySelectorAll('#byGame tbody tr').length === 2);
  check('speed card shows the average', text('#speedCard').includes('25.0 km/h'), text('#speedCard'));
  stopAt('statsfirst');

  await click('[data-subtab="spares"]');
  check('7-10 leave listed as split', [...D.querySelectorAll('.leaves li')].some((li) => li.textContent.includes('7-10') && li.textContent.includes('split')));
  {
    const li = [...D.querySelectorAll('.leaves > li')].find((x) => x.textContent.includes('7-10'));
    li.querySelector('details').open = true;
    check('leave details list each time and link to practice', li.querySelectorAll('.leave-hist li').length === 1 && !!li.querySelector('a[href="#/practice/7-10"]'), li.textContent);
    check('leave shows the spare aim', li.textContent.includes('Aim: feet 11 · arrow 10'), li.textContent);
    check('leave summary holds only inline content', !li.querySelector('summary div'));
  }
  stopAt('statsspares');

  await click('[data-subtab="feel"]');
  check('feel table lists Rushed', text('#feel').includes('Rushed'), text('#feel'));
  check('oil filter offered', D.querySelectorAll('#fOil option').length === 2, text('#fOil'));
  $('#fDays').value = '30';
  $('#fDays').dispatchEvent(new W.Event('change'));
  await sleep(50);
  check('the tab stays open when a filter changes', tabOn('feel') && text('#feel').includes('Rushed'));
  await click('[data-subtab="overview"]');
  check('date filter keeps today\'s games', text('.tiles .tile:first-child .tv') === '263');
  $('#fDays').value = '0';
  $('#fDays').dispatchEvent(new W.Event('change'));
  await sleep(50);
  check('progress waits for 4 games', text('#progress').includes('at least 4 games'), text('#progress'));
  check('personal bests: 300 and 12 strikes in a row', text('#bests').includes('300') && /Strikes in a row\s*12/.test(text('#bests')), text('#bests'));
  await click('[data-by="session"]');
  check('per-session trend needs 2 sessions', text('.trend-by + .hint').includes('2 sessions'), text('.trend-by + .hint'));
  await click('[data-by="game"]');
  check('per-game trend chart is back', !!$('#trend svg .c-line'));
  stopAt('stats');

  // ---- Spare practice ----
  await nav('#/practice/7-10');
  check('practice opens on the chosen leave', text('.leave-pick .chip.on') === '7-10', text('.leave-pick .chip.on'));
  check('practice aim starts from the strike line', text('.card .aim').includes('feet 11 · arrow 10'), text('.card .aim'));
  await click('[data-act="made"]');
  await click('[data-act="made"]');
  await click('[data-act="missLeft"]');
  {
    const tries = db().practice;
    check('practice tries saved with the line and the way it missed', tries.length === 3 && tries.filter((p) => p.made).length === 2 && tries[0].feet === 11 && tries[0].leave.join('-') === '7-10'
      && tries[0].miss === null && tries[2].miss === 'left', JSON.stringify(tries));
  }
  check('practice tally for today', text('#tally .tile:first-child .tv') === '2/3', text('#tally .tile:first-child .tv'));
  await click('[data-act="undo"]');
  check('practice undo takes back the last try', db().practice.length === 2 && text('#tally .tile:first-child .tv') === '2/2' && text('#toast .toast-msg').includes('missed left'), text('#toast .toast-msg'));
  await click('[data-leave="10"]');
  check('another leave gets its own aim', text('.card .aim').includes('feet 32'), text('.card .aim'));
  // Keep missing the 10 pin to the left from board 32: after 4 tries the aim moves a board left.
  for (let i = 0; i < 3; i++) await click('[data-act="missLeft"]');
  check('3 misses leave the aim where it is', text('#practiceAim').includes('Aim: feet 32'), text('#practiceAim'));
  await click('[data-act="missLeft"]');
  check('after 4 misses left, the aim moves a board left', text('#practiceAim').includes('Your aim: feet 33') && laneVal('feet') === 'Board 33', `${text('#practiceAim')} | ${laneVal('feet')}`);
  check('the hint says why', text('#practiceAim + .hint').includes('Moved 1 board left from there (board 32 → 33), from your last 4 tries at this pin: 4 missed left.'), text('#practiceAim + .hint'));
  stopAt('practicemiss');
  for (let i = 0; i < 4; i++) await click('[data-act="undo"]');
  check('undoing the misses puts the aim back', text('#practiceAim').includes('Aim: feet 32') && db().practice.length === 2, text('#practiceAim'));
  await click('#pins .pin[data-pin="6"]');
  check('tapping pins makes a custom leave', text('.leave-pick .chip.on') === '6-10' && text('.card .aim').includes('feet 28'), `${text('.leave-pick .chip.on')} ${text('.card .aim')}`);
  stopAt('practice');
  await click('#pins .pin[data-pin="6"]');
  for (const p of [1, 2, 3, 4, 5, 6, 7, 8, 9]) await click(`#pins .pin[data-pin="${p}"]`);
  await click('[data-act="made"]');
  check('a full rack is not a spare to practise', db().practice.length === 2, String(db().practice.length));
  await nav('#/');
  check('home shows today\'s practice', text('#practiceToday').includes('2/2 on the 7-10'), text('#practiceToday'));
  await nav('#/stats');
  await click('[data-subtab="spares"]');
  check('Stats shows practice results next to the leave', [...D.querySelectorAll('.leaves > li')].some((li) => li.textContent.includes('7-10') && li.textContent.includes('practice 2/2')));
  await click('[data-subtab="overview"]');

  // ---- Glossary pop-up & help ----
  await nav('#/help');
  check('help glossary rendered', D.querySelectorAll('.glossary dt').length >= 8);
  await click('.info');
  check('info dialog opens', D.getElementById('infoDialog').open);
  await click('[data-close]');
  check('help shows the to-scale lane', !!$('#demoLane svg.lanemap .lm-pin') && D.querySelectorAll('#demoLane .lm-label').length >= 6);
  {
    // Tap 45 ft down the lane on board 8 (right-handed): moves the breakpoint there.
    const svg = $('#demoLane svg');
    const r = svg.getBoundingClientRect();
    const vb = svg.viewBox.baseVal;
    const opts = {
      bubbles: true, pointerId: 1, isPrimary: true,
      clientX: r.left + ((16 + (39 - 8) * 10 + 5) / vb.width) * r.width,
      clientY: r.top + ((1004 - 45 * 15) / vb.height) * r.height,
    };
    svg.dispatchEvent(new W.PointerEvent('pointerdown', opts));
    svg.dispatchEvent(new W.PointerEvent('pointerup', opts));
    await sleep(30);
    const bp = text('#demoLane [data-k="breakpoint"] .lr-val');
    check('tapping the to-scale lane sets the breakpoint', bp === 'Board 8 · 45 ft down the lane', bp);
  }
  stopAt('help');
  W.scrollTo(0, $('#demoLane').getBoundingClientRect().top + W.scrollY - 70);
  stopAt('lanetop');
  W.scrollBy(0, 560);
  stopAt('lanebottom');

  // ---- What's new ----
  await nav('#/changelog');
  check('update history lists releases', D.querySelectorAll('.release').length >= 3);
  stopAt('changelog');
  check('installed version is marked in the history', text('.release.current .rel-meta').startsWith(swVersionNow()), text('.release.current .rel-meta'));
  // Pretend the app was just updated from an older version: Home shows a one-time banner.
  const stored = db();
  stored.settings.seenVersion = 'v20000101-0000';
  localStorage.setItem('bowltrack.v1', JSON.stringify(stored));
  W.dispatchEvent(new StorageEvent('storage', { key: 'bowltrack.v1', newValue: JSON.stringify(stored) }));
  await nav('#/');
  check('home shows "what is new" after an update', !!$('.banner[href="#/changelog"]'));
  await click('.banner[href="#/changelog"]');
  await nav('#/');
  check('"what is new" banner goes away once read', !$('.banner[href="#/changelog"]'));

  // ---- Settings: left-handed flips the lane ----
  await nav('#/settings');
  check('settings shows the app version, matching sw.js', text('#appVersion') === SW_VERSION, `${text('#appVersion')} vs ${SW_VERSION}`);
  await click('[data-speed-unit="mph"]');
  check('mph saved', db().settings.speedUnit === 'mph');
  await nav('#/stats');
  await click('[data-subtab="first"]');
  check('speed card converts to mph', text('#speedCard').includes('15.5 mph'), text('#speedCard'));
  await click('[data-subtab="overview"]');
  await nav('#/settings');
  await click('[data-speed-unit="kph"]');
  check('km/h saved', db().settings.speedUnit === 'kph');
  check('Settings shows what to log', $('#logCard [data-log="all"]').classList.contains('on'));
  await click('#logCard [data-log="pins"]');
  check('what to log saved from Settings', db().settings.log === 'pins' && $('#logCard [data-log="pins"]').classList.contains('on'));
  await click('#logCard [data-log="all"]');
  await click('[data-hand="L"]');
  check('left-handed saved', db().settings.hand === 'L');
  stopAt('settings');
  check('settings shows a message', text('#toast .toast-msg') === 'Left-handed lane view', text('#toast .toast-msg'));
  // A new version taking over shows "App updated", replacing the older message.
  W.navigator.serviceWorker.dispatchEvent(new W.Event('controllerchange'));
  W.navigator.serviceWorker.dispatchEvent(new W.Event('controllerchange'));
  await sleep(3500);
  check('the update message stays until dismissed', $('#toast').classList.contains('show') && text('#toast .toast-msg').startsWith('App updated.'), text('#toast .toast-msg'));
  await click('#toast .toast-x');
  check('the × button dismisses the message', !$('#toast').classList.contains('show'));
  W.scrollTo(0, D.body.scrollHeight);
  stopAt('about');
  await nav(`#/session/${sid}`);
  await click('[data-act="newgame"]');
  await sleep(80);
  await click('[data-act="line"]');
  await tapLane('feet', 5, 'L');
  check('lefty lane maps taps to boards', laneVal('feet') === 'Board 5', laneVal('feet'));
  stopAt('lefty');

  // ---- Pins only ----
  await ball([]); // frame 1, recorded with feet on board 5
  await click('[data-log="pins"]');
  check('Pins only hides your line and the details', !$('#lane') && !$('#lineCard') && !$('#more') && db().settings.log === 'pins');
  await ball([]); // frame 2: pins only
  {
    const shot = db().sessions[0].games.at(-1).frames[1][0];
    check('Pins only saves pins only', shot.feet === null && shot.target === null && shot.standing.length === 0, JSON.stringify(shot));
  }
  await click('[data-act="undo"]');
  await click('[data-act="undo"]');
  await click('#saveBtn');
  {
    const shot = db().sessions[0].games.at(-1).frames[0][0];
    check('a ball taken back with Undo keeps its details with Pins only', shot.feet === 5, JSON.stringify(shot));
  }
  await click('#saveBtn');
  await ball([10]);
  check('Pins only still shows the spare aim, without Use', !!$('#aim') && !$('#aim [data-act="aim"]'), text('#aim'));
  await ball([]);

  // ---- Feet & arrow: no breakpoint or More details, and a nudge keeps the pins ----
  await click('[data-log="line"]');
  check('Feet & arrow brings your line back as one row', lineRow() === '5 10' && !$('#more') && db().settings.log === 'line', lineRow());
  await tapPins([10]);
  await click('[aria-label="Feet left"]');
  check('Feet left moves a left-hander a board lower', lineRow() === '4 10', lineRow());
  check('a nudge keeps the pins tapped', $('#pins .pin[data-pin="10"]').classList.contains('up') && text('#saveBtn') === 'Save · 9 pins', text('#saveBtn'));
  await click('[aria-label="Arrow right"]');
  check('Arrow right moves a left-hander a board higher', lineRow() === '4 11', lineRow());
  stopAt('feetarrow');
  await click('[data-act="line"]');
  check('Feet & arrow: the lane has no breakpoint', !!$('#lane') && !$('.lr-row[data-k="breakpoint"]') && laneVal('feet') === 'Board 4', laneVal('feet'));
  await tapLane('target', 12, 'L');
  await tapPins([10]); // a strike after all
  await click('#saveBtn');
  {
    const shot = db().sessions[0].games.at(-1).frames[3][0];
    check('the nudged line is saved, without a breakpoint', shot.feet === 4 && shot.target === 12 && shot.breakpoint === null && shot.standing.length === 0, JSON.stringify(shot));
  }

  // ---- Back button: redirects replace history instead of adding to it ----
  await nav('#/');
  const len = W.history.length;
  await nav('#/bowl');
  await sleep(80);
  check('Bowl tab redirect adds one history entry', W.history.length === len + 1 && W.location.hash.startsWith('#/game/'), `${len} -> ${W.history.length}`);

  // ---- Add details after the game ----
  // The left-handed game has 3 balls saved with Pins only (frame 2, and both balls of frame 3).
  for (let i = 0; i < 8; i++) await ball([]);
  await sleep(100);
  const lefty = () => db().sessions[0].games.at(-1);
  const scoreBefore = lefty().score;
  check('summary offers to add missing details', text('#reviewBtn').includes('3 balls to fill in'), text('#reviewBtn'));
  stopAt('adddetails');
  await click('#reviewBtn');
  await sleep(80);
  check('Add details opens the first ball without a line', text('.shot-head h2') === 'Editing · Frame 2 · Ball 1' && text('#reviewInfo').includes('3 balls'), `${text('.shot-head h2')} | ${text('#reviewInfo')}`);
  check('Add details shows every detail, whatever you log', !!$('.lr-row[data-k="breakpoint"]') && !!$('#more'));
  check('it starts from the line of the ball before', laneVal('feet') === 'Board 5' && laneVal('target') === 'Board 10 · 2nd arrow' && text('#reviewInfo').includes('frame 1, ball 1'), `${laneVal('feet')} | ${text('#reviewInfo')}`);
  await click('#pins .pin[data-pin="7"]');
  check('pins are locked after the game', !$('#pins .pin[data-pin="7"]').classList.contains('up') && !$('[data-act="allup"]'));
  stopAt('review');
  await click('[data-act="saveNext"]');
  check('Save moves on to the next ball', text('.shot-head h2') === 'Editing · Frame 3 · Ball 1' && text('#reviewInfo').includes('2 balls'), `${text('.shot-head h2')} | ${text('#reviewInfo')}`);
  await click('[data-act="skip"]');
  check('Skip moves on without saving', text('.shot-head h2') === 'Editing · Frame 3 · Ball 2' && laneVal('feet') === '–', `${text('.shot-head h2')} ${laneVal('feet')}`);
  await tapLane('feet', 30, 'L');
  await tapLane('target', 15, 'L');
  check('the last ball says Done', text('[data-act="saveNext"]') === 'Save · done', text('[data-act="saveNext"]'));
  await click('[data-act="saveNext"]');
  await sleep(80);
  {
    const g = lefty();
    check('details saved, pins and score unchanged', g.frames[1][0].feet === 5 && g.frames[2][1].feet === 30 && g.frames[2][0].feet === null && g.score === scoreBefore, JSON.stringify(g.frames.slice(1, 3)));
  }
  check('after the last ball it goes back to the summary', W.location.hash.startsWith('#/summary/') && text('#reviewBtn').includes('1 ball to fill in'), `${W.location.hash} ${text('#reviewBtn')}`);
  check('the message mentions the skipped ball', text('#toast .toast-msg').includes('1 ball you skipped'), text('#toast .toast-msg'));
  check('every ball in Frame by frame has an Edit button', D.querySelectorAll('.frames-review .shot-edit').length === 13, String(D.querySelectorAll('.frames-review .shot-edit').length));
  await click('.final .box[data-f="2"][data-s="0"]');
  await sleep(80);
  check('tapping a ball on the summary opens just that ball', text('.shot-head h2') === 'Editing · Frame 3 · Ball 1' && text('[data-act="saveEdit"]') === 'Save changes');
  await tapLane('feet', 6, 'L');
  await tapLane('target', 10, 'L');
  await click('[data-act="saveEdit"]');
  await sleep(80);
  check('saving it goes back to the summary, with nothing left to add', W.location.hash.startsWith('#/summary/') && !$('#reviewBtn') && lefty().frames[2][0].feet === 6, W.location.hash);
  await click('.frames-review .shot-edit[data-f="0"][data-s="0"]');
  await sleep(80);
  await click('[data-act="cancel"]');
  await sleep(80);
  check('Cancel goes back to the summary', W.location.hash.startsWith('#/summary/'), W.location.hash);

  // ---- Backup round trip ----
  const storage = await import('../js/storage.js');
  const before = localStorage.getItem('bowltrack.v1');
  storage.restoreBackup(before);
  check('backup restores cleanly', JSON.parse(localStorage.getItem('bowltrack.v1')).sessions.length === 1);
  check('backup keeps lane notes', JSON.parse(localStorage.getItem('bowltrack.v1')).laneNotes.length === 1);
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

  // ---- Progress over many sessions (made-up games that slowly get better) ----
  storage.restoreBackup(JSON.stringify({ settings: { seenVersion: SW_VERSION }, sessions: fakeSessions() }));
  await nav('#/stats');
  check('progress table compares first and last 9 of 18 games', D.querySelectorAll('#progress .tbl tbody tr').length >= 6 && text('#progress .card-h small') === 'first 9 vs last 9 games', text('#progress .card-h small'));
  check('progress says you are improving', text('#progress .verdict').startsWith("You're improving!"), text('#progress .verdict'));
  await click('[data-by="session"]');
  check('trend shows one point per session', $('[data-by="session"]').classList.contains('on') && text('#trend .c-val') === String(Math.round(db().sessions.at(-1).games.reduce((a, g) => a + g.score, 0) / 3)), text('#trend .c-val'));
  stopAt('progress');

  // ---- Coach: before you bowl ----
  check('the tab bar has a Coach tab', D.querySelectorAll('.tabbar a').length === 6 && !!$('.tabbar a[href="#/coach"]'));
  await nav('#/coach');
  check('before bowling, the coach says where to start', text('.topbar .t2') === 'Before you bowl' && /Feet \d+, arrow 10: it strikes \d+%/.test(text('#coachChat')), text('#coachChat').slice(0, 200));
  await click('[data-q="improving"]');
  check('tapping a question adds it and the answer', text('.bubble.you') === 'Am I improving?' && text('#coachChat').includes('Your last 9 games average'), text('#coachChat').slice(-200));
  {
    const reply = [...D.querySelectorAll('.bubble:not(.you)')].at(-1);
    check('a coach reply is one card, its points without their own boxes', W.getComputedStyle(reply).backgroundColor !== 'rgba(0, 0, 0, 0)'
      && W.getComputedStyle(reply.querySelector('.tip')).backgroundColor === 'rgba(0, 0, 0, 0)', W.getComputedStyle(reply).backgroundColor);
  }
  stopAt('coach');
  await nav('#/');
  check('home shows the change in average', /^▲ \+\d+\s+average, last 9 games vs\. your first 9$/.test(text('.hero-trend')), text('.hero-trend'));
  {
    const months = D.querySelectorAll('#sessionMonths details.month');
    check('home groups sessions by month, latest two open', months.length === 2 && months[0].open && months[1].open
      && months[0].querySelectorAll('.sessions li').length === 1 && months[1].querySelectorAll('.sessions li').length === 5, `${months.length}`);
    check('month header shows its average', /^avg \d+ · 15 games$/.test(months[1].querySelector('.month-sub').textContent), months[1].querySelector('.month-sub')?.textContent);
  }
  await nav('#/stats');
  {
    // Same window as the calendar: back to the Monday 25 weeks before this week's Monday.
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7) - 25 * 7);
    const inRange = db().sessions.filter((s) => new Date(`${s.date}T00:00`) >= start).length;
    check('calendar has a cell for each day bowled', D.querySelectorAll('#calendar rect.cal-day').length === inRange, `${D.querySelectorAll('#calendar rect.cal-day').length} vs ${inRange}`);
    check('calendar days link to their session', !inRange || !!$(`#calendar a[href="#/session/${db().sessions.at(-1).id}"]`));
  }
  stopAt('calendar');
  await click('[data-subtab="first"]');
  check('carry card shows strikes on pocket hits', text('#carry').includes('Strikes on pocket hits') && D.querySelectorAll('#carry .carry-list li').length > 0, text('#carry'));
  stopAt('carry');
  await click('[data-subtab="overview"]');
  await nav(`#/session/${db().sessions.at(-1).id}`);
  check('session shows the feet move', D.querySelectorAll('#moves li').length === 1 && text('#moves .move-title').startsWith('Game 2 · frame 1: feet 18 → 20 (2 boards left)'), text('#moves'));
  stopAt('moves');

  // ---- Goals ----
  await nav('#/goals');
  const toggleGoal = async (key) => {
    const sw = $(`[data-goal="${key}"]`);
    sw.checked = !sw.checked;
    sw.dispatchEvent(new W.Event('change'));
    await sleep(50);
  };
  const setTarget = async (key, v) => {
    const input = $(`[data-target="${key}"]`);
    input.value = String(v);
    input.dispatchEvent(new W.Event('change'));
    await sleep(50);
  };
  await toggleGoal('spares');
  await setTarget('spares', 5);
  check('spare goal saved', JSON.stringify(db().settings.goals.map((g) => [g.key, g.target])) === '[["spares",5]]', JSON.stringify(db().settings.goals));
  check('a goal you already beat shows as reached', !!$('#goalStatus li.met[data-goal-row="spares"]'));
  await toggleGoal('average');
  const avgNow = parseFloat(text('#goalStatus [data-goal-row="average"] strong').replace(/^now\s*/, ''));
  await setTarget('average', avgNow + 5);
  check('average goal not reached yet', !!$('#goalStatus [data-goal-row="average"]') && !$('#goalStatus li.met[data-goal-row="average"]'), text('#goalStatus'));
  stopAt('goals');
  await nav('#/');
  check('home lists your goals', D.querySelectorAll('.goals li').length === 2);
  // A 300 game lifts the 10-game average past the goal: the summary celebrates it, once.
  await nav(`#/session/${db().sessions.at(-1).id}`);
  await click('[data-act="newgame"]');
  await sleep(80);
  for (let i = 0; i < 12; i++) await click('#saveBtn');
  await sleep(100);
  const averageCelebrated = () => [...D.querySelectorAll('.goal-reached')].some((el) => el.textContent.startsWith('Goal reached: Average score'));
  check('summary says the goal was reached', averageCelebrated(), text('.hero'));
  check('the spare goal you already beat is not credited to this game', ![...D.querySelectorAll('.goal-reached')].some((el) => el.textContent.includes('Spares made')), text('.hero'));
  check('goal remembers when it was reached', !!db().settings.goals.find((g) => g.key === 'average').reachedOn);
  check('summary compares with your average', /^\+\d+\s+vs your average \(\d+\)$/.test(text('#vsAverage')), text('#vsAverage'));
  stopAt('goalreached');
  await click('[data-act="undo"]');
  await sleep(80);
  check('reopening the game takes the goal back', db().settings.goals.find((g) => g.key === 'average').reachedGame === null);
  await click('#saveBtn');
  await sleep(100);
  check('finishing it again celebrates again', averageCelebrated(), text('.hero'));
  await click('[data-act="another"]');
  await sleep(80);
  for (let i = 0; i < 20; i++) {
    await click('[data-act="allup"]');
    await click('#saveBtn');
  }
  await sleep(100);
  check('a bad game afterwards is not celebrated', text('.final-score') === '0' && !$('.goal-reached'), text('.hero'));

  // ---- Midnight lanes is the default theme; Minimal is one tap away ----
  const themeColor = () => D.querySelector('meta[name="theme-color"]').content;
  await nav('#/settings');
  check('Midnight lanes is the default theme', db().settings.skin === 'classic' && D.documentElement.dataset.skin === 'classic'
    && $('.chip[data-skin]').dataset.skin === 'classic' && $('.chip[data-skin="classic"]').classList.contains('on') && themeColor() === '#0b1222', `${db().settings.skin} ${themeColor()}`);
  await click('.chip[data-skin="minimal"]');
  await sleep(100);
  check('switching to Minimal is saved', db().settings.skin === 'minimal' && D.documentElement.dataset.skin === 'minimal');
  check('minimal theme uses the Inter font', W.getComputedStyle(D.body).fontFamily.startsWith('Inter'), W.getComputedStyle(D.body).fontFamily);
  const page = W.getComputedStyle(D.documentElement).getPropertyValue('--page').trim();
  check('status bar matches the page color', themeColor() === page && ['#ffffff', '#0b0b0c'].includes(page), `${themeColor()} vs ${page}`);
  await D.fonts.ready;
  check('Inter font file loads', D.fonts.check('16px Inter'));
  stopAt('minsettings');
  await nav('#/');
  check('minimal hero has no dark background', W.getComputedStyle($('.hero')).backgroundImage === 'none');
  check('minimal stat tiles are one column of rows', W.getComputedStyle($('.tiles')).gridTemplateColumns.split(' ').length === 1, W.getComputedStyle($('.tiles')).gridTemplateColumns);
  stopAt('minhome');
  await nav('#/stats');
  stopAt('minstats');
  await click('[data-by="game"]');
  const msid = db().sessions.at(-1).id;
  await nav(`#/session/${msid}`);
  await click('[data-act="newgame"]');
  await sleep(80);
  await tapPins([7, 10]);
  stopAt('mingame');
  await nav('#/help');
  W.scrollTo(0, $('#demoLane').getBoundingClientRect().top + W.scrollY - 70);
  stopAt('minhelp');
  await nav('#/settings');
  await click('.chip[data-skin="classic"]');
  await sleep(100);
  check('back to the classic theme', D.documentElement.dataset.skin === 'classic' && themeColor() === '#0b1222', themeColor());

  // ---- With no strike line yet, a new spare starts from your last spare, not a made-up aim ----
  const open = Array.from({ length: 9 }, () => []);
  storage.restoreBackup(JSON.stringify({ settings: { seenVersion: SW_VERSION }, sessions: [{ id: 'n1', date: '2026-10-01', center: 'Test Lanes',
    games: [{ id: 'n1g1', frames: [[{ standing: [10] }, { standing: [], feet: 30, target: 12 }], ...open] }] }] }));
  await sleep(150);
  await nav('#/game/n1/n1g1');
  check('a backup from before What to log gets Feet & arrow', db().settings.log === 'line', db().settings.log);
  check('a first ball with no line on record shows the lane, without the breakpoint', !!$('#lane') && laneVal('feet') === '–' && !$('.lr-row[data-k="breakpoint"]'), laneVal('feet'));
  await ball([7]);
  check('no strike line: the spare starts from the last spare, with the aim to Use', lineRow() === '30 12' && !!$('#aim [data-act="aim"]'), lineRow());

  // ---- Quick mode from an older backup becomes Pins only; "Same as last ball" copies only what's shown ----
  storage.restoreBackup(JSON.stringify({ settings: { seenVersion: SW_VERSION, quick: true }, sessions: [{ id: 'n2', date: '2026-10-02', center: 'Test Lanes',
    games: [{ id: 'n2g1', frames: [[{ standing: [], feet: 18, target: 9, breakpoint: 5, speed: 15 }], ...open] }] }] }));
  await sleep(150);
  await nav('#/game/n2/n2g1');
  check('quick mode on becomes Pins only', db().settings.log === 'pins' && !$('#lineCard') && $('[data-log="pins"]').classList.contains('on'), db().settings.log);
  await click('[data-log="line"]');
  await click('[data-act="line"]');
  await click('[data-act="repeat"]');
  await click('#saveBtn');
  {
    const shot = db().sessions[0].games[0].frames[1][0];
    check('with Feet & arrow, "Same as last ball" leaves the breakpoint and speed out', shot.feet === 18 && shot.target === 9 && shot.breakpoint === null && shot.speed === null, JSON.stringify(shot));
  }

  // ---- Coach during a game, then after the session ----
  {
    const d = new Date();
    const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const lightFrame = [{ standing: [2, 4, 5], feet: 20, target: 10 }, { standing: [] }];
    storage.restoreBackup(JSON.stringify({ settings: { seenVersion: SW_VERSION }, sessions: [{ id: 'c1', date: today, center: 'Test Lanes',
      games: [{ id: 'c1g1', frames: [lightFrame, lightFrame, ...Array.from({ length: 8 }, () => [])] }] }] }));
    await sleep(150);
    await nav('#/game/c1/c1g1');
    check('the game top bar links to the coach', $('.coach-link')?.getAttribute('href') === '#/coach');
    await nav('#/coach');
    check('during a game, the coach reads it', text('.topbar .t2') === 'During your game' && text('#coachChat').includes('Hitting light')
      && text('#coachChat').includes('(feet 20 → 18, keep arrow 10)'), text('#coachChat').slice(0, 300));
    check('and offers the way back', $('#backToGame')?.getAttribute('href') === '#/game/c1/c1g1' && $('.tb-back')?.getAttribute('href') === '#/game/c1/c1g1');
    await click('[data-q="now"]');
    check('"What should I change right now?" answers with the move', [...D.querySelectorAll('.bubble')].at(-1).textContent.includes('feet 20 → 18'));
    stopAt('coachgame');
    await nav('#/game/c1/c1g1');
    for (let i = 0; i < 10; i++) await ball([]); // strikes in frames 3-9 and three in the 10th
    await sleep(100);
    await nav('#/coach');
    check('after the session, the coach recaps the day', text('.topbar .t2') === 'After your session' && text('#coachChat').includes('1 game, average')
      && text('#coachChat').includes('What went well'), text('#coachChat').slice(0, 300));
  }
}

// Six weekly sessions of three games, slowly improving: more strikes and spares each week.
function fakeSessions() {
  let seed = 7;
  const rand = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  const ALL = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  const pick = (pins, n) => pins.slice().sort(() => rand() - 0.5).slice(0, n).sort((a, b) => a - b);
  const leave = (skill) => pick(ALL, 1 + Math.floor(rand() * (rand() < skill ? 2 : 6)));
  const second = (standing, skill) => (rand() < skill + 0.1 ? [] : pick(standing, 1 + Math.floor(rand() * standing.length)));
  // The last session moves 2 boards after its first game, for the Moves card.
  const ball = (standing, w, g) => ({ standing, feet: 20 - (w % 3) + (w === 5 && g > 0 ? 2 : 0), target: 10, hit: standing.length ? ['light', 'high', 'pocket'][Math.floor(rand() * 3)] : 'pocket' });
  const sessions = [];
  for (let w = 0; w < 6; w++) {
    const skill = 0.2 + w * 0.09;
    const date = new Date(2026, 8, 1 + w * 7);
    const games = [];
    for (let g = 0; g < 3; g++) {
      const frames = [];
      for (let f = 0; f < 9; f++) {
        if (rand() < skill * 0.6) { frames.push([ball([], w, g)]); continue; }
        const first = leave(skill);
        frames.push([ball(first, w, g), ball(second(first, skill), w, g)]);
      }
      const first = leave(skill);
      const next = second(first, skill);
      frames.push(next.length ? [ball(first, w, g), ball(next, w, g)] : [ball(first, w, g), ball(next, w, g), ball(leave(skill), w, g)]);
      games.push({ id: `w${w}g${g}`, frames });
    }
    const iso = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    sessions.push({ id: `w${w}`, date: iso, center: 'Test Lanes', ball: 'House 12 lb', games });
  }
  return sessions;
}

run()
  .catch((e) => { if (!(e instanceof Stop)) check('run completed', false, e.stack || e.message); })
  .finally(() => {
    log.push(STOP ? `(stopped at ${STOP})` : '');
    report();
    // Picked up by tests/run_tests.py; harmless when opened by hand.
    if (!STOP) fetch('/__results', { method: 'POST', body: out.textContent }).catch(() => {});
  });
