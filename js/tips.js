// Coaching tips from your stats, shown on Stats, the session screen and game summaries.

import { computeStats, strikeLine } from './stats.js';
import { SPEED_UNITS, pct, plural, toSpeedUnit } from './util.js';
import { TAG, carryNote } from './terms.js';
import { spareAim } from './spares.js';

// The best-ranked line with at least `min` first balls, or null.
export function bestCombo(stats, min) {
  return stats.combos.find((c) => c.n >= min) ?? null;
}

// Coaching hints from the data. Returns a list of { title, text, basis, topic, link? }:
// basis says how much data the hint stands on, topic is 'spares' or 'line' (which Stats tab
// it belongs on), and link is an optional screen to act on it. Pass `sessions` to also
// compare bowling centers. `speedUnit` is 'kph' or 'mph'.
export function tips(stats, hand, sessions = null, speedUnit = 'kph', aimOf = null) {
  const out = [];
  const handSide = hand === 'L' ? 'left' : 'right';
  const otherSide = hand === 'L' ? 'right' : 'left';
  const h = stats.hits;
  const light = h.light ?? 0;
  const high = (h.high ?? 0) + (h.brooklyn ?? 0);
  const pocket = h.pocket ?? 0;
  const n = light + high + pocket;
  // Name real boards: start from the feet position used most on first balls.
  const line = strikeLine(stats);
  const feet = line?.feet ?? 20;
  const move = (d) => `board ${feet} → ${Math.min(39, Math.max(1, feet + d))}`;
  const hitBasis = `From ${plural(n, 'first ball')} with a pin hit recorded.`;

  if (n >= 3) {
    if (light / n >= 0.5) {
      out.push({ topic: 'line', title: 'Mostly light hits', text: `Keep the same arrow and move your feet 2 boards ${handSide}, toward your bowling-hand side (${move(-2)}).`, basis: hitBasis });
    } else if (high / n >= 0.5) {
      out.push({ topic: 'line', title: 'Mostly high hits', text: `Keep the same arrow and move your feet 2 boards ${otherSide}, away from your bowling-hand side (${move(2)}).`, basis: hitBasis });
    } else if (pocket / n >= 0.5) {
      out.push({ topic: 'line', title: 'Pocket hits!', text: 'Your line is working. Keep the same feet and arrow, and focus on repeating your release.', basis: hitBasis });
    }
  }

  // Pocket hits that don't carry, mostly leaving the same pins.
  const { carry } = stats;
  const notCarried = carry.pocket - carry.strikes;
  const topLeave = carry.leaves[0];
  const carryFix = topLeave && carryNote(topLeave.pins, hand);
  if (carry.pocket >= 10 && carry.strikes / carry.pocket < 0.6 && topLeave.n / notCarried >= 0.4 && carryFix?.fix) {
    out.push({
      topic: 'line',
      title: `Pocket hits leaving the ${topLeave.pins.join('-')}`,
      text: `You left the ${topLeave.pins.join('-')} on ${topLeave.n} of ${carry.pocket} pocket hits. ${carryFix.text}`,
      basis: `From ${plural(carry.pocket, 'pocket hit')}.`,
    });
  }

  // The leave you miss most (not splits: those are hard for everyone).
  const missed = stats.leaves.filter((l) => !l.split && l.chances >= 4 && l.made / l.chances < 0.5)
    .sort((a, b) => a.made / a.chances - b.made / b.chances || b.chances - a.chances)[0];
  if (missed) {
    const name = missed.standing.join('-');
    const aim = aimOf?.(missed.standing) ?? spareAim(missed.standing, line, hand);
    out.push({
      topic: 'spares',
      title: `The ${name} keeps getting away`,
      text: `You picked it up ${missed.made} of ${missed.chances} times. Try feet on board ${aim.feet} and the board ${aim.target} arrow (${aim.learned ? 'your spare aim, adjusted to your tries' : 'the 3-6-9 system'}), and work on it in Spare practice.`,
      basis: `From ${plural(missed.chances, 'try', 'tries')} at this leave.`,
      link: { href: `#/practice/${name}`, label: `Practice the ${name}` },
    });
  } else if (stats.singleChances >= 4 && stats.singleMade / stats.singleChances < 0.6) {
    out.push({
      topic: 'spares',
      title: 'Single-pin spares',
      text: 'Single pins are the easiest spares to improve. Throw them straight, walk toward your target, and cross the lane: for pins on your hand side, stand on the far side of the approach.',
      basis: `From ${plural(stats.singleChances, 'single-pin spare')}.`,
    });
  }

  if (stats.firstBalls >= 20 && stats.splits / stats.firstBalls >= 0.12) {
    out.push({
      topic: 'line',
      title: 'A lot of splits',
      text: `${pct(stats.splits, stats.firstBalls)}% of your first balls leave a split. Splits mostly come from high hits: try moving your feet 1–2 boards ${otherSide}, or adding a touch of speed so the ball hooks later.`,
      basis: `From ${plural(stats.firstBalls, 'first ball')}.`,
    });
  }

  const missTags = stats.accuracy.arrowMiss;
  if (missTags >= 3 && missTags > stats.accuracy.arrowHit) {
    out.push({
      topic: 'line',
      title: 'Watch the arrow',
      text: 'You often missed your arrow. Keep your eyes on the arrow (not the pins) until the ball rolls over it.',
      basis: `From ${plural(missTags + stats.accuracy.arrowHit, 'first ball')} tagged with how you hit your arrow.`,
    });
  }

  if (stats.speedCount >= 8 && stats.speedSD >= 1) {
    out.push({
      topic: 'line',
      title: 'Steady your speed',
      text: `Your speed changes by about ±${toSpeedUnit(stats.speedSD, speedUnit).toFixed(1)} ${SPEED_UNITS[speedUnit]} from ball to ball, which changes how much the ball hooks. Use the same steps and the same push-away every time.`,
      basis: `From ${plural(stats.speedCount, 'ball')} with a speed recorded.`,
    });
  }

  const baseRate = stats.firstBalls ? stats.strikes / stats.firstBalls : 0;
  for (const f of stats.feel) {
    if (f.firstN < 4 || ![TAG.rushed, TAG.late].includes(f.tag)) continue;
    if (baseRate - f.strikes / f.firstN < 0.15) continue;
    const rushed = f.tag === TAG.rushed;
    out.push({
      topic: 'line',
      title: rushed ? 'Rushing costs you' : 'Late releases cost you',
      text: `When you tagged "${f.tag}" you struck ${pct(f.strikes, f.firstN)}% of the time, against ${pct(stats.strikes, stats.firstBalls)}% overall. ${rushed ? 'Take a breath and set up the same way before every ball.' : 'Let the ball go as your sliding foot stops, not after.'}`,
      basis: `From ${plural(f.firstN, 'first ball')} tagged "${f.tag}".`,
    });
  }

  const [g1, , g3] = stats.byGame;
  if (g1?.no === 1 && g3?.no === 3 && g1.games >= 3 && g3.games >= 3 && g1.average - g3.average >= 12) {
    out.push({
      topic: 'line',
      title: 'Scores drop later in a session',
      text: `Game 1 averages ${Math.round(g1.average)}, game 3 averages ${Math.round(g3.average)}. As the oil wears off the ball hooks sooner. When you start hitting high, move your feet 2 boards and your arrow 1 board away from your bowling-hand side.`,
      basis: `From ${g1.games} first games and ${g3.games} third games.`,
    });
  }

  if (sessions) {
    const overall = bestCombo(stats, 5);
    const centers = [...new Set(sessions.map((s) => s.center).filter(Boolean))];
    for (const center of centers.length > 1 ? centers : []) {
      const here = bestCombo(computeStats(sessions.filter((s) => s.center === center)), 5);
      if (!overall || !here || (here.feet === overall.feet && here.target === overall.target)) continue;
      out.push({
        topic: 'line',
        title: `A different line at ${center}`,
        text: `There, feet ${here.feet} + arrow ${here.target} strikes ${pct(here.strikes, here.n)}% of the time. Your best line overall is feet ${overall.feet} + arrow ${overall.target}. Start with the one that works at the center you're at.`,
        basis: `From ${plural(here.n, 'first ball')} on that line at ${center}.`,
      });
    }
  }
  return out;
}
