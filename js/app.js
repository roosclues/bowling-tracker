// Hash router, bottom tabs, glossary pop-ups, and service worker registration.

import { currentGame, onExternalChange, loadProblem } from './storage.js';
import { GLOSSARY } from './terms.js';
import { go, toast, esc } from './util.js';
import { icon } from './ui.js';
import { keepAwake } from './device.js';
import * as home from './views/home.js';
import * as session from './views/session.js';
import * as game from './views/game.js';
import * as summary from './views/summary.js';
import * as stats from './views/stats.js';
import * as settings from './views/settings.js';
import * as help from './views/help.js';

const root = document.getElementById('view');

const TABS = [
  ['home', '#/', 'home', 'Home'],
  ['bowl', '#/bowl', 'ball', 'Bowl'],
  ['stats', '#/stats', 'stats', 'Stats'],
  ['help', '#/help', 'help', 'Help'],
  ['settings', '#/settings', 'settings', 'Settings'],
];
document.getElementById('tabbar').innerHTML = TABS.map(([tab, href, ico, label]) =>
  `<a href="${href}" data-tab="${tab}"><span class="ti">${icon(ico, 24)}</span>${label}</a>`).join('');

const routes = [
  [/^#\/?$/, home.render, 'home'],
  [/^#\/new$/, (r) => session.renderForm(r), 'bowl'],
  [/^#\/session\/(\w+)$/, session.renderDetail, 'home'],
  [/^#\/session\/(\w+)\/edit$/, session.renderForm, 'home'],
  [/^#\/game\/(\w+)\/(\w+)$/, game.render, 'bowl'],
  [/^#\/summary\/(\w+)\/(\w+)$/, summary.render, 'bowl'],
  [/^#\/stats$/, stats.render, 'stats'],
  [/^#\/settings$/, settings.render, 'settings'],
  [/^#\/help$/, help.render, 'help'],
  [/^#\/bowl$/, () => {
    const cur = currentGame();
    go(cur ? `#/game/${cur.session.id}/${cur.game.id}` : '#/new', { replace: true });
  }, 'bowl'],
];

let lastHash = null;
function route() {
  const hash = location.hash || '#/';
  root.onclick = null;
  const match = routes.find(([re]) => re.test(hash));
  const [re, fn, tab] = match ?? routes[0];
  document.querySelectorAll('.tabbar a').forEach((a) => {
    a.classList.toggle('on', a.dataset.tab === tab);
    if (a.dataset.tab === tab) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
  document.body.classList.toggle('has-actionbar', false);
  try {
    fn(root, ...(hash.match(re)?.slice(1) ?? []));
  } catch (e) {
    console.error(e);
    root.innerHTML = `
      <div class="page"><div class="card">
        <h3>Something went wrong on this screen</h3>
        <p class="hint">Your saved games are not affected. Error: ${esc(e.message)}</p>
        <a class="btn primary block" href="#/">Go home</a>
        <a class="btn block" href="#/settings">Settings &amp; backup</a>
      </div></div>`;
  }
  document.body.classList.toggle('has-actionbar', !!root.querySelector('.actionbar'));
  keepAwake(hash.startsWith('#/game/'));
  if (hash !== lastHash) window.scrollTo({ top: 0 });
  lastHash = hash;
}

window.addEventListener('hashchange', route);
onExternalChange(route);
route();

if (loadProblem) {
  alert(`Your saved data could not be read (${loadProblem.message}). A copy was kept on this phone. You can restore a backup from Settings.`);
}

// Glossary pop-up for every (i) button.
const dialog = document.getElementById('infoDialog');
document.addEventListener('click', (e) => {
  const btn = e.target.closest('.info');
  if (!btn) return;
  e.preventDefault();
  const term = GLOSSARY[btn.dataset.term];
  if (!term) return;
  dialog.querySelector('h3').textContent = term.title;
  dialog.querySelector('p').textContent = term.text;
  dialog.showModal();
});
dialog.addEventListener('click', (e) => {
  if (e.target === dialog || e.target.closest('[data-close]')) dialog.close();
});

if ('serviceWorker' in navigator) {
  // A new version installs in the background; it takes over on the next launch.
  let hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hadController) toast('App updated. Close and reopen it to use the new version.');
    hadController = true;
  });
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
