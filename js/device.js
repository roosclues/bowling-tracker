// Phone niceties for use at the lanes: keep the screen on, haptic taps, strike/spare flash.

import { db } from './storage.js';

let lock = null;
let wanted = false;

// Keep the screen awake while a game is open (Screen Wake Lock API, Chrome on Android).
export async function keepAwake(on) {
  wanted = on && db.settings.keepAwake !== false;
  if (!wanted) {
    if (lock) {
      const l = lock;
      lock = null;
      l.release().catch(() => {});
    }
    return;
  }
  if (lock || !('wakeLock' in navigator) || document.visibilityState !== 'visible') return;
  try {
    const l = await navigator.wakeLock.request('screen');
    // The person may have left the game screen while the request was pending.
    if (!wanted || lock) {
      l.release().catch(() => {});
      return;
    }
    lock = l;
    lock.addEventListener('release', () => { if (lock === l) lock = null; });
  } catch {
    lock = null;
  }
}

// The browser drops the lock whenever the app is hidden; take it back on return.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && wanted) keepAwake(true);
});

export function buzz(ms = 8) {
  if (db.settings.haptics === false) return;
  try { navigator.vibrate?.(ms); } catch { /* not supported */ }
}

let flashTimer;
export function celebrate(kind) {
  const el = document.getElementById('flash');
  if (!el) return;
  el.textContent = kind === 'strike' ? 'STRIKE!' : 'SPARE!';
  el.className = `show ${kind}`;
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => { el.className = ''; }, 950);
}
