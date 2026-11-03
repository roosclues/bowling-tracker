// Lane notes: what you noticed about each lane at a center (Avoid / Good, problems, a few
// words), so next time you can ask the desk for another lane. Home, the session and the
// summary open it with showLanes(), passing the center, the lane you're on and where Back goes.

import { db, save, findSession } from '../storage.js';
import { notesAt, findNote, saveNote, deleteNote, noteSummary, laneKey } from '../lanenotes.js';
import { LANE_TAGS, infoButton } from '../terms.js';
import { topbar } from '../ui.js';
import { esc, go, toast } from '../util.js';

let view = { center: '', lane: '', sid: '', back: '#/' };
let form = null; // the note being written: { lane, verdict, tags, text }

export function showLanes({ center = '', lane = '', sid = '', back = '#/' } = {}) {
  view = { center, lane, sid, back };
  form = null;
  go('#/lanes');
}

// One line for the session and summary screens: the note on the session's lane, or a way to add one.
export function laneNoteRow(session) {
  const note = findNote(db.laneNotes, session.center, session.lane);
  return `
    <p class="lane-row" id="laneRow">${note
      ? `<span>Lane ${esc(note.lane)} · ${noteSummary(note)}</span><button type="button" class="link" data-act="lanenote">Edit</button>`
      : `<button type="button" class="link" data-act="lanenote">${session.lane ? `Add a note about lane ${esc(session.lane)}` : 'Add a lane note'}</button>`}</p>`;
}

// Centers you've bowled at or noted lanes at, most recent first.
function centers() {
  const seen = new Set();
  for (let i = db.sessions.length - 1; i >= 0; i--) if (db.sessions[i].center) seen.add(db.sessions[i].center);
  for (const n of db.laneNotes) if (n.center) seen.add(n.center);
  return [...seen];
}

const formFrom = (note, lane = '') => (note
  ? { lane: note.lane, verdict: note.verdict, tags: [...note.tags], text: note.text }
  : { lane, verdict: null, tags: [], text: '' });

const chip = (on, attrs, label) =>
  `<button type="button" class="chip${on ? ' on' : ''}" ${attrs} aria-pressed="${on}">${label}</button>`;

export function render(root) {
  const all = centers();
  const center = view.center || db.settings.last?.center || all[0] || '';
  view.center = center;
  form ??= formFrom(findNote(db.laneNotes, center, view.lane), view.lane);
  const notes = notesAt(db.laneNotes, center);
  const existing = findNote(db.laneNotes, center, form.lane);

  root.innerHTML = `
    ${topbar({ back: view.back, title: 'Lane notes', sub: esc(center) })}
    <div class="page">
      <p class="hint">Mark lanes to avoid, or that were good, so next time you can ask the desk for another lane. ${infoButton('laneNotes')}</p>
      ${all.length > 1 ? `
      <div class="field">
        <label for="laneCenter">Bowling center</label>
        <select id="laneCenter">${all.map((c) => `<option${c === center ? ' selected' : ''}>${esc(c)}</option>`).join('')}</select>
      </div>` : ''}

      ${notes.length ? `
      <section class="card" id="laneList">
        <div class="card-h"><h3>Your lanes here</h3><small>${notes.length} noted</small></div>
        <ul class="lane-notes">${notes.map((n) => `
          <li>
            <span class="ln-lane">Lane ${esc(n.lane)}</span>
            <span class="ln-sum">${noteSummary(n)}</span>
            <button type="button" class="link" data-edit="${n.id}" aria-label="Edit lane ${esc(n.lane)}">Edit</button>
          </li>`).join('')}</ul>
      </section>` : ''}

      <section class="card" id="laneForm">
        <div class="card-h"><h3>${existing ? `Lane ${esc(existing.lane)}` : 'Add a lane note'}</h3></div>
        ${center ? '' : `
        <div class="field">
          <label for="noteCenter">Bowling center</label>
          <input id="noteCenter" placeholder="e.g. Strike Zone Lanes">
        </div>`}
        <div class="field">
          <label for="noteLane">Lane number</label>
          <input id="noteLane" inputmode="numeric" maxlength="10" placeholder="e.g. 12" value="${esc(form.lane)}">
        </div>
        <div class="field">
          <label>How was it?</label>
          <div class="seg full" id="noteVerdict">
            ${chip(form.verdict === 'avoid', 'data-verdict="avoid"', 'Avoid')}
            ${chip(form.verdict === 'good', 'data-verdict="good"', 'Good')}
          </div>
        </div>
        <div class="field">
          <label>Problems</label>
          <div class="seg wrap" id="noteTags">${LANE_TAGS.map((t) => chip(form.tags.includes(t), `data-lane-tag="${esc(t)}"`, esc(t))).join('')}</div>
        </div>
        <div class="field">
          <label for="noteText">Note</label>
          <input id="noteText" type="text" maxlength="200" placeholder="e.g. Ball return jams" value="${esc(form.text)}">
        </div>
        <button type="button" class="btn primary block" data-act="save">Save lane note</button>
        ${existing ? '<button type="button" class="btn danger block" data-act="delete">Delete this note</button>' : ''}
      </section>
    </div>`;

  const laneInput = root.querySelector('#noteLane');
  laneInput.addEventListener('input', () => { form.lane = laneInput.value; });
  // Typing a lane that already has a note opens that note, unless you've started this one.
  laneInput.addEventListener('change', () => {
    const note = findNote(db.laneNotes, center, form.lane);
    if (note && note !== existing && !form.verdict && !form.tags.length && !form.text.trim()) {
      form = formFrom(note);
      render(root);
    }
  });
  root.querySelector('#noteText').addEventListener('input', (e) => { form.text = e.target.value; });
  root.querySelector('#laneCenter')?.addEventListener('change', (e) => {
    view.center = e.target.value;
    view.lane = '';
    form = null;
    render(root);
  });

  root.onclick = (e) => {
    const el = e.target.closest('button');
    if (!el) return;
    if (el.dataset.verdict) {
      form.verdict = form.verdict === el.dataset.verdict ? null : el.dataset.verdict;
      root.querySelectorAll('[data-verdict]').forEach((b) => {
        b.classList.toggle('on', b.dataset.verdict === form.verdict);
        b.setAttribute('aria-pressed', String(b.dataset.verdict === form.verdict));
      });
      return;
    }
    if (el.dataset.laneTag) {
      const t = el.dataset.laneTag;
      form.tags = form.tags.includes(t) ? form.tags.filter((x) => x !== t) : [...form.tags, t];
      el.classList.toggle('on');
      el.setAttribute('aria-pressed', String(form.tags.includes(t)));
      return;
    }
    if (el.dataset.edit) {
      form = formFrom(db.laneNotes.find((n) => n.id === el.dataset.edit));
      render(root);
      root.querySelector('#laneForm').scrollIntoView({ block: 'start' });
      return;
    }
    if (el.dataset.act === 'save') {
      const at = center || root.querySelector('#noteCenter')?.value.trim() || '';
      const lane = form.lane.trim();
      if (!at || !lane) {
        toast(at ? 'Type the lane number first' : 'Type the bowling center first');
        return;
      }
      if (!form.verdict && !form.tags.length && !form.text.trim()) {
        toast('Pick Avoid or Good, a problem, or write a note first');
        return;
      }
      saveNote(db.laneNotes, { center: at, lane, verdict: form.verdict, tags: form.tags, text: form.text });
      // A session started without a lane (one-tap "Bowl at …") now knows where you bowled.
      const s = view.sid && findSession(view.sid);
      if (s && !s.lane && laneKey(s.center, '') === laneKey(at, '')) s.lane = lane;
      save();
      toast(`Saved lane ${lane}`);
      view = { ...view, center: at, lane };
      form = null;
      render(root);
      return;
    }
    if (el.dataset.act === 'delete' && existing) {
      if (!confirm(`Delete your note about lane ${existing.lane}?`)) return;
      deleteNote(db.laneNotes, existing.id);
      save();
      toast(`Deleted the note about lane ${existing.lane}`);
      view.lane = '';
      form = null;
      render(root);
    }
  };
}
