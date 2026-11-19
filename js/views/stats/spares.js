// Stats → Spares: spare rates, what missed spares cost, tips, and each common leave with its
// aim and your practice results.

import { db } from '../../storage.js';
import { spareAimFor, practiceByLeave, sparePinsLost } from '../../stats.js';
import { miniPins } from '../../pins.js';
import { infoButton } from '../../terms.js';
import { tipsHTML, kvRow } from '../../ui.js';
import { fmtPct, fmtShortDate, pct } from '../../util.js';
import { tile, tileCount } from './parts.js';

function leavesCard(st, hand) {
  if (!st.leaves.length) {
    return `
      <section class="card">
        <div class="card-h"><h3>Most common leaves</h3></div>
        <p class="hint">No leaves yet. All strikes? 🎳</p>
      </section>`;
  }
  // Aims start from your usual strike line over all games and learn from your tries, like
  // the game screen and practice.
  const practice = practiceByLeave(db.practice);
  const outcome = (x) => {
    if (!x.next) return 'no 2nd ball yet';
    const result = x.next.standing.length ? `missed, left ${x.next.standing.join('-')}` : 'picked up';
    const used = [x.next.feet != null && `feet ${x.next.feet}`, x.next.target != null && `arrow ${x.next.target}`].filter(Boolean);
    return result + (used.length ? ` · ${used.join(', ')}` : '');
  };
  return `
    <section class="card" id="leaves">
      <div class="card-h"><h3>Most common leaves</h3><small>tap one for details</small></div>
      <ul class="leaves">${st.leaves.slice(0, 8).map((l) => {
        const name = l.standing.join('-');
        const aim = spareAimFor(l.standing, db.sessions, db.practice, hand);
        const p = practice.get(name);
        return `
        <li><details>
          <summary>
            ${miniPins(l.standing, 40)}
            <span class="leave-info">
              <span class="leave-name"><strong>${name}</strong>${l.split ? ' <span class="tag-split">split</span>' : ''}</span>
              <span class="sub">Left ${l.count}× (${pct(l.count, st.firstBalls)}% of 1st balls) · picked up ${l.made}/${l.chances}${p ? ` · practice ${p.made}/${p.n}` : ''}</span>
              <span class="sub">Aim: feet ${aim.feet}${aim.learned ? ` (3-6-9: ${aim.base})` : ''} · arrow ${aim.target}${l.worked ? ` · worked for you: feet ${l.worked.feet}, arrow ${l.worked.target} (${l.worked.made}/${l.worked.n})` : ''}</span>
            </span>
          </summary>
          <div class="leave-more">
            <ul class="leave-hist">${l.history.slice(-8).reverse().map((x) => `
              <li>${fmtShortDate(x.session.date)} · game ${x.gameNo}, frame ${x.frame + 1}: ${outcome(x)}</li>`).join('')}</ul>
            <a class="link" href="#/practice/${name}">Practice the ${name} →</a>
          </div>
        </details></li>`;
      }).join('')}</ul>
      <p class="hint">Aims use the 3-6-9 system from your usual strike line, moved a board or two by your own tries. ${infoButton('spareAim')}</p>
    </section>`;
}

function spareCostCard(lost) {
  if (!lost) return '';
  const all = Math.round(lost.all);
  return `
    <section class="card" id="spareCost">
      <div class="card-h"><h3>What missed spares cost</h3><small>pins a game</small></div>
      ${all === 0 ? '<p class="hint">You made every spare you had a chance at. Nothing lost!</p>' : `
      <ul class="kv">
        ${kvRow('Missed spares', all, { sub: 'if you\'d made every one' })}
        ${kvRow('Missed single pins', Math.round(lost.singles), { sub: 'the easiest ones to fix' })}
      </ul>
      <p class="hint">A missed spare costs the pins left standing and the bonus your next ball would have added.</p>`}
    </section>`;
}

export function body({ st, hints }) {
  const practiced = db.practice.length;
  const practiceMade = db.practice.filter((p) => p.made).length;
  return `
      <div class="tiles pairs" id="spareTiles">
        ${tile(fmtPct(st.sparesMade, st.spareChances), 'Spares made', tileCount(st.sparesMade, st.spareChances))}
        ${tile(fmtPct(st.singleMade, st.singleChances), '1-pin spares', tileCount(st.singleMade, st.singleChances))}
        ${tile(fmtPct(st.multiMade, st.multiChances), `Multi-pin spares ${infoButton('multiPin')}`, tileCount(st.multiMade, st.multiChances))}
        ${tile(fmtPct(st.splitMade, st.splitChances), `Splits made ${infoButton('split')}`, tileCount(st.splitMade, st.splitChances))}
      </div>
      ${spareCostCard(sparePinsLost(st))}
      ${tipsHTML(hints.filter((t) => t.topic === 'spares'))}
      ${leavesCard(st, db.settings.hand)}
      ${practiced ? `<p class="meta" id="practiceLine">Spare practice: ${practiceMade} of ${practiced} made (${fmtPct(practiceMade, practiced)})</p>` : ''}
      <a class="btn block" href="#/practice">Go to Spare practice</a>`;
}
