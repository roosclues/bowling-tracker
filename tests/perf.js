// Speed check: opens the app with a lot of made-up bowling (?games=500 by default) and times each
// screen, from the tap to the screen being laid out. Run with: python tests/run_tests.py --perf
// Times are the median of 5 tries on this computer; a mid-range phone is about 4 times slower.

import { fakeData } from './fakedata.js';

const PARAMS = new URLSearchParams(location.search);
const GAMES = Number(PARAMS.get('games')) || 500;
const TRIES = 5;
const SLOW_MS = 50; // on this computer; about 200 ms on a phone, where a tap starts to feel slow
const frame = document.getElementById('app');
const out = document.getElementById('out');
const lines = [];
let W;
let D;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const $ = (s) => D.querySelector(s);
const median = (xs) => xs.slice().sort((a, b) => a - b)[Math.floor(xs.length / 2)];

// Time from the hash change to the new screen laid out. The router listens to hashchange, and
// this listener, added after it, runs once the screen is drawn.
let started = 0;
let took = 0;
function watchRoutes() {
  W.addEventListener('hashchange', () => { void D.body.offsetHeight; took = performance.now() - started; });
}
async function timeNav(label, hash) {
  const times = [];
  for (let i = 0; i < TRIES; i++) {
    W.location.hash = '#/help'; // somewhere cheap, so the next change is a real one
    await sleep(30);
    started = performance.now();
    W.location.hash = hash;
    await sleep(30);
    times.push(took);
  }
  record(label, times);
}
// A tap handled right away (tab buttons, Save).
async function timeTap(label, sel, before = null) {
  const times = [];
  for (let i = 0; i < TRIES; i++) {
    if (before) await before();
    const el = $(sel);
    if (!el) { lines.push(`MISSING ${label} (${sel})`); return; }
    const t = performance.now();
    el.dispatchEvent(new W.MouseEvent('click', { bubbles: true, cancelable: true }));
    void D.body.offsetHeight;
    times.push(performance.now() - t);
    await sleep(30);
  }
  record(label, times);
}
function record(label, times) {
  const ms = median(times);
  lines.push(`${ms > SLOW_MS ? 'SLOW' : 'ok  '} ${String(Math.round(ms)).padStart(5)} ms  ${label}`);
  out.textContent = lines.join('\n');
}

async function run() {
  localStorage.clear();
  localStorage.setItem('bowltrack.v1', JSON.stringify(fakeData(GAMES)));
  await new Promise((res) => {
    frame.onload = res;
    frame.src = '../index.html';
  });
  W = frame.contentWindow;
  D = W.document;
  const errors = [];
  W.addEventListener('error', (e) => errors.push(e.message));
  await sleep(300);
  watchRoutes();
  const db = JSON.parse(localStorage.getItem('bowltrack.v1'));
  const last = db.sessions.at(-1);
  lines.push(`${db.sessions.length} sessions, ${db.sessions.reduce((n, s) => n + s.games.length, 0)} games, ${db.practice.length} practice tries`, '');

  await timeNav('Home', '#/');
  await timeNav('Stats (Overview)', '#/stats');
  for (const [key, label] of [['first', 'First ball'], ['spares', 'Spares'], ['feel', 'Feel'], ['monthly', 'Monthly'], ['lifetime', 'Lifetime'], ['overview', 'Overview']]) {
    await timeTap(`Stats → ${label} tab`, `[data-subtab="${key}"]`);
  }
  await timeTap('Stats → Monthly ‹ previous month', '[data-month-key]', async () => {
    if (!$('[data-subtab="monthly"][aria-selected="true"]')) $('[data-subtab="monthly"]').click();
  });
  await timeNav('Session screen', `#/session/${last.id}`);
  await timeNav('Game summary', `#/summary/${last.id}/${last.games.at(-1).id}`);
  await timeNav('Coach', '#/coach');
  await timeNav('Goals', '#/goals');
  await timeNav('Settings', '#/settings');
  await timeNav('Spare practice', '#/practice');

  // A new game: the game screen, then saving a ball (the tap made most often).
  W.location.hash = '#/new';
  await sleep(100);
  $('#center').value = 'Speed Lanes';
  $('#sessionForm').requestSubmit();
  await sleep(150);
  const game = W.location.hash;
  await timeNav('Game screen', game);
  await timeTap('Save a ball (strike)', '#saveBtn', () => sleep(400)); // Save ignores a second tap within 350 ms
  // Finish the game with strikes, then time its summary, which checks milestones and goals.
  for (let i = 0; i < 12 && W.location.hash.startsWith('#/game/'); i++) {
    $('#saveBtn')?.click();
    await sleep(400);
  }
  const summary = W.location.hash.replace('#/game/', '#/summary/');
  await timeNav('Summary of a game just bowled', summary);

  lines.push('', errors.length ? `PAGE ERRORS:\n${errors.join('\n')}` : 'No page errors.');
  out.textContent = lines.join('\n');
}

run().catch((e) => { lines.push(`ERROR ${e.stack || e.message}`); out.textContent = lines.join('\n'); })
  .finally(() => fetch('/__results', { method: 'POST', body: out.textContent }).catch(() => {}));
