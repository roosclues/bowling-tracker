// Stats, in six tabs under one set of filters. Each tab lives in its own file in stats/:
//   Overview   - headline numbers, are you improving, personal bests, tips, score trend
//   Monthly    - one calendar month, compared with the month before, and month by month
//   Lifetime   - totals since your first game, score spread, milestones
//   First ball - best lines, accuracy, where the ball hit, game by game, speed
//   Spares     - spare rates and each common leave, with its aim and your practice results
//   Feel       - how "how it felt" tags line up with strikes
// A tab gives body({ st, sessions, hints }) for its HTML, and optionally after(root, ctx, rerender)
// to draw charts and handle its own taps once it's on the page.
// Monthly and Lifetime pick their own dates, so the date range filter is hidden there.

import { db } from '../storage.js';
import { computeStats, filterSessions, spareAimFor } from '../stats.js';
import { tips } from '../tips.js';
import { topbar } from '../ui.js';
import { esc, go } from '../util.js';
import * as overview from './stats/overview.js';
import * as monthly from './stats/monthly.js';
import * as lifetime from './stats/lifetime.js';
import * as firstball from './stats/firstball.js';
import * as spares from './stats/spares.js';
import * as feel from './stats/feel.js';

const NO_FILTERS = { days: 0, center: '', ball: '', oil: '', kind: '' };
const filters = { ...NO_FILTERS };
let tab = 'overview';
let scrollToCard = null; // a card to bring into view on the next render, then forgotten

const TABS = [
  ['overview', 'Overview', overview], ['monthly', 'Monthly', monthly], ['lifetime', 'Lifetime', lifetime],
  ['first', 'First ball', firstball], ['spares', 'Spares', spares], ['feel', 'Feel', feel],
];
const OWN_DATES = ['monthly', 'lifetime'];

// Opens Stats on Overview, filtered to one center (from a session's screen).
export function showStatsFor({ center = '' } = {}) {
  Object.assign(filters, NO_FILTERS, { center });
  tab = 'overview';
  go('#/stats');
}

// Opens Stats on one tab with no filters, scrolled to the card `anchor` if given (the summary's
// milestone pill opens Lifetime at Milestones).
export function showStatsTab(key, anchor = null) {
  Object.assign(filters, NO_FILTERS);
  tab = key;
  scrollToCard = anchor;
  go('#/stats');
}

// A filter box only shows when there's something to pick between (or it's in use).
const hideIf = (values, selected) => (values.length < 2 && !selected ? ' hidden' : '');

function options(values, selected, allLabel) {
  return `<option value="">${allLabel}</option>` +
    values.map((v) => `<option value="${esc(v)}"${v === selected ? ' selected' : ''}>${esc(v)}</option>`).join('');
}

export function render(root) {
  const centers = [...new Set(db.sessions.map((s) => s.center).filter(Boolean))];
  const balls = [...new Set(db.sessions.map((s) => s.ball).filter(Boolean))];
  const oils = [...new Set(db.sessions.map((s) => s.oil).filter(Boolean))];
  // A filter can point at a center, ball or oil that was renamed or restored away; drop it.
  if (!centers.includes(filters.center)) filters.center = '';
  if (!balls.includes(filters.ball)) filters.ball = '';
  if (!oils.includes(filters.oil)) filters.oil = '';
  // League nights or the rest: only worth offering when there are both.
  const kinds = db.settings.league.on && db.sessions.some((x) => x.league) && db.sessions.some((x) => !x.league) ? ['league', 'other'] : [];
  if (!kinds.includes(filters.kind)) filters.kind = '';
  const ownDates = OWN_DATES.includes(tab);
  const sessions = filterSessions(db.sessions, ownDates ? { ...filters, days: 0 } : filters);
  const st = computeStats(sessions);
  const hints = tips(st, db.settings.hand, sessions, db.settings.speedUnit, (leave) => spareAimFor(leave, db.sessions, db.practice, db.settings.hand));
  const filtered = (!ownDates && filters.days) || filters.center || filters.ball || filters.oil || filters.kind;
  const view = (TABS.find(([key]) => key === tab) ?? TABS[0])[2];
  const ctx = { st, sessions, hints };

  root.innerHTML = `
    ${topbar({ title: 'Stats' })}
    <div class="page">
      <div class="filters">
        <select id="fDays" aria-label="Date range"${ownDates ? ' hidden' : ''}>
          <option value="0"${filters.days === 0 ? ' selected' : ''}>All time</option>
          <option value="30"${filters.days === 30 ? ' selected' : ''}>Last 30 days</option>
          <option value="90"${filters.days === 90 ? ' selected' : ''}>Last 90 days</option>
        </select>
        <select id="fCenter" aria-label="Bowling center"${hideIf(centers, filters.center)}>${options(centers, filters.center, 'All centers')}</select>
        <select id="fBall" aria-label="Ball"${hideIf(balls, filters.ball)}>${options(balls, filters.ball, 'All balls')}</select>
        <select id="fOil" aria-label="Oil pattern"${hideIf(oils, filters.oil)}>${options(oils, filters.oil, 'All oil patterns')}</select>
        <select id="fKind" aria-label="League or other bowling"${hideIf(kinds, filters.kind)}>
          <option value="">All bowling</option>
          <option value="league"${filters.kind === 'league' ? ' selected' : ''}>League nights</option>
          <option value="other"${filters.kind === 'other' ? ' selected' : ''}>Other bowling</option>
        </select>
        ${filtered ? '<button type="button" class="link" id="clearFilters">Clear filters</button>' : ''}
      </div>

      ${st.games.length === 0 ? `
        <div class="empty">
          <p>No finished games yet${filtered ? ' for these filters' : ''}.</p>
          <a class="btn primary" href="#/new">Start bowling</a>
        </div>` : `
      <div class="subtabs" role="tablist" aria-label="Stats sections">
        ${TABS.map(([key, label]) => `<button type="button" role="tab" class="subtab" data-subtab="${key}" aria-selected="${tab === key}" aria-controls="statsPanel">${label}</button>`).join('')}
      </div>
      <div id="statsPanel" role="tabpanel">${view.body(ctx)}</div>`}
    </div>`;

  if (st.games.length) view.after?.(root, ctx, () => render(root));
  // The tab strip scrolls sideways on narrow phones; keep the open tab in sight.
  const strip = root.querySelector('.subtabs');
  const openTab = strip?.querySelector('[aria-selected="true"]');
  if (openTab) strip.scrollLeft = Math.max(0, openTab.offsetLeft - (strip.clientWidth - openTab.offsetWidth) / 2);
  if (scrollToCard) {
    // After the router has put the new screen at the top.
    const card = root.querySelector(scrollToCard);
    scrollToCard = null;
    if (card) setTimeout(() => card.scrollIntoView({ block: 'start' }), 0);
  }

  root.querySelectorAll('[data-subtab]').forEach((btn) => {
    btn.onclick = () => {
      tab = btn.dataset.subtab;
      render(root);
      root.querySelector(`[data-subtab="${tab}"]`).focus();
    };
  });

  const clear = root.querySelector('#clearFilters');
  if (clear) {
    clear.onclick = () => {
      Object.assign(filters, NO_FILTERS);
      render(root);
    };
  }
  root.querySelector('#fDays').onchange = (e) => { filters.days = Number(e.target.value); render(root); };
  root.querySelector('#fCenter').onchange = (e) => { filters.center = e.target.value; render(root); };
  root.querySelector('#fBall').onchange = (e) => { filters.ball = e.target.value; render(root); };
  root.querySelector('#fOil').onchange = (e) => { filters.oil = e.target.value; render(root); };
  root.querySelector('#fKind').onchange = (e) => { filters.kind = e.target.value; render(root); };
  // Links that open another tab (Overview's line about missed spares).
  root.querySelectorAll('[data-goto]').forEach((el) => {
    el.onclick = () => {
      tab = el.dataset.goto;
      render(root);
      window.scrollTo({ top: 0 });
    };
  });
}
