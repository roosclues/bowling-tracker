// Settings: handedness, speed unit, what to log, theme, backup/restore, CSV export, storage info.

import {
  db, save, downloadBackup, restoreBackup, canUndoRestore, undoRestore, exportCSV, canShareFiles, wipeAll, requestPersist,
} from '../storage.js';
import { infoButton, logLabel } from '../terms.js';
import { topbar, icon, logChips } from '../ui.js';
import { APP_VERSION, versionDate } from '../version.js';
import { fmtDate, toast, go, plural, SPEED_UNITS, esc } from '../util.js';
import { leagueStanding, LEAGUE_MIN_GAMES, LEAGUE_ESTABLISH } from '../stats.js';

const LEAGUE_PCTS = [80, 90, 100];

// "Your book average: 168 (12 league games) · handicap 46 a game".
function leagueNow() {
  const st = leagueStanding(db.sessions, db.settings.league);
  if (st.average == null) return `Your handicap starts after ${LEAGUE_MIN_GAMES} league games <span class="nowrap">(${st.games} so far).</span>`;
  return `Your book average: <strong>${st.average}</strong> (${st.typed ? 'from your league sheet' : plural(st.games, 'league game')}) · handicap <strong>${st.handicap}</strong> a game`;
}

function leagueCard() {
  const L = db.settings.league;
  const pcts = LEAGUE_PCTS.includes(L.pct) ? LEAGUE_PCTS : [...LEAGUE_PCTS, L.pct].sort((a, b) => a - b);
  return `
      <section class="card" id="leagueCard">
        <div class="card-h"><h3>League</h3>${infoButton('handicap')}</div>
        <label class="switch-row">
          <span><span class="sw-label">I bowl in a league</span><span class="hint">Adds a League night switch when you start a session, and works out your league average and handicap.</span></span>
          <input type="checkbox" class="switch" id="leagueOn"${L.on ? ' checked' : ''}>
        </label>
        ${L.on ? `
        <p class="meta" id="leagueNow" aria-live="polite">${leagueNow()}</p>
        <div class="field">
          <label for="leaguePct">Handicap</label>
          <div class="league-rule">
            <select id="leaguePct" aria-label="Handicap percentage">${pcts.map((v) => `<option value="${v}"${v === L.pct ? ' selected' : ''}>${v}%</option>`).join('')}</select>
            <span>of</span>
            <input id="leagueBase" type="number" inputmode="numeric" min="150" max="300" value="${L.base}" aria-label="Handicap base score">
          </div>
          <p class="hint">Handicap = (base − your average) × that percentage, rounded down. Your league sheet says which numbers your league uses.</p>
        </div>
        <details class="table-view" id="leagueMore"${L.seasonStart || L.average != null ? ' open' : ''}>
          <summary>Season start, sheet average (optional)</summary>
          <div class="field">
            <label for="leagueSeason">Season started</label>
            <input id="leagueSeason" type="date" value="${esc(L.seasonStart ?? '')}">
            <p class="hint">Only league nights from this date count. Leave it empty to count them all.</p>
          </div>
          <div class="field">
            <label for="leagueAvg">Average from your league sheet ${infoButton('bookAverage')}</label>
            <input id="leagueAvg" type="number" inputmode="numeric" min="0" max="300" placeholder="Worked out from your league games" value="${L.average ?? ''}">
            <p class="hint">Used until you've logged ${LEAGUE_ESTABLISH} league games this season. After that the app uses your own games.</p>
          </div>
        </details>` : ''}
      </section>`;
}

// Ask the service worker to look for a newer version now. If one exists it downloads in the
// background, and app.js shows "App updated" once it's ready.
async function checkForUpdate(btn) {
  const reg = await navigator.serviceWorker?.getRegistration();
  if (!reg) {
    toast('Updates are checked automatically once the app is installed.');
    return;
  }
  if (!navigator.onLine) {
    toast("You're offline. Connect to the internet to check for updates.");
    return;
  }
  btn.disabled = true;
  try {
    await reg.update();
    toast(reg.installing || reg.waiting
      ? 'A new version is downloading…'
      : `You're on the latest version (${APP_VERSION}).`);
  } catch {
    toast("Couldn't check for updates right now. Try again later.");
  } finally {
    btn.disabled = false;
  }
}

export function render(root) {
  const share = canShareFiles('text/plain', 'x.txt');
  const shareCSV = canShareFiles('text/csv', 'x.csv');
  const gameCount = db.sessions.reduce((n, s) => n + s.games.length, 0);

  const toggle = (key, label, hint) => `
    <label class="switch-row">
      <span><span class="sw-label">${label}</span><span class="hint">${hint}</span></span>
      <input type="checkbox" class="switch" data-setting="${key}"${db.settings[key] !== false ? ' checked' : ''}>
    </label>`;

  root.innerHTML = `
    ${topbar({ title: 'Settings' })}
    <div class="page">
      <section class="card">
        <h3>Bowling hand</h3>
        <p class="hint">Boards are counted from your bowling-hand side, so this flips the lane picture.</p>
        <div class="seg full">
          <button type="button" class="chip${db.settings.hand === 'R' ? ' on' : ''}" data-hand="R">Right-handed</button>
          <button type="button" class="chip${db.settings.hand === 'L' ? ' on' : ''}" data-hand="L">Left-handed</button>
        </div>
      </section>

      <section class="card">
        <h3>Ball speed</h3>
        <p class="hint">Pick the unit your lane screen shows. Speeds you already logged are converted.</p>
        <div class="seg full">
          ${[['kph', 'km/h'], ['mph', 'mph']].map(([key, label]) =>
            `<button type="button" class="chip${db.settings.speedUnit === key ? ' on' : ''}" data-speed-unit="${key}">${label}</button>`).join('')}
        </div>
      </section>

      <section class="card" id="logCard">
        <div class="card-h"><h3>What to log</h3>${infoButton('log')}</div>
        <p class="hint">What the game screen asks for on each ball. Anything you skip can be filled in from the game summary.</p>
        <div class="seg full">${logChips(db.settings.log)}</div>
      </section>

      ${leagueCard()}

      <section class="card">
        <h3>Theme</h3>
        <p class="hint">Midnight lanes has a dark top bar, a wood lane and an alley-style scoreboard. Minimal uses plain colors, a clean font, and shows numbers in simple rows. Both follow your phone's light or dark mode.</p>
        <div class="seg full">
          ${[['classic', 'Midnight lanes'], ['minimal', 'Minimal']].map(([key, label]) =>
            `<button type="button" class="chip${db.settings.skin === key ? ' on' : ''}" data-skin="${key}">${label}</button>`).join('')}
        </div>
      </section>

      <section class="card">
        <h3>At the lanes</h3>
        ${toggle('keepAwake', 'Keep screen on while bowling', 'Stops the phone from sleeping between shots.')}
        ${toggle('haptics', 'Vibrate on taps', 'A small buzz when you tap pins or save a ball.')}
      </section>

      <section class="card">
        <h3>Backup</h3>
        <p class="hint">Your data is stored only on this phone, in the browser. Clearing browser data or uninstalling the browser deletes it, so save a backup now and then (Google Drive is a good place).
        ${db.settings.lastBackup ? `<br>Last backup: ${fmtDate(db.settings.lastBackup)}.` : '<br>No backup yet.'}</p>
        ${share ? `<button class="btn primary block" data-act="shareBackup">${icon('share', 20)} Save backup to Drive / email…</button>` : ''}
        <button class="btn ${share ? '' : 'primary '}block" data-act="backup">${icon('download', 20)} Download backup file</button>
        <label class="btn block file-btn">${icon('upload', 20)} Restore from backup file…
          <input type="file" id="restore" accept="application/json,.json,text/plain,.txt" hidden>
        </label>
        ${canUndoRestore() ? `<button class="btn block" data-act="undoRestore">${icon('undo', 20)} Undo last restore</button>` : ''}
      </section>

      <section class="card">
        <h3>Export</h3>
        <p class="hint">A spreadsheet (CSV) with one row per ball, plus your spare practice tries. Opens in Excel or Google Sheets.</p>
        <button class="btn block" data-act="csv">${icon('table', 20)} Export CSV${shareCSV ? '…' : ''}</button>
      </section>

      <section class="card">
        <h3>Storage</h3>
        <p class="hint" id="storageInfo">${plural(db.sessions.length, 'session')} · ${plural(gameCount, 'game')} · ${plural(db.practice.length, 'practice try', 'practice tries')}</p>
        <button class="btn danger block" data-act="wipe">${icon('trash', 20)} Delete all data</button>
      </section>

      <section class="card">
        <h3>About</h3>
        <div class="about-row"><span>Version</span><strong id="appVersion">${APP_VERSION}</strong></div>
        <p class="hint">Published ${versionDate()}. New versions download by themselves when you open the app with internet, and are used from the next time you open it.</p>
        <a class="btn block" href="#/changelog">${icon('list', 20)} What's new · update history</a>
        <button class="btn block" data-act="checkUpdate">${icon('refresh', 20)} Check for updates</button>
      </section>

      <p class="meta center">Bowling Tracker · works offline · <a href="#/help">Help</a></p>
    </div>`;

  (async () => {
    const info = root.querySelector('#storageInfo');
    const persisted = await navigator.storage?.persisted?.();
    if (info && persisted !== undefined) {
      info.textContent += persisted ? ' · protected from automatic cleanup' : ' · not yet protected from automatic cleanup';
    }
  })();

  root.onclick = async (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    if (btn.dataset.skin) {
      db.settings.skin = btn.dataset.skin;
      save();
      go('#/settings'); // re-route so the new theme applies everywhere
      return;
    }
    if (btn.dataset.hand) {
      db.settings.hand = btn.dataset.hand;
      save();
      render(root);
      toast(btn.dataset.hand === 'L' ? 'Left-handed lane view' : 'Right-handed lane view');
      return;
    }
    if (btn.dataset.speedUnit) {
      db.settings.speedUnit = btn.dataset.speedUnit;
      save();
      render(root);
      toast(`Ball speed in ${SPEED_UNITS[btn.dataset.speedUnit]}`);
      return;
    }
    if (btn.dataset.log) {
      db.settings.log = btn.dataset.log;
      save();
      render(root);
      toast(`What to log: ${logLabel(btn.dataset.log)}`);
      return;
    }
    switch (btn.dataset.act) {
      case 'shareBackup':
        if (await downloadBackup({ share: true })) {
          requestPersist();
          toast('Backup saved');
          render(root);
        } else {
          toast('Backup not saved');
        }
        break;
      case 'backup':
        await downloadBackup();
        requestPersist();
        toast('Backup saved to Downloads');
        render(root);
        break;
      case 'undoRestore':
        if (!confirm('Go back to the data you had before the last restore?')) return;
        undoRestore();
        toast('Restore undone');
        go('#/');
        break;
      case 'csv':
        await exportCSV({ share: shareCSV });
        break;
      case 'checkUpdate':
        await checkForUpdate(btn);
        break;
      case 'wipe':
        if (!confirm('Delete ALL sessions, games, spare practice and goals from this phone? Make a backup first if you might want them back.')) return;
        if (!confirm('Are you sure? This cannot be undone.')) return;
        wipeAll();
        toast('All data deleted');
        go('#/');
        break;
    }
  };

  root.querySelector('#restore').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      if (!confirm('Replace everything on this phone with the backup file? (You can undo this afterwards.)')) return;
      const n = restoreBackup(text);
      toast(`Backup restored: ${n} session${n === 1 ? '' : 's'}`);
      go('#/');
    } catch (err) {
      alert('Could not restore: ' + err.message);
    } finally {
      e.target.value = '';
    }
  });

  // League: the switch shows or hides the rest of the card; the other boxes save as you type.
  const L = db.settings.league;
  root.querySelector('#leagueOn').addEventListener('change', (e) => {
    L.on = e.target.checked;
    save();
    render(root);
    toast(L.on ? 'League tools on' : 'League tools off');
  });
  const leagueInput = (sel, apply) => root.querySelector(sel)?.addEventListener('input', (e) => {
    apply(e.target.value);
    save();
    root.querySelector('#leagueNow').innerHTML = leagueNow();
  });
  const whole = (v, min, max) => {
    const n = Number(v);
    return v !== '' && Number.isInteger(n) && n >= min && n <= max ? n : null;
  };
  leagueInput('#leaguePct', (v) => { L.pct = Number(v); });
  leagueInput('#leagueBase', (v) => { L.base = whole(v, 150, 300) ?? L.base; });
  leagueInput('#leagueSeason', (v) => { L.seasonStart = v || null; });
  leagueInput('#leagueAvg', (v) => { L.average = whole(v, 0, 300); });
  // Leaving a box with a number that wasn't saved puts the saved one back, so what you see is used.
  const snapBack = (sel, value) => root.querySelector(sel)?.addEventListener('change', (e) => { e.target.value = value() ?? ''; });
  snapBack('#leagueBase', () => L.base);
  snapBack('#leagueAvg', () => L.average);

  root.querySelectorAll('[data-setting]').forEach((input) => {
    input.addEventListener('change', () => {
      db.settings[input.dataset.setting] = input.checked;
      save();
    });
  });
}
