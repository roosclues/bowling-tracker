// Coach: a chat with the built-in bowling coach. It speaks first with what fits the moment (a
// brief before you bowl, a read of the game you're in, a recap after the session), then
// answers the questions you tap. Works offline: everything comes from coach.js.

import { db, backupDue } from '../storage.js';
import { coachContext, brief, gameRead, recap, questions, answer } from '../coach.js';
import { topbar, tipsHTML, icon } from '../ui.js';
import { esc, todayISO } from '../util.js';

const TITLES = { before: 'Before you bowl', during: 'During your game', after: 'After your session' };

// The coach's opening message is worked out fresh on every visit, so mid-game it always reads
// the balls you've just bowled. Your questions and answers after it, [{ you } | { items }],
// belong to one moment (a game, or a day before or after bowling) and start over when the
// moment changes, so you can leave and come back without losing them.
let thread = [];
let threadFor = '';

function opening(ctx) {
  if (ctx.when === 'during') {
    const { summary, moves } = gameRead(ctx.game, ctx.session, db);
    return [summary, ...moves];
  }
  if (ctx.when === 'after') {
    const items = recap(db, ctx.session);
    if (backupDue()) {
      items.push({ title: 'Back up your games', text: 'Your games live only on this phone. Save a copy to Drive or email from Settings.', link: { href: '#/settings', label: 'Settings' } });
    }
    return items;
  }
  return brief(db, ctx.center);
}

const bubble = (m) => (m.you
  ? `<div class="bubble you">${esc(m.you)}</div>`
  : `<div class="bubble">${tipsHTML(m.items)}</div>`);

export function render(root) {
  const ctx = coachContext(db);
  const moment = `${ctx.when}|${ctx.game?.id ?? ctx.session?.id ?? ''}|${todayISO()}`;
  if (moment !== threadFor) {
    thread = [];
    threadFor = moment;
  }
  const gameHash = ctx.when === 'during' ? `#/game/${ctx.session.id}/${ctx.game.id}` : '';
  const qs = questions(db, ctx);

  root.innerHTML = `
    ${topbar({ back: gameHash, title: 'Coach', sub: TITLES[ctx.when] })}
    <div class="page coach">
      <div class="coach-chat" id="coachChat">${[{ items: opening(ctx) }, ...thread].map(bubble).join('')}</div>
      ${gameHash ? `<a class="btn primary block" id="backToGame" href="${gameHash}">${icon('ball')} Back to your game</a>` : ''}
      <h3 class="section">Ask your coach</h3>
      <div class="seg wrap coach-qs" id="coachQs">
        ${qs.map((q) => `<button type="button" class="chip" data-q="${esc(q.key)}">${esc(q.label)}</button>`).join('')}
      </div>
      ${thread.length > 1 ? '<p class="center"><button type="button" class="link" data-act="restart">Start over</button></p>' : ''}
    </div>`;

  root.onclick = (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    if (btn.dataset.q) {
      const q = qs.find((x) => x.key === btn.dataset.q);
      thread.push({ you: q.label }, { items: answer(q.key, db, ctx) });
      render(root);
      const asked = root.querySelectorAll('.bubble.you');
      asked[asked.length - 1].scrollIntoView({ block: 'start' });
    } else if (btn.dataset.act === 'restart') {
      threadFor = '';
      render(root);
      window.scrollTo({ top: 0 });
    }
  };
}
