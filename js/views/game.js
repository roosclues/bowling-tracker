// Game entry: record each ball. What to log (db.settings.log) picks what's asked: pins only,
// pins + feet & arrow (the default), or everything (breakpoint, pin hit, speed, how it felt).
// Pins only hides the line and doesn't pre-fill it, so new balls are saved with pins only.
// Spare balls get a suggested line from the 3-6-9 system, adjusted by your own tries; a missed
// spare can say which way it went. A line carried over from the last ball shows as one row,
// with buttons to move feet or arrow a board, until you tap Change.
// After the game, the summary opens balls here to add details (#/edit/…), one at a time or
// stepping through every ball without feet or arrow (#/review/…). The pins are locked then,
// so the score can't change.

import { db, save, findSession, findGame, refreshScore, stampReachedGoals, unstampGoals } from '../storage.js';
import { nextShot, pinsBefore, isFreshRack, scoreGame, frameDone } from '../scoring.js';
import { strikeLineFor, spareAimFor } from '../stats.js';
import { mountLane } from '../lane.js';
import { mountPins } from '../pins.js';
import { scoreboardHTML } from '../scoreboard.js';
import { HITS, TAG, TAGS, infoButton, logLabel } from '../terms.js';
import { topbar, icon, aimHTML, logChips } from '../ui.js';
import { buzz, celebrate } from '../device.js';
import { esc, toast, go, plural, tapGuard, toSpeedUnit, fromSpeedUnit, SPEED_UNITS } from '../util.js';

const HINT_GAMES = 3; // finished games before the how-to hints are hidden

let draft = null;     // shot being entered, keyed to game + position
let editing = null;   // { gid, frame, shot } when changing an earlier ball
let moreOpen = false; // remember whether "More details" is expanded
let undone = [];      // balls taken back with Undo, newest last: { key, shot }
let reviewing = false; // stepping through the balls without a line, after the game
const once = tapGuard(); // ignore a second Save/Undo tap that lands right after the first

const hasLine = (shot) => shot.feet != null && shot.target != null;

// Balls in `game` without feet or arrow, in order, starting at position `from`.
export function ballsWithoutLine(game, from = { frame: 0, shot: 0 }) {
  const out = [];
  game.frames.forEach((shots, frame) => shots.forEach((shot, s) => {
    if (hasLine(shot) || frame < from.frame || (frame === from.frame && s < from.shot)) return;
    out.push({ frame, shot: s });
  }));
  return out;
}

// The nearest earlier ball of the same kind (first ball or spare ball) in this game that has
// a line. Filling in a game afterwards starts each ball from it, since most balls repeat it.
function earlierLine(game, frame, shot, fresh) {
  for (let f = frame; f >= 0; f--) {
    const shots = game.frames[f];
    for (let s = (f === frame ? shot : shots.length) - 1; s >= 0; s--) {
      if (isFreshRack(shots, s) === fresh && hasLine(shots[s])) return { shot: shots[s], frame: f, index: s };
    }
  }
  return null;
}

// Most recent ball of the same kind with a line recorded, to pre-fill feet and arrow.
// First balls copy the last first ball; spare balls prefer the last spare at the same leave,
// and with `exact` take only that.
function lastLine(fresh, leave, exact = false) {
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
          if (!exact) fallback ??= shot;
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

// `restored` marks a ball that was already saved once (taken back with Undo, or being
// edited): its details are kept even when What to log doesn't show them.
function draftFrom(shot, key, restored = false) {
  return {
    key,
    restored,
    standing: new Set(shot?.standing ?? []),
    feet: shot?.feet ?? null,
    target: shot?.target ?? null,
    breakpoint: shot?.breakpoint ?? null,
    hit: shot?.hit ?? null,
    speed: shot?.speed ?? null,
    tags: [...(shot?.tags ?? [])],
    note: shot?.note ?? '',
    lineOpen: false, // a carried-over line shows as one row until Change opens the lane
  };
}

// A new ball starts with your last feet and arrow, except with Pins only, where nothing is
// shown so nothing should be saved that you didn't see. A spare ball at a leave you haven't
// logged before starts on the spare aim from your strike line, rather than the line of a
// different spare; with no strike line yet, it falls back to your last spare ball.
function newDraft(key, fresh, available) {
  if (db.settings.log === 'pins') return draftFrom(null, key);
  const leave = available.join('-');
  let carry = lastLine(fresh, leave, true);
  if (!carry && !fresh) {
    carry = (strikeLineFor(db.sessions) && spareAimFor(available, db.sessions, db.practice, db.settings.hand)) || lastLine(fresh, leave);
  }
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

// A stored mph speed as the speed box shows it, in the unit picked in Settings.
function speedValue(mph) {
  return mph == null ? '' : String(+toSpeedUnit(mph, db.settings.speedUnit).toFixed(1));
}

function moreHTML(d, fresh) {
  const unit = db.settings.speedUnit;
  const hits = fresh ? `
    <div class="field">
      <label>Pin hit ${infoButton('hit')}</label>
      <div class="seg wrap">
        ${HITS.map((h) => `<button type="button" class="chip${d.hit === h.key ? ' on' : ''}" data-hit="${h.key}" aria-pressed="${d.hit === h.key}">${h.label}</button>`).join('')}
      </div>
      <p class="hint" id="hitDesc">${d.hit ? HITS.find((h) => h.key === d.hit).desc : 'Where the ball hit the pins.'}</p>
    </div>` : '';
  return `
    ${hits}
    <div class="field">
      <label for="speed">Ball speed (${SPEED_UNITS[unit]}) ${infoButton('speed')}</label>
      <input id="speed" type="number" inputmode="decimal" step="0.1" min="0" max="${unit === 'mph' ? 40 : 64}" placeholder="e.g. ${unit === 'mph' ? '15.2' : '24.5'}" value="${speedValue(d.speed)}">
    </div>
    <div class="field">
      <label>How it felt</label>
      <div class="seg wrap">
        ${TAGS.map((t) => `<button type="button" class="chip${d.tags.includes(t) ? ' on' : ''}" data-tag="${esc(t)}" aria-pressed="${d.tags.includes(t)}">${esc(t)}</button>`).join('')}
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
  reviewing = false;
  draw(root, sid, gid);
}

// From the summary: change the details of one ball.
export function renderEdit(root, sid, gid, frame, shot) {
  const exists = !!findGame(sid, gid)?.frames[frame]?.[shot];
  editing = exists ? { gid, frame: Number(frame), shot: Number(shot) } : null;
  reviewing = false;
  draft = null;
  draw(root, sid, gid);
}

// From the summary: step through every ball without feet or arrow.
export function renderReview(root, sid, gid) {
  const game = findGame(sid, gid);
  const [first] = game ? ballsWithoutLine(game) : [];
  if (!first) {
    toast('Every ball already has its feet and arrow.');
    go(`#/summary/${sid}/${gid}`, { replace: true });
    return;
  }
  editing = { gid, ...first };
  reviewing = true;
  draft = null;
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
    if (editing) {
      draft = draftFrom(shots[target.shot], key, true);
      const prev = reviewing && !hasLine(shots[target.shot]) ? earlierLine(game, target.frame, target.shot, fresh) : null;
      if (prev) {
        draft.feet ??= prev.shot.feet;
        draft.target ??= prev.shot.target;
        draft.copiedFrom = prev;
      }
    } else if (top?.key === key) draft = draftFrom(top.shot, key, true);
    else {
      undone = [];
      draft = newDraft(key, fresh, available);
    }
  }
  const d = draft;
  // The game is over and a ball is being filled in from the summary.
  const finished = !pos;
  const left = reviewing ? ballsWithoutLine(game, target).length : 0;
  const summaryHash = `#/summary/${sid}/${gid}`;
  // Editing always shows every detail, so an earlier ball's details can always be fixed.
  const level = editing ? 'all' : db.settings.log;
  const pinsOnly = level === 'pins';
  const hand = db.settings.hand;
  // A new ball with its line already filled in shows it as one row; Change opens the lane.
  const compact = !pinsOnly && !editing && !d.lineOpen && hasLine(d);
  const last = pinsOnly || editing ? null : lastLine(fresh, available.join('-'));
  const aim = fresh || editing ? null : spareAimFor(available, db.sessions, db.practice, hand);
  // Under the line row: "On your spare aim" while the line is on it, or the aim with Use when
  // it isn't. Both take one line, so a nudge never moves the buttons under your finger.
  const aimRow = () => (d.feet === aim.feet && d.target === aim.target
    ? `<p class="aim" id="aim">${icon('target', 18)}<span>On your spare aim</span>${infoButton('spareAim')}</p>`
    : aimHTML(aim, { use: true }));
  // On a spare you're missing, which way it went (optional): the spare aim learns from it.
  // Only with your feet logged, since the aim needs to know where you stood.
  const missRow = !fresh && !pinsOnly && !editing;
  // Feet or arrow one board left or right. Boards count from the hand side, as on the lane.
  const nudge = (k, name) => `
    <span class="nudge">${name}
      <button type="button" class="step" data-nudge="${k}" data-d="${hand === 'L' ? -1 : 1}" aria-label="${name} left">${icon('chevL', 18)}</button>
      <b id="${k}Val">${d[k]}</b>
      <button type="button" class="step" data-nudge="${k}" data-d="${hand === 'L' ? 1 : -1}" aria-label="${name} right">${icon('chevR', 18)}</button>
    </span>`;
  const gameNo = session.games.indexOf(game) + 1;
  const { total } = scoreGame(game.frames);
  // How-to hints show for your first few games, then make room for the pins and lane.
  const isNew = db.sessions.reduce((n, s) => n + s.games.filter((g) => g.done).length, 0) < HINT_GAMES;

  root.innerHTML = `
    ${topbar({
      back: finished ? summaryHash : `#/session/${sid}`,
      title: `Game ${gameNo}`,
      sub: `${esc(session.center || 'Bowling')}${session.lane ? ` · Lane ${esc(session.lane)}` : ''}`,
      right: `<a class="tb-action coach-link" href="#/coach" aria-label="Coach">${icon('coach', 20)}</a><div class="bigscore" aria-label="Score"><span>Score</span>${total}</div>`,
    })}
    <div class="page game">
      <div class="sb-wrap">${scoreboardHTML(game.frames, { current: pos, selected: editing })}</div>

      <div class="shot-head">
        <h2>${editing ? 'Editing · ' : ''}Frame ${target.frame + 1} · Ball ${target.shot + 1}</h2>
        <span class="pill">${fresh ? 'Full rack' : `${plural(available.length, 'pin')} to pick up`}</span>
      </div>
      ${reviewing ? `
        <p class="hint review-info" id="reviewInfo">Adding details after the game · ${plural(left, 'ball')} without feet or arrow left${d.copiedFrom
          ? `. Feet and arrow copied from frame ${d.copiedFrom.frame + 1}, ball ${d.copiedFrom.index + 1}: change them if this ball was different.`
          : '.'}</p>` : ''}
      ${session.notes ? `<p class="focus" id="focus">${icon('flag', 16)}<span>Working on: ${esc(session.notes)}</span></p>` : ''}
      ${pinsOnly && aim ? aimHTML(aim) : ''}

      <section class="card">
        <div class="card-h">
          <h3>Pins left standing</h3>
          ${finished ? '' : '<button type="button" class="link" data-act="allup">All still up</button>'}
        </div>
        <div id="pins"></div>
        ${missRow ? `
        <div class="miss-row" id="missRow"${d.standing.size ? '' : ' hidden'}>
          <span>Missed?</span>
          <div class="seg">${[[TAG.missedLeft, `${icon('chevL', 18)} Left`], [TAG.missedRight, `Right ${icon('chevR', 18)}`]].map(([t, label]) =>
            `<button type="button" class="chip${d.tags.includes(t) ? ' on' : ''}" data-tag="${esc(t)}" aria-pressed="${d.tags.includes(t)}" aria-label="${esc(t)}">${label}</button>`).join('')}</div>
        </div>` : ''}
        ${finished || editing || isNew ? `<p class="hint center">${finished
          ? 'Pins are locked once the game is over, so the score stays the same. To fix pins, use Undo last ball on the summary.'
          : editing
            ? 'Fix the pins if needed. To change a strike, spare or the number of balls, use Undo.'
            : 'Tap the pins still standing. Nothing tapped = all knocked down.'}</p>` : ''}
      </section>

      ${pinsOnly ? '' : `
      <section class="card" id="lineCard">
        <div class="card-h"><h3>Your line</h3>${compact
          ? '<button type="button" class="link" data-act="line">Change</button>'
          : last
          ? '<button type="button" class="link" data-act="repeat">Same as last ball</button>'
          : '<small>Tap or slide on the lane</small>'}</div>
        ${compact ? `
          <div class="line-row" id="lineRow">${nudge('feet', 'Feet')}${nudge('target', 'Arrow')}${level === 'all' && d.breakpoint != null
            ? `<span class="nudge">Breakpoint <b>${d.breakpoint}</b></span>` : ''}</div>
          ${aim ? aimRow() : ''}`
          : `${aim ? aimHTML(aim, { use: true }) : ''}<div id="lane"></div>`}
      </section>`}
      ${level === 'all' ? `
      <details class="card more" id="more" ${moreOpen ? 'open' : ''}>
        <summary>More details <small>optional</small></summary>
        <div id="moreBody">${moreHTML(d, fresh)}</div>
      </details>` : ''}
      ${editing ? '' : `
      <div class="field log-level" id="logLevel">
        <label>What to log ${infoButton('log')}</label>
        <div class="seg full">${logChips(level)}</div>
      </div>`}

    </div>
    <div class="actionbar">
      ${reviewing
        ? `<button type="button" class="btn" data-act="skip">Skip</button>
           <button type="button" class="btn primary" data-act="saveNext">${left > 1 ? 'Save · next ball' : 'Save · done'}</button>`
        : editing
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
    else saveBtn.textContent = `Save · ${plural(down, 'pin')}`;
  }

  const syncTags = () => root.querySelectorAll('[data-tag]').forEach((b) => {
    b.classList.toggle('on', d.tags.includes(b.dataset.tag));
    b.setAttribute('aria-pressed', String(d.tags.includes(b.dataset.tag)));
  });
  // The Missed row shows once a pin stays up; a spare made after all drops the direction.
  const missEl = root.querySelector('#missRow');
  function pinsChanged() {
    updateSaveLabel();
    if (!missEl) return;
    missEl.hidden = d.standing.size === 0;
    if (missEl.hidden && d.tags.some((t) => t === TAG.missedLeft || t === TAG.missedRight)) {
      d.tags = d.tags.filter((t) => t !== TAG.missedLeft && t !== TAG.missedRight);
      syncTags();
    }
  }

  const pins = mountPins(root.querySelector('#pins'), {
    available,
    standing: d.standing,
    readOnly: finished,
    onChange: pinsChanged,
  });
  const lane = pinsOnly || compact ? null : mountLane(root.querySelector('#lane'), { hand, value: d, breakpoint: level === 'all' });
  updateSaveLabel();

  if (level === 'all') {
    root.querySelector('#more').addEventListener('toggle', (e) => { moreOpen = e.target.open; });
    root.querySelector('#speed').addEventListener('input', (e) => {
      const v = parseFloat(e.target.value);
      d.speed = Number.isFinite(v) ? fromSpeedUnit(v, db.settings.speedUnit) : null;
    });
    root.querySelector('#note').addEventListener('input', (e) => { d.note = e.target.value; });
  }

  // Back to the summary when filling in a finished game; replacing this screen in the history
  // so the phone's Back button doesn't return to it.
  const toSummary = (message) => {
    editing = null;
    reviewing = false;
    draft = null;
    if (message) toast(message);
    go(summaryHash, { replace: true });
  };
  // Review: on to the next ball without feet or arrow, or back to the summary after the last.
  const nextBall = () => {
    const [next] = ballsWithoutLine(game, { frame: target.frame, shot: target.shot + 1 });
    if (!next) {
      const still = ballsWithoutLine(game).length;
      toSummary(still ? `Done. ${plural(still, 'ball')} you skipped still ${still === 1 ? 'has' : 'have'} no feet or arrow.` : 'Done. Every ball has its feet and arrow now.');
      return;
    }
    editing = { gid, ...next };
    draft = null;
    draw(root, sid, gid);
    window.scrollTo({ top: 0 });
  };

  root.onclick = (e) => {
    if (finished && e.target.closest('.tb-back')) {
      e.preventDefault();
      toSummary();
      return;
    }
    const el = e.target.closest('button');
    if (!el) return;

    if (el.dataset.hit) {
      d.hit = d.hit === el.dataset.hit ? null : el.dataset.hit;
      root.querySelectorAll('[data-hit]').forEach((b) => {
        b.classList.toggle('on', b.dataset.hit === d.hit);
        b.setAttribute('aria-pressed', String(b.dataset.hit === d.hit));
      });
      root.querySelector('#hitDesc').textContent = d.hit ? HITS.find((h) => h.key === d.hit).desc : 'Where the ball hit the pins.';
      return;
    }
    if (el.dataset.tag) {
      const t = el.dataset.tag;
      // A ball can't miss both ways. The same tag can show twice (Missed row and More details).
      const other = { [TAG.missedLeft]: TAG.missedRight, [TAG.missedRight]: TAG.missedLeft }[t];
      d.tags = d.tags.includes(t) ? d.tags.filter((x) => x !== t) : [...d.tags.filter((x) => x !== other), t];
      syncTags();
      return;
    }
    if (el.dataset.nudge) {
      const k = el.dataset.nudge;
      d[k] = Math.min(39, Math.max(1, d[k] + Number(el.dataset.d)));
      root.querySelector(`#${k}Val`).textContent = d[k];
      if (aim) root.querySelector('#aim').outerHTML = aimRow();
      buzz();
      return;
    }
    if (el.dataset.log) {
      if (el.dataset.log === db.settings.log) return;
      db.settings.log = el.dataset.log;
      save();
      // A new ball starts over with or without the carried-over line; the pins stay.
      if (!d.restored) {
        const standing = d.standing;
        draft = newDraft(d.key, fresh, available);
        draft.standing = standing;
      }
      draw(root, sid, gid);
      toast(`What to log: ${logLabel(db.settings.log)}`);
      return;
    }
    if (el.dataset.f !== undefined) {
      editing = { gid, frame: Number(el.dataset.f), shot: Number(el.dataset.s) };
      draw(root, sid, gid);
      window.scrollTo({ top: 0 });
      return;
    }

    const act = el.dataset.act;
    if (['save', 'undo', 'saveEdit', 'saveNext'].includes(act) && !once()) return;

    switch (act) {
      case 'aim':
        d.feet = aim.feet;
        d.target = aim.target;
        if (lane) lane.refresh();
        else draw(root, sid, gid);
        break;
      case 'line':
        d.lineOpen = true;
        draw(root, sid, gid);
        break;
      case 'repeat':
        // Copy what the last ball of this kind recorded; keep anything it left blank. The
        // breakpoint and speed only when they're on screen, so nothing unseen is saved.
        d.feet = last.feet;
        d.target = last.target;
        if (level === 'all') {
          if (last.breakpoint != null) d.breakpoint = last.breakpoint;
          if (last.speed != null) {
            d.speed = last.speed;
            root.querySelector('#speed').value = speedValue(last.speed);
          }
        }
        lane.refresh();
        break;
      case 'allup':
        available.forEach((p) => d.standing.add(p));
        pins.refresh();
        pinsChanged();
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
          stampReachedGoals(session, game);
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
      case 'saveEdit':
      case 'saveNext': {
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
        if (act === 'saveNext') {
          nextBall();
          return;
        }
        if (finished) {
          toSummary('Saved');
          return;
        }
        editing = null;
        draft = null;
        toast('Saved');
        draw(root, sid, gid);
        break;
      }
      case 'skip':
        nextBall();
        break;
      case 'cancel':
        if (finished) {
          toSummary();
          return;
        }
        editing = null;
        draft = null;
        draw(root, sid, gid);
        break;
    }
  };
}

// Used by the summary screen's Undo: reopen a finished game at its last ball. Goals it
// reached are taken back until it's finished again.
export function reopenLastBall(game) {
  for (let f = 9; f >= 0; f--) {
    if (game.frames[f].length) {
      const removed = game.frames[f].pop();
      game.done = false;
      unstampGoals(game);
      refreshScore(game);
      save();
      undone = [{ key: `${game.id}:${f}:${game.frames[f].length}:new`, shot: removed }];
      draft = null;
      return;
    }
  }
}
