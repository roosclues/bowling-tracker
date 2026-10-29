// Goals: pick targets for a few stats and see how your last games measure up.

import { db, save } from '../storage.js';
import { GOAL_TYPES, GOAL_WINDOW, GOAL_MIN_GAMES, goalStatus, goalText, recentStats } from '../stats.js';
import { topbar } from '../ui.js';
import { fmtShortDate } from '../util.js';

// One row per goal with a progress bar (decorative: the text says the same). Also used on Home.
export function goalListHTML(status) {
  return `<ul class="goals">${status.map((s) => `
    <li class="${s.met ? 'met' : ''}" data-goal-row="${s.type.key}">
      <div class="goal-top">
        <span>${goalText(s.goal)}</span>
        <strong><span class="sr-only">now </span>${s.value == null ? '–' : s.type.fmt(s.value)}</strong>
      </div>
      <div class="goal-bar" aria-hidden="true"><i style="width:${Math.round(s.progress * 100)}%"></i></div>
      ${s.met ? `<small class="goal-note">Reached${s.goal.reachedOn ? ` · first on ${fmtShortDate(s.goal.reachedOn)}` : ''}</small>` : ''}
    </li>`).join('')}</ul>`;
}

// A first target one step better than where you are now.
function suggest(type, now) {
  if (now == null) return type.start;
  const v = type.up
    ? Math.ceil((now + type.step) / type.step) * type.step
    : Math.floor((now - type.step) / type.step) * type.step;
  return Math.min(type.max, Math.max(0, v));
}

export function render(root) {
  const st = recentStats(db.sessions);
  const enough = st.games.length >= GOAL_MIN_GAMES;
  const goals = db.settings.goals;

  root.innerHTML = `
    ${topbar({ back: '#/', title: 'Goals' })}
    <div class="page">
      <p class="hint">Each goal is measured over your last ${GOAL_WINDOW} finished games, so it follows your current form.
        ${enough ? '' : `You need at least ${GOAL_MIN_GAMES} finished games to see where you stand (you have ${st.games.length}).`}
        One or two goals at a time works best.</p>
      ${goals.length ? `
      <section class="card" id="goalStatus">
        <div class="card-h"><h3>Your goals</h3><small>last ${GOAL_WINDOW} games</small></div>
        ${goalListHTML(goalStatus(db.sessions, goals))}
      </section>` : ''}
      <section class="card">
        <div class="card-h"><h3>Choose goals</h3><small>type a target to turn one on</small></div>
        ${GOAL_TYPES.map((t) => {
          const g = goals.find((x) => x.key === t.key);
          const raw = enough ? t.get(st) : null;
          const now = raw == null ? null : t.round(raw);
          return `
          <div class="switch-row goal-edit">
            <label class="goal-label" for="goal-${t.key}">
              <span class="sw-label">${t.label}</span>
              <span class="hint" id="goal-${t.key}-hint">Now ${now == null ? '–' : t.fmt(now)} · goal: ${t.up ? 'at least' : 'at most'}</span>
            </label>
            <input type="number" class="goal-target" inputmode="decimal" data-target="${t.key}" min="0" max="${t.max}" step="${t.step}"
              value="${g ? g.target : suggest(t, now)}" aria-label="${t.label} target" aria-describedby="goal-${t.key}-hint">
            <input type="checkbox" class="switch" id="goal-${t.key}" data-goal="${t.key}"${g ? ' checked' : ''}>
          </div>`;
        }).join('')}
      </section>
    </div>`;

  const targetOf = (key) => {
    const type = GOAL_TYPES.find((t) => t.key === key);
    const v = parseFloat(root.querySelector(`[data-target="${key}"]`).value);
    return Number.isFinite(v) ? Math.min(type.max, Math.max(0, v)) : type.start;
  };
  const addGoal = (key) => {
    db.settings.goals = [...goals, { key, target: targetOf(key), reachedOn: null, reachedGame: null }];
  };

  root.querySelectorAll('[data-goal]').forEach((sw) => {
    sw.addEventListener('change', () => {
      const key = sw.dataset.goal;
      if (sw.checked) addGoal(key);
      else db.settings.goals = goals.filter((g) => g.key !== key);
      save();
      render(root);
    });
  });
  root.querySelectorAll('[data-target]').forEach((input) => {
    input.addEventListener('change', () => {
      const key = input.dataset.target;
      const g = goals.find((x) => x.key === key);
      const target = targetOf(key);
      if (!g) addGoal(key);
      else if (g.target === target) return;
      // A new target is a new thing to reach.
      else Object.assign(g, { target, reachedOn: null, reachedGame: null });
      save();
      render(root);
    });
  });
}
