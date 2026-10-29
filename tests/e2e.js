// End-to-end run of the app inside a phone-sized iframe.
// Open tests/e2e.html (served over http). Add ?stop=<step> to freeze the app at a step for screenshots:
// welcome, summary300, pins, spareaim, game, summary, session, home, stats, statsfirst, statsspares, help,
// lanetop, lanebottom, changelog, settings, about, lefty, progress, practice, goals, goalreached, minsettings, minhome,
// minstats, mingame, minhelp.
// Add &skin=classic to look at the Midnight lanes theme up to the "progress" step (a restore resets it).

const PARAMS = new URLSearchParams(location.search);
const STOP = PARAMS.get('stop');
const SKIN = PARAMS.get('skin');
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
  const guarded = el.matches('#saveBtn, [data-act="undo"], [data-act="saveEdit"], [data-act="made"], [data-act="miss"]');
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

  // ---- New session ----
  await click('a[href="#/new"]');
  check('session form shown', !!$('#sessionForm'));
  $('#center').value = 'Test Lanes';
  $('#lane').value = '7';
  $('#ball').value = 'House 12 lb';
  $('#notes').value = 'Keep my head down';
  $('#sessionForm').requestSubmit();
  await sleep(120);
  const [, sid, gid1] = W.location.hash.match(/#\/game\/(\w+)\/(\w+)/) ?? [];
  check('starts game after session form', !!gid1, W.location.hash);
  check('session notes show on the game screen', text('#focus').includes('Keep my head down'), text('#focus'));

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
  check('spare aim suggests feet 32 for the 10 pin', text('#aim').includes('feet 32 · arrow 10'), text('#aim'));
  stopAt('spareaim');
  await click('[data-act="aim"]');
  check('Use puts the spare aim on the lane', laneVal('feet') === 'Board 32' && laneVal('target') === 'Board 10 · 2nd arrow', laneVal('feet'));
  await ball([]);
  check('no spare aim on a first ball', !$('#aim'));

  // Frame 2 first ball: "Same as last ball" copies frame 1's breakpoint and speed.
  await click('[data-act="repeat"]');
  check('"Same as last ball" copies breakpoint and speed', laneVal('breakpoint') === 'Board 6' && $('#speed').value === '15.5', `${laneVal('breakpoint')} ${$('#speed').value}`);

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
  check('summary shows the score with every spare made', text('#whatIf').includes('257'), text('#whatIf'));
  check('missed spares link to practice', !!$('.frames-review a[href="#/practice/7-10"]'));

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
  check('session shows strikes, spares and open frames', ['Strikes', 'Spares made', 'Open frames a game'].every((t) => text('#sessionTiles').includes(t)), text('#sessionTiles'));
  check('session links to that center\'s stats', text('#centerStats').includes('Test Lanes'), text('#centerStats'));
  stopAt('session');
  await nav('#/');
  check('home shows session with scores', text('.li-scores').includes('300') && text('.li-scores').includes('225'), text('.li-scores'));
  stopAt('home');

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
  check('speed card shows the average', text('#speedCard').includes('15.5 mph'), text('#speedCard'));
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
  await click('[data-act="miss"]');
  {
    const tries = db().practice;
    check('practice tries saved with the line', tries.length === 3 && tries.filter((p) => p.made).length === 2 && tries[0].feet === 11 && tries[0].leave.join('-') === '7-10', JSON.stringify(tries));
  }
  check('practice tally for today', text('#tally .tile:first-child .tv') === '2/3', text('#tally .tile:first-child .tv'));
  await click('[data-act="undo"]');
  check('practice undo takes back the last try', db().practice.length === 2 && text('#tally .tile:first-child .tv') === '2/2');
  await click('[data-leave="10"]');
  check('another leave gets its own aim', text('.card .aim').includes('feet 32'), text('.card .aim'));
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
  await tapLane('feet', 5, 'L');
  check('lefty lane maps taps to boards', laneVal('feet') === 'Board 5', laneVal('feet'));
  stopAt('lefty');

  // ---- Quick mode: pins only ----
  await ball([]); // frame 1, recorded with feet on board 5
  await click('[data-act="quick"]');
  check('quick mode hides the lane', !$('#lane') && !!$('#quickCard') && db().settings.quick === true);
  await ball([]); // frame 2: pins only
  {
    const shot = db().sessions[0].games.at(-1).frames[1][0];
    check('quick mode saves pins only', shot.feet === null && shot.target === null && shot.standing.length === 0, JSON.stringify(shot));
  }
  await click('[data-act="undo"]');
  await click('[data-act="undo"]');
  await click('#saveBtn');
  {
    const shot = db().sessions[0].games.at(-1).frames[0][0];
    check('a ball taken back with Undo keeps its details in quick mode', shot.feet === 5, JSON.stringify(shot));
  }
  await click('#saveBtn');
  await ball([10]);
  check('quick mode still shows the spare aim, without Use', !!$('#aim') && !$('#aim [data-act="aim"]'), text('#aim'));
  await ball([]);
  await click('[data-act="quick"]');
  check('lane comes back when quick mode is off', !!$('#lane') && db().settings.quick === false);

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

  // ---- Progress over many sessions (made-up games that slowly get better) ----
  storage.restoreBackup(JSON.stringify({ settings: { seenVersion: SW_VERSION }, sessions: fakeSessions() }));
  await nav('#/stats');
  check('progress table compares first and last 9 of 18 games', D.querySelectorAll('#progress .tbl tbody tr').length >= 6 && text('#progress .card-h small') === 'first 9 vs last 9 games', text('#progress .card-h small'));
  check('progress says you are improving', text('#progress .verdict').startsWith("You're improving!"), text('#progress .verdict'));
  await click('[data-by="session"]');
  check('trend shows one point per session', $('[data-by="session"]').classList.contains('on') && text('#trend .c-val') === String(Math.round(db().sessions.at(-1).games.reduce((a, g) => a + g.score, 0) / 3)), text('#trend .c-val'));
  stopAt('progress');
  await nav('#/');
  check('home shows the change in average', /^▲ \+\d+\s+average, last 9 games vs\. your first 9$/.test(text('.hero-trend')), text('.hero-trend'));

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

  // ---- Minimal theme (the default) ----
  const themeColor = () => D.querySelector('meta[name="theme-color"]').content;
  await nav('#/settings');
  check('minimal is the default theme', db().settings.skin === 'minimal' && D.documentElement.dataset.skin === 'minimal' && $('.chip[data-skin="minimal"]').classList.contains('on'), db().settings.skin);
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
}

// Six weekly sessions of three games, slowly improving: more strikes and spares each week.
function fakeSessions() {
  let seed = 7;
  const rand = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  const ALL = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  const pick = (pins, n) => pins.slice().sort(() => rand() - 0.5).slice(0, n).sort((a, b) => a - b);
  const leave = (skill) => pick(ALL, 1 + Math.floor(rand() * (rand() < skill ? 2 : 6)));
  const second = (standing, skill) => (rand() < skill + 0.1 ? [] : pick(standing, 1 + Math.floor(rand() * standing.length)));
  const ball = (standing, w) => ({ standing, feet: 20 - (w % 3), target: 10, hit: standing.length ? ['light', 'high', 'pocket'][Math.floor(rand() * 3)] : 'pocket' });
  const sessions = [];
  for (let w = 0; w < 6; w++) {
    const skill = 0.2 + w * 0.09;
    const date = new Date(2026, 8, 1 + w * 7);
    const games = [];
    for (let g = 0; g < 3; g++) {
      const frames = [];
      for (let f = 0; f < 9; f++) {
        if (rand() < skill * 0.6) { frames.push([ball([], w)]); continue; }
        const first = leave(skill);
        frames.push([ball(first, w), ball(second(first, skill), w)]);
      }
      const first = leave(skill);
      const next = second(first, skill);
      frames.push(next.length ? [ball(first, w), ball(next, w)] : [ball(first, w), ball(next, w), ball(leave(skill), w)]);
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
