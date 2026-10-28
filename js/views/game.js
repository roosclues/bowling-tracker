// Game entry: record each ball (pins left, feet, arrow, breakpoint, extras).

import { db, save, findSession, findGame, refreshScore } from '../storage.js';
import { nextShot, pinsBefore, isFreshRack, scoreGame, frameDone } from '../scoring.js';
import { mountLane } from '../lane.js';
import { mountPins } from '../pins.js';
import { scoreboardHTML } from '../scoreboard.js';
import { HITS, TAGS, infoButton } from '../terms.js';
import { topbar, icon } from '../ui.js';
import { buzz, celebrate } from '../device.js';
import { esc, toast, go } from '../util.js';

let draft = null;     // shot being entered, keyed to game + position
let editing = null;   // { gid, frame, shot } when changing an earlier ball
let moreOpen = false; // remember whether "More details" is expanded
let undone = [];      // balls taken back with Undo, newest last: { key, shot }
let busyUntil = 0;    // ignore a second Save/Undo tap that lands right after the first

const DOUBLE_TAP_MS = 350;

// Most recent ball of the same kind with a line recorded, to pre-fill feet and arrow.
// First balls copy the last first ball; spare balls prefer the last spare at the same leave.
function lastLine(fresh, leave) {
  let fallback = null;
  for (let si = db.sessions.length - 1; si >= 0; si--) {
    const games = db.sessions[si].games;
    for (let gi = games.length - 1; gi >= 0; gi--) {
      const frames = games[gi].frames;
      for (let f = 9; f >= 0; f--) {
        const shots = frames[f];
        for (let s = shots.length - 1; s >= 0; s--) {
          const shot = shots[s];
          if (isFreshRack(shots, s) !== fresh || (shot.feet == null && shot.target == null)) continue;
          if (fresh || pinsBefore(shots, s).join('-') === leave) return shot;
          fallback ??= shot;
        }
      }
    }
  }
  return fallback;
}

// An earlier ball's pins can change only if the frame keeps the same number of balls
// and every later ball in it is still possible.
function keepsFrameShape(f, before, after) {
  for (let j = 1; j < after.length; j++) {
    if (frameDone(f, after.slice(0, j))) return false;
    const allowed = new Set(pinsBefore(after, j));
    if (!after[j].standing.every((p) => allowed.has(p))) return false;
  }
  return frameDone(f, after) === frameDone(f, before);
}

function draftFrom(shot, key) {
  return {
    key,
    standing: new Set(shot?.standing ?? []),
    feet: shot?.feet ?? null,
    target: shot?.target ?? null,
    breakpoint: shot?.breakpoint ?? null,
    hit: shot?.hit ?? null,
    speed: shot?.speed ?? null,
    tags: [...(shot?.tags ?? [])],
    note: shot?.note ?? '',
  };
}

function newDraft(key, fresh, leave) {
  const carry = lastLine(fresh, leave);
  return draftFrom({ feet: carry?.feet, target: carry?.target }, key);
}

function shotFromDraft(d, fresh) {
  return {
    standing: [...d.standing].sort((a, b) => a - b),
    feet: d.feet,
    target: d.target,
    breakpoint: d.breakpoint,
    hit: fresh ? d.hit : null,
    speed: d.speed,
    tags: d.tags,
    note: d.note.trim(),
  };
}

function moreHTML(d, fresh) {
  const hits = fresh ? `
    <div class="field">
      <label>Pin hit ${infoButton('hit')}</label>
      <div class="seg wrap">
        ${HITS.map((h) => `<button type="button" class="chip${d.hit === h.key ? ' on' : ''}" data-hit="${h.key}">${h.label}</button>`).join('')}
      </div>
      <p class="hint" id="hitDesc">${d.hit ? HITS.find((h) => h.key === d.hit).desc : 'Where the ball hit the pins.'}</p>
    </div>` : '';
  return `
    ${hits}
    <div class="field">
      <label for="speed">Ball speed (mph) ${infoButton('speed')}</label>
      <input id="speed" type="number" inputmode="decimal" step="0.1" min="0" max="40" placeholder="e.g. 15.2" value="${d.speed ?? ''}">
    </div>
    <div class="field">
      <label>How it felt</label>
      <div class="seg wrap">
        ${TAGS.map((t) => `<button type="button" class="chip${d.tags.includes(t) ? ' on' : ''}" data-tag="${esc(t)}">${esc(t)}</button>`).join('')}
      </div>
    </div>
    <div class="field">
      <label for="note">Note</label>
      <input id="note" type="text" maxlength="200" placeholder="Anything to remember" value="${esc(d.note)}">
    </div>`;
}

// Entry from the router: always start in "enter next ball" mode.
export function render(root, sid, gid) {
  editing = null;
  draw(root, sid, gid);
}

function draw(root, sid, gid) {
  const session = findSession(sid);
  const game = findGame(sid, gid);
  if (!game) {
    root.innerHTML = `<div class="page"><p>Game not found.</p><a class="btn" href="#/">Home</a></div>`;
    return;
  }

  const pos = nextShot(game.frames);
  if (!pos && !editing) {
    go(`#/summary/${sid}/${gid}`, { replace: true });
    return;
  }

  const target = editing ?? pos;
  const shots = game.frames[target.frame];
  const available = pinsBefore(shots, target.shot);
  const fresh = isFreshRack(shots, target.shot);
  const key = `${gid}:${target.frame}:${target.shot}:${editing ? 'edit' : 'new'}`;
  if (!draft || draft.key !== key) {
    const top = undone[undone.length - 1];
    if (editing) draft = draftFrom(shots[target.shot], key);
    else if (top?.key === key) draft = draftFrom(top.shot, key);
    else {
      undone = [];
      draft = newDraft(key, fresh, available.join('-'));
    }
  }
  const d = draft;
  const gameNo = session.games.indexOf(game) + 1;
  const { total } = scoreGame(game.frames);

  root.innerHTML = `
    ${topbar({
      back: `#/session/${sid}`,
      title: `Game ${gameNo}`,
      sub: `${esc(session.center || 'Bowling')}${session.lane ? ` · Lane ${esc(session.lane)}` : ''}`,
      right: `<div class="bigscore" aria-label="Score"><span>Score</span>${total}</div>`,
    })}
    <div class="page game">
      <div class="sb-wrap">${scoreboardHTML(game.frames, { current: pos, selected: editing })}</div>
      <p class="hint center">Tap any ball on the scoreboard to edit its details.</p>

      <div class="shot-head">
        <h2>${editing ? 'Editing · ' : ''}Frame ${target.frame + 1} · Ball ${target.shot + 1}</h2>
        <span class="pill">${fresh ? 'Full rack' : `${available.length} pin${available.length === 1 ? '' : 's'} to pick up`}</span>
      </div>

      <section class="card">
        <div class="card-h">
          <h3>Pins left standing</h3>
          <button type="button" class="link" data-act="allup">All still up</button>
        </div>
        <div id="pins"></div>
        <p class="hint center">${editing
          ? 'Fix the pins if needed. To change a strike, spare or the number of balls, use Undo.'
          : 'Tap the pins still standing. Nothing tapped = all knocked down.'}</p>
      </section>

      <section class="card">
        <div class="card-h"><h3>Your line</h3><small>Tap or slide on the lane</small></div>
        <div id="lane"></div>
      </section>

      <details class="card more" id="more" ${moreOpen ? 'open' : ''}>
        <summary>More details <small>optional</small></summary>
        <div id="moreBody">${moreHTML(d, fresh)}</div>
      </details>
    </div>
    <div class="actionbar">
      ${editing
        ? `<button type="button" class="btn" data-act="cancel">Cancel</button>
           <button type="button" class="btn primary" data-act="saveEdit">Save changes</button>`
        : `<button type="button" class="btn" data-act="undo">${icon('undo', 20)} Undo</button>
           <button type="button" class="btn primary" data-act="save" id="saveBtn"></button>`}
    </div>`;

  const saveBtn = root.querySelector('#saveBtn');
  function updateSaveLabel() {
    if (!saveBtn) return;
    const down = available.length - d.standing.size;
    if (d.standing.size === 0) saveBtn.textContent = fresh ? 'Save · Strike! X' : 'Save · Spare! /';
    else if (down === 0) saveBtn.textContent = 'Save · 0 pins';
    else saveBtn.textContent = `Save · ${down} pin${down === 1 ? '' : 's'}`;
  }

  const pins = mountPins(root.querySelector('#pins'), {
    available,
    standing: d.standing,
    onChange: updateSaveLabel,
  });
  mountLane(root.querySelector('#lane'), { hand: db.settings.hand, value: d });
  updateSaveLabel();

  root.querySelector('#more').addEventListener('toggle', (e) => { moreOpen = e.target.open; });
  root.querySelector('#speed').addEventListener('input', (e) => {
    const v = parseFloat(e.target.value);
    d.speed = Number.isFinite(v) ? v : null;
  });
  root.querySelector('#note').addEventListener('input', (e) => { d.note = e.target.value; });

  root.onclick = (e) => {
    const el = e.target.closest('button');
    if (!el) return;

    if (el.dataset.hit) {
      d.hit = d.hit === el.dataset.hit ? null : el.dataset.hit;
      root.querySelectorAll('[data-hit]').forEach((b) => b.classList.toggle('on', b.dataset.hit === d.hit));
      root.querySelector('#hitDesc').textContent = d.hit ? HITS.find((h) => h.key === d.hit).desc : 'Where the ball hit the pins.';
      return;
    }
    if (el.dataset.tag) {
      const t = el.dataset.tag;
      d.tags = d.tags.includes(t) ? d.tags.filter((x) => x !== t) : [...d.tags, t];
      el.classList.toggle('on');
      return;
    }
    if (el.dataset.f !== undefined) {
      editing = { gid, frame: Number(el.dataset.f), shot: Number(el.dataset.s) };
      draw(root, sid, gid);
      window.scrollTo({ top: 0 });
      return;
    }

    const act = el.dataset.act;
    if (act === 'save' || act === 'undo' || act === 'saveEdit') {
      if (performance.now() < busyUntil) return;
      busyUntil = performance.now() + DOUBLE_TAP_MS;
    }

    switch (act) {
      case 'allup':
        available.forEach((p) => d.standing.add(p));
        pins.refresh();
        updateSaveLabel();
        break;
      case 'save': {
        game.frames[target.frame].push(shotFromDraft(d, fresh));
        refreshScore(game);
        if (undone[undone.length - 1]?.key === d.key) undone.pop();
        draft = null;
        if (d.standing.size === 0) {
          celebrate(fresh ? 'strike' : 'spare');
          buzz(fresh ? [20, 40, 20] : 18);
        } else {
          buzz(10);
        }
        if (!nextShot(game.frames)) {
          game.done = true;
          save();
          toast(`Game over: ${game.score}`);
          go(`#/summary/${sid}/${gid}`, { replace: true });
          return;
        }
        save();
        draw(root, sid, gid);
        window.scrollTo({ top: 0 });
        break;
      }
      case 'undo': {
        let f = target.frame;
        while (f >= 0 && game.frames[f].length === 0) f--;
        if (f < 0) {
          toast('Nothing to undo yet');
          return;
        }
        // Keep what was typed for the current ball, so undoing further back loses nothing.
        const top = undone[undone.length - 1];
        if (top?.key === d.key) top.shot = shotFromDraft(d, fresh);
        const removed = game.frames[f].pop();
        refreshScore(game);
        save();
        undone.push({ key: `${gid}:${f}:${game.frames[f].length}:new`, shot: removed });
        draft = null;
        toast(`Removed frame ${f + 1}, ball ${game.frames[f].length + 1}. Re-enter it below.`);
        draw(root, sid, gid);
        break;
      }
      case 'saveEdit': {
        const frame = game.frames[target.frame];
        const updated = shotFromDraft(d, fresh);
        const after = frame.map((s, i) => (i === target.shot ? updated : s));
        if (!keepsFrameShape(target.frame, frame, after)) {
          toast('That pin change would change the frame. Use Undo to re-enter those balls.');
          return;
        }
        frame[target.shot] = updated;
        refreshScore(game);
        save();
        editing = null;
        draft = null;
        toast('Saved');
        draw(root, sid, gid);
        break;
      }
      case 'cancel':
        editing = null;
        draft = null;
        draw(root, sid, gid);
        break;
    }
  };
}

// Used by the summary screen's Undo: reopen a finished game at its last ball.
export function reopenLastBall(game) {
  for (let f = 9; f >= 0; f--) {
    if (game.frames[f].length) {
      const removed = game.frames[f].pop();
      game.done = false;
      refreshScore(game);
      save();
      undone = [{ key: `${game.id}:${f}:${game.frames[f].length}:new`, shot: removed }];
      draft = null;
      return;
    }
  }
}
