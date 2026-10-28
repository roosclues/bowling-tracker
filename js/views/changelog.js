// "What's new": the history of published updates, newest first.

import { db, save } from '../storage.js';
import { CHANGELOG } from '../changelog.js';
import { APP_VERSION, versionDate } from '../version.js';
import { topbar } from '../ui.js';
import { esc } from '../util.js';

export function render(root) {
  // Seeing this page counts as having read the notes for the installed version.
  if (db.settings.seenVersion !== APP_VERSION) {
    db.settings.seenVersion = APP_VERSION;
    save();
  }

  root.innerHTML = `
    ${topbar({ back: '#/settings', title: "What's new", sub: `You have ${esc(APP_VERSION)}` })}
    <div class="page">
      <ol class="changelog">
        ${CHANGELOG.map((r) => {
          const current = r.version === APP_VERSION;
          return `
            <li class="release${current ? ' current' : ''}">
              <div class="rel-head">
                <h3>${esc(r.title)}</h3>
                ${current ? '<span class="pill">Installed</span>' : ''}
              </div>
              <div class="rel-meta">${r.version === 'next' ? 'Not published yet' : `${esc(r.version)} · ${versionDate(r.version)}`}</div>
              <ul>${r.items.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>
            </li>`;
        }).join('')}
      </ol>
    </div>`;
}
