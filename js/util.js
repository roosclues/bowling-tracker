// Small shared helpers for views.

export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function todayISO() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function fmtDate(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
  });
}

// 'Oct 29', plus the year when it isn't this year.
export function fmtShortDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    month: 'short', day: 'numeric', ...(y === new Date().getFullYear() ? {} : { year: 'numeric' }),
  });
}

// { day: '28', month: 'Oct', weekday: 'Tue' } for date badges.
export function dateParts(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return {
    day: String(d),
    month: date.toLocaleDateString(undefined, { month: 'short' }),
    weekday: date.toLocaleDateString(undefined, { weekday: 'short' }),
  };
}

export function pct(num, den) {
  return den ? Math.round((num / den) * 100) : null;
}

export function fmtPct(num, den) {
  const p = pct(num, den);
  return p === null ? '–' : `${p}%`;
}

export function avg(values) {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
}

// "1 game", "3 games". Pass the plural for irregular words: plural(n, 'try', 'tries').
export function plural(n, word, many = `${word}s`) {
  return `${n} ${n === 1 ? word : many}`;
}

// Returns a check that is false for a second tap landing right after the first, so a
// double tap on Save, Made or Undo only counts once.
export function tapGuard(ms = 350) {
  let until = 0;
  return () => {
    const now = performance.now();
    if (now < until) return false;
    until = now + ms;
    return true;
  };
}

// Shows a message that stays until it's dismissed with its × button (or replaced by a newer one).
export function toast(message) {
  const el = document.getElementById('toast');
  el.querySelector('.toast-msg').textContent = message;
  el.classList.add('show');
}

export function dismissToast() {
  document.getElementById('toast').classList.remove('show');
}

// Navigate. Use { replace: true } for redirects so the phone's Back button skips them
// instead of bouncing straight back into the redirect.
export function go(hash, { replace = false } = {}) {
  if (location.hash === hash) window.dispatchEvent(new HashChangeEvent('hashchange'));
  else if (replace) location.replace(hash);
  else location.hash = hash;
}
