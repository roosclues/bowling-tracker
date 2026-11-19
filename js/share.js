// "Share this game": a finished game drawn as a picture (score, scoreboard, strikes and spares)
// for the phone's share sheet, or downloaded where sharing files isn't supported.
// Always in the Midnight lanes colors, whatever the theme, so shared pictures look the same.

import { marks, scoreGame, isFreshRack, isSplit } from './scoring.js';
import { fmtDate, plural } from './util.js';

const W = 1080;
const H = 600;
const PAD = 48;
const BOARD = { top: 370, height: 190, marks: 50, totals: 110 }; // the scoreboard, and where its rows start
// Midnight lanes' fonts (--font in styles.css), so the picture looks the same in either theme.
const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
const C = {
  bg: '#0b1222', panel: '#141d33', line: 'rgba(255, 255, 255, 0.16)',
  ink: '#eef2f8', ink2: '#a8b1c5', accent: '#ffb020', split: '#ff8a8a',
};

function text(ctx, s, x, y, { size = 32, weight = 600, color = C.ink, align = 'left', spacing = 0, maxWidth = W - PAD * 2 } = {}) {
  ctx.font = `${weight} ${size}px ${FONT}`;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  if ('letterSpacing' in ctx) ctx.letterSpacing = `${spacing}px`;
  // A long center name is shortened with "…" rather than running off the picture.
  let t = s;
  while (t.length > 1 && ctx.measureText(t).width > maxWidth) t = t.slice(0, -2).trimEnd() + '…';
  ctx.fillText(t, x, y);
  if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
}

function line(ctx, x1, y1, x2, y2) {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

// The 10 frames like a scoresheet: the frame number, a box for each ball and the running total.
function scoreboard(ctx, frames) {
  const { top, height } = BOARD;
  const left = PAD;
  const right = W - PAD;
  const w = (right - left) / 10.5; // the 10th frame is one and a half frames wide
  const { cumulative } = scoreGame(frames);
  ctx.strokeStyle = C.line;
  ctx.lineWidth = 2;
  ctx.fillStyle = C.panel;
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(left, top, right - left, height, 16);
  else ctx.rect(left, top, right - left, height);
  ctx.fill();
  ctx.stroke();
  line(ctx, left, top + BOARD.marks, right, top + BOARD.marks);
  line(ctx, left, top + BOARD.totals, right, top + BOARD.totals);
  frames.forEach((shots, f) => {
    const x = left + f * w;
    const fw = f === 9 ? w * 1.5 : w;
    if (f) line(ctx, x, top, x, top + height);
    text(ctx, String(f + 1), x + fw / 2, top + 34, { size: 22, color: C.ink2, align: 'center' });
    const m = marks(shots);
    const boxes = f === 9 ? 3 : 2;
    for (let s = 0; s < boxes; s++) {
      const bx = x + s * (w / 2);
      if (s) line(ctx, bx, top + BOARD.marks, bx, top + BOARD.totals);
      // Frames 1-9: a strike shows in the second box, like a real scoresheet.
      let i = s;
      if (f < 9 && m[0] === 'X') i = s === 1 ? 0 : -1;
      if (i < 0 || i >= shots.length) continue;
      const cx = bx + w / 4;
      text(ctx, m[i], cx, top + 92, { size: 34, weight: 700, color: m[i] === 'X' || m[i] === '/' ? C.accent : C.ink, align: 'center' });
      if (isFreshRack(shots, i) && isSplit(shots[i].standing)) {
        // Splits get a circle, as on a paper scoresheet.
        ctx.save();
        ctx.strokeStyle = C.split;
        ctx.beginPath();
        ctx.arc(cx, top + 80, 19, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    }
    if (cumulative[f] != null) text(ctx, String(cumulative[f]), x + fw / 2, top + 162, { size: 36, weight: 700, align: 'center' });
  });
}

// The line under the score, from the game's stats (computeStats over that one game): only what
// applies, so a game without a spare chance doesn't say "0 of 0 spares".
export function gameSummaryLine(st, score) {
  if (score === 300) return 'Perfect game!';
  return [
    plural(st.strikes, 'strike'),
    st.spareChances && `${st.sparesMade} of ${st.spareChances} spares`,
    st.opens ? plural(st.opens, 'open frame') : 'clean game',
  ].filter(Boolean).join(' · ');
}

// The picture as a PNG blob. `summary` is the line under the score ("6 strikes · 3 of 4 spares");
// `handicap` adds "With handicap" on league nights.
export async function gamePicture(session, game, { gameNo = 1, summary = '', handicap = null } = {}) {
  await document.fonts?.ready;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = C.accent;
  ctx.fillRect(0, 0, W, 8);

  text(ctx, 'BOWLING TRACKER', PAD, 72, { size: 22, weight: 700, color: C.accent, spacing: 3, maxWidth: 420 });
  text(ctx, fmtDate(session.date), W - PAD, 72, { size: 26, color: C.ink2, align: 'right', maxWidth: 520 });
  text(ctx, [session.center, `Game ${gameNo}`].filter(Boolean).join(' · '), PAD, 124, { size: 34, weight: 650 });
  text(ctx, String(game.score), PAD - 6, 318, { size: 168, weight: 800, color: C.accent, maxWidth: 380 });
  text(ctx, summary, W - PAD, 228, { size: 28, color: C.ink2, align: 'right', maxWidth: 560 });
  if (handicap != null) text(ctx, `With handicap: ${game.score + handicap}`, W - PAD, 280, { size: 30, weight: 700, align: 'right', maxWidth: 560 });
  scoreboard(ctx, game.frames);

  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not draw the picture.'))), 'image/png'));
}

// Opens the share sheet with the picture; downloads it where sharing isn't supported.
// Returns false only when the share sheet was closed without sending.
export async function shareGame(session, game, opts = {}) {
  const blob = await gamePicture(session, game, opts);
  // Loaded here, so the line above can be tested without the app's saved data.
  const { deliver } = await import('./storage.js');
  return deliver(blob, `bowling-${session.date}-game-${opts.gameNo ?? 1}-${game.score}.png`, true);
}
