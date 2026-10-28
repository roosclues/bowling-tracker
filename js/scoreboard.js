// Classic 10-frame scoreboard. Shot boxes carry data-f / data-s so screens can make them tappable.

import { marks, scoreGame, isFreshRack, isSplit } from './scoring.js';

export function scoreboardHTML(frames, { current = null, selected = null } = {}) {
  const { cumulative } = scoreGame(frames);
  const cells = frames.map((shots, f) => {
    const m = marks(shots);
    const boxes = f === 9 ? 3 : 2;
    let html = '';
    for (let s = 0; s < boxes; s++) {
      // Frames 1-9: a strike shows in the second box, like a real scoresheet.
      let shotIndex = s;
      if (f < 9 && m[0] === 'X') shotIndex = s === 1 ? 0 : -1;
      const has = shotIndex >= 0 && shotIndex < shots.length;
      const split = has && isFreshRack(shots, shotIndex) && isSplit(shots[shotIndex].standing);
      const isSel = has && selected && selected.frame === f && selected.shot === shotIndex;
      html += has
        ? `<button type="button" class="box${split ? ' split' : ''}${isSel ? ' sel' : ''}" data-f="${f}" data-s="${shotIndex}">${m[shotIndex]}</button>`
        : `<span class="box"></span>`;
    }
    const isCur = current && current.frame === f;
    return `<div class="frame${f === 9 ? ' tenth' : ''}${isCur ? ' cur' : ''}">
      <div class="fnum">${f + 1}</div>
      <div class="boxes">${html}</div>
      <div class="ftotal">${cumulative[f] ?? ''}</div>
    </div>`;
  });
  return `<div class="scoreboard">${cells.join('')}</div>`;
}
