// The coach: what a bowling coach would tell you before you bowl, during a game and after a
// session, and answers to the questions you can tap. It all comes from your own games (via
// stats.js) plus plain-words technique written here. Pure functions, no DOM: the Coach screen
// (views/coach.js) shows what these return. A message is a list of tips()-shaped items:
// { title, text, basis?, link? }.

import {
  computeStats, recentStats, tips, strikeLine, spareAimFor, progress, goalStatus, goalText, speedBands, collectShots, bestCombo,
} from './stats.js';
import { frameDone } from './scoring.js';
import { MIRROR, DEFAULT_LINE } from './spares.js';
import { TAG, carryNote } from './terms.js';
import { notesAt } from './lanenotes.js';
import { pct, plural, todayISO, toSpeedUnit, SPEED_UNITS } from './util.js';

const board = (b) => Math.min(39, Math.max(1, b));
const sameCenter = (a, b) => (a ?? '').trim().toLowerCase() === (b ?? '').trim().toLowerCase();
// "right" for a right-hander's hand side, "left" for the side away from it.
const sides = (hand) => ({ hand: hand === 'L' ? 'left' : 'right', other: hand === 'L' ? 'right' : 'left' });
const leaveName = (pins) => (pins.length === 1 ? `the ${pins[0]} pin` : `the ${pins.join('-')}`);
const aimOf = (db) => (leave) => spareAimFor(leave, db.sessions, db.practice, db.settings.hand);
const ranked = (db, st, sessions = null) => tips(st, db.settings.hand, sessions, db.settings.speedUnit, aimOf(db));

// ---------- When are we? ----------

// 'during' while a game is open, 'after' once today's session has finished games, else 'before'.
export function coachContext(db, today = todayISO()) {
  for (let i = db.sessions.length - 1; i >= 0; i--) {
    const s = db.sessions[i];
    const game = s.games.find((g) => !g.done);
    if (game) return { when: 'during', session: s, game };
  }
  const last = db.sessions.at(-1);
  if (last?.date === today && last.games.some((g) => g.done)) return { when: 'after', session: last };
  return { when: 'before', center: db.settings.last?.center ?? '' };
}

// ---------- Reading the pins ----------

// What a first-ball leave says about how the ball hit, written for a right-hander (lefties
// leave the mirror-image pins). 'light': it reached the pins too far toward your hand side
// (went past the head pin on that side, or left the 2 pin behind). 'high': too far into the
// head pin (pins left on both sides, the 4 with the 6, 9 or 10). Pocket leaves (10, 7, 6-10,
// 5…) are about carry, not direction, so they and anything unusual give null.
const LEFT = [2, 4, 7, 8];
const RIGHT = [3, 6, 9, 10];
export function leaveRead(pins, hand) {
  if (!pins.length || pins.length === 10) return null;
  const p = hand === 'L' ? pins.map((x) => MIRROR[x]) : pins;
  const has = (x) => p.includes(x);
  const left = LEFT.some(has);
  const right = RIGHT.some(has);
  if (has(1)) return left && !right ? 'light' : right && !left ? 'high' : null;
  if (has(2) && !has(3)) return 'light'; // the 2, 2-8, 2-4-5, the 2-4-5-8 bucket
  if ((has(4) || has(7)) && (has(6) || has(9) || has(10))) return 'high'; // 4-6, 7-10, 4-9, 6-7-10
  return null;
}

// How a first ball hit: 'strike', 'pocket', 'light', 'high' or null. A recorded pin hit counts
// first, then a missed-arrow tag (a miss toward your hand side ends up light), then the leave.
export function ballRead(shot, hand) {
  if (!shot.standing.length) return 'strike';
  if (shot.hit === 'pocket') return 'pocket';
  if (shot.hit === 'light') return 'light';
  if (shot.hit === 'high' || shot.hit === 'brooklyn') return 'high';
  const tags = shot.tags ?? [];
  if (tags.includes(hand === 'L' ? TAG.missedLeft : TAG.missedRight)) return 'light';
  if (tags.includes(hand === 'L' ? TAG.missedRight : TAG.missedLeft)) return 'high';
  return leaveRead(shot.standing, hand);
}

// "(feet 20 → 18, keep arrow 10)", or '' without a line to start from.
function moveText(line, feet, arrow = 0) {
  if (!line) return '';
  const a = arrow ? `arrow ${line.target} → ${board(line.target + arrow)}` : `keep arrow ${line.target}`;
  return ` (feet ${line.feet} → ${board(line.feet + feet)}, ${a})`;
}

// ---------- During a game ----------

// What this game says so far: { summary, moves }. A move needs a pattern: 2 of your last 3
// first balls missing the same way, the last one included. One ball is not a pattern.
export function gameRead(game, session, db) {
  const hand = db.settings.hand;
  const side = sides(hand);
  const shots = collectShots([{ ...session, games: [game] }]);
  const first = shots.filter((x) => x.fresh);
  const reads = first.map((x) => ballRead(x.shot, hand));
  const strikes = reads.filter((r) => r === 'strike').length;
  const chances = shots.filter((x) => x.fresh && x.shot.standing.length && x.next);
  const made = chances.filter((x) => !x.next.standing.length).length;
  const frames = game.frames.filter((fs, f) => frameDone(f, fs)).length;
  const usual = recentStats(db.sessions, game);
  // Where you're standing now: the last first ball with a line, else your usual strike line.
  const line = [...first].reverse().map((x) => x.shot).find((s) => s.feet != null && s.target != null)
    ?? strikeLine(computeStats(db.sessions));

  const summary = first.length
    ? {
      title: `Through ${plural(frames, 'frame')}: ${game.score}`,
      text: [plural(strikes, 'strike'), chances.length && `spares ${made} of ${chances.length}`].filter(Boolean).join(', ')
        + `.${usual.average != null ? ` Your recent average is ${Math.round(usual.average)}.` : ''}`,
    }
    : {
      title: 'First ball coming up',
      text: line
        ? `Start on your line: feet ${line.feet}, arrow ${line.target}. Breathe, set up the same way every time, and watch the arrow until the ball rolls over it.`
        : startText(hand),
    };

  const moves = [];
  const recent = reads.slice(-3);
  const last = reads.at(-1);
  const count = (r) => recent.filter((x) => x === r).length;
  const basis = (what) => `From your last ${plural(recent.length, 'first ball')}: ${count(what)} ${what}.`;
  const goodEarly = reads.slice(0, -3).filter((r) => r === 'strike' || r === 'pocket').length;
  if (count('strike') >= 2 && last === 'strike') {
    moves.push({ title: 'Keep doing that', text: `Same feet, same arrow, same speed${line ? ` (feet ${line.feet}, arrow ${line.target})` : ''}. Don't change what's working.`, basis: basis('strike') });
  } else if (count('high') >= 2 && last === 'high' && goodEarly >= 2) {
    moves.push({
      title: 'The lane is changing',
      text: `You were striking, and now the ball hits high: the oil is wearing off, so it hooks sooner. Move your feet 2 boards and your arrow 1 board ${side.other}${moveText(line, 2, 1)}.`,
      basis: basis('high'),
    });
  } else if (count('light') >= 2 && last === 'light') {
    moves.push({
      title: 'Hitting light',
      text: `The ball is reaching the pins too far ${side.hand}. Keep your arrow and move your feet 2 boards ${side.hand}${moveText(line, -2)}. Move your feet the way you missed.`,
      basis: basis('light'),
    });
  } else if (count('high') >= 2 && last === 'high') {
    moves.push({
      title: 'Hitting high',
      text: `The ball is hooking into the head pin too much. Keep your arrow and move your feet 2 boards ${side.other}${moveText(line, 2)}. If it still hooks too soon, add a touch of speed: a faster ball skids longer before it hooks.`,
      basis: basis('high'),
    });
  }
  if (chances.length >= 2 && made / chances.length < 0.5) {
    moves.push({
      title: 'Spares are costing you',
      text: `You've made ${made} of ${chances.length}. Use the spare aim under your line, square your shoulders to the target, and throw spares straighter and a touch slower than your strike ball.`,
    });
  }
  return { summary, moves };
}

// What to change right now, or why not to.
export function nowAdvice(game, session, db) {
  const { moves } = gameRead(game, session, db);
  return moves.length ? moves : [{
    title: 'Nothing to change yet',
    text: 'Stay on your line until two of three first balls miss the same way. Then move your feet 2 boards the way you missed and keep your arrow.',
  }];
}

// ---------- Before and after ----------

function startText(hand) {
  const side = sides(hand);
  return `Stand with your sliding foot on the center dot (board ${DEFAULT_LINE.feet}) and roll the ball over the 2nd arrow (board ${DEFAULT_LINE.target}). `
    + `If it hits too far ${side.hand} of the head pin, move your feet 2 boards ${side.hand}; too far ${side.other}, 2 boards ${side.other}. `
    + `Keep the same arrow and keep moving until it rolls into the pocket, between the 1 and ${hand === 'L' ? 2 : 3} pins.`;
}

// Your best line at `center` and overall, with how often it strikes.
function lineItems(db, center) {
  const all = computeStats(db.sessions);
  const here = center ? bestCombo(computeStats(db.sessions.filter((s) => sameCenter(s.center, center))), 5) : null;
  const overall = bestCombo(all, 5);
  const describe = (c) => `Feet ${c.feet}, arrow ${c.target}: it strikes ${pct(c.strikes, c.n)}% of the time${c.breakpoint ? `, breaking around board ${c.breakpoint}` : ''}.`;
  const items = [];
  if (here) items.push({ title: `Your line at ${center}`, text: describe(here), basis: `From ${plural(here.n, 'first ball')} on that line there.` });
  if (overall && !(here && here.feet === overall.feet && here.target === overall.target)) {
    items.push({ title: here ? 'Your best line overall' : 'Your best line', text: describe(overall), basis: `From ${plural(overall.n, 'first ball')} on that line.` });
  }
  if (!items.length) {
    const usual = strikeLine(all);
    items.push(usual
      ? { title: 'Your usual line', text: `You play feet ${usual.feet}, arrow ${usual.target} most. Bowl 5 first balls on a line and I can tell you which one strikes best.` }
      : { title: 'Finding your line', text: startText(db.settings.hand) });
  }
  return items;
}

const WARM_UP = {
  title: 'Warm-up',
  text: 'Throw a few easy balls on your line before you score. Think about a smooth push-away and walking straight toward your target, not about the pins. Your first balls tell you where to start.',
};

// Before you bowl at `center`: where to start, one thing to work on, your goal, lanes to avoid.
export function brief(db, center) {
  const all = computeStats(db.sessions);
  if (!all.firstBalls) {
    return [
      { title: 'Welcome! Let\'s find your line', text: startText(db.settings.hand) },
      ARROWS,
      { title: 'Log every ball', text: 'Tap the pins left standing after each ball. After a few games I can tell you which line strikes most, why you leave the pins you leave, and what to work on.' },
    ];
  }
  const [start] = lineItems(db, center);
  const items = [{ ...start, title: `Where to start: ${start.title.toLowerCase()}` }];
  const [tip] = ranked(db, recentStats(db.sessions), db.sessions);
  if (tip) items.push({ ...tip, title: `Work on: ${tip.title}` });
  const goal = goalStatus(db.sessions, db.settings.goals).filter((s) => !s.met && s.value != null).sort((a, b) => b.progress - a.progress)[0];
  if (goal) items.push({ title: 'Your goal', text: `${goalText(goal.goal)}: you're at ${goal.type.fmt(goal.value)} over your last ${plural(goal.games, 'game')}.` });
  const avoid = center ? notesAt(db.laneNotes, center).filter((n) => n.verdict === 'avoid').map((n) => n.lane) : [];
  if (avoid.length) {
    items.push({ title: 'Lanes to avoid', text: `Your lane notes say to avoid ${avoid.length === 1 ? 'lane' : 'lanes'} ${avoid.join(', ')} here. Ask for another lane at the desk.`, link: { href: '#/lanes', label: 'Lane notes' } });
  }
  items.push(WARM_UP);
  return items;
}

// After today's session: how it compared with your usual, what went well, what to work on.
export function recap(db, session) {
  const today = computeStats([session]);
  const others = db.sessions.filter((s) => s !== session);
  const usual = recentStats(others);
  const avgToday = Math.round(today.average);
  const usualAvg = usual.average == null ? null : Math.round(usual.average);
  const rate = (a, b) => pct(a, b) ?? 0;
  const strikeDiff = usual.firstBalls ? rate(today.strikes, today.firstBalls) - rate(usual.strikes, usual.firstBalls) : 0;
  const spareDiff = usual.spareChances && today.spareChances ? rate(today.sparesMade, today.spareChances) - rate(usual.sparesMade, usual.spareChances) : 0;

  const facts = [
    `Strikes ${rate(today.strikes, today.firstBalls)}%${usual.firstBalls ? ` (usually ${rate(usual.strikes, usual.firstBalls)}%)` : ''}`,
    today.spareChances && `spares ${today.sparesMade} of ${today.spareChances}${usual.spareChances ? ` (usually ${rate(usual.sparesMade, usual.spareChances)}%)` : ''}`,
  ].filter(Boolean).join(', ');
  const items = [{
    title: usualAvg == null ? 'Today' : avgToday >= usualAvg + 5 ? 'A good day' : avgToday <= usualAvg - 5 ? 'A tough day' : 'A steady day',
    text: `${plural(today.games.length, 'game')}, average ${avgToday}${usualAvg == null ? '' : ` (your usual: ${usualAvg})`}. ${facts}.`,
  }];

  const well = [];
  const before = computeStats(others);
  if (before.high != null && today.high > before.high) well.push(`A new high game: ${today.high}!`);
  if (strikeDiff >= 5) well.push('More strikes than usual.');
  if (spareDiff >= 5) well.push('Better spare shooting than usual.');
  if (today.opens === 0 && today.games.length) well.push('No open frames.');
  if (!well.length) well.push(`Your best game today was ${today.high}.`);
  items.push({ title: 'What went well', text: well.join(' ') });

  const [tip] = ranked(db, today);
  const [usualTip] = tip ? [] : ranked(db, recentStats(db.sessions));
  const next = tip ?? usualTip;
  items.push(next
    ? { ...next, title: `Next time: ${next.title}` }
    : { title: 'Next time', text: 'Nothing stands out. Pick one thing for your next session: the same line every first ball, the same speed, or every single-pin spare.' });
  return items;
}

// ---------- Questions you can tap ----------

const ARROWS = {
  title: 'Aim at the arrows',
  text: 'Aim at the arrows, not the pins: they\'re about 15 feet past the foul line, so a small miss there is a small miss at the pins. Pick one arrow and keep your eyes on it until the ball rolls over it. Boards count from your bowling-hand side: the 2nd arrow is board 10, the center arrow board 20.',
};

// Your leave seen most often, if you've left it a few times.
const topLeave = (st) => st.leaves.find((l) => l.standing.length < 10 && l.count >= 3) ?? null;

// The questions worth asking now: [{ key, label }].
export function questions(db, ctx) {
  const all = computeStats(db.sessions);
  const qs = [];
  if (ctx.when === 'during') qs.push({ key: 'now', label: 'What should I change right now?' });
  if (all.combos.length) qs.push({ key: 'line', label: 'What line should I play?' });
  const leave = topLeave(all);
  if (leave) qs.push({ key: `leave:${leave.standing.join('-')}`, label: `Why do I keep leaving ${leaveName(leave.standing)}?` });
  if (all.firstBalls) qs.push({ key: 'strikes', label: 'How do I get more strikes?' });
  if (all.spareChances) qs.push({ key: 'spares', label: 'How do I make more spares?' });
  qs.push({ key: 'speed', label: 'Should I change my speed?' });
  if (all.games.length) qs.push({ key: 'improving', label: 'Am I improving?' }, { key: 'workon', label: 'What should I work on?' });
  if (all.games.length < 3) qs.push({ key: 'findline', label: 'How do I find my line?' }, { key: 'arrows', label: 'How does aiming at arrows work?' });
  return qs;
}

function leaveItems(db, pins) {
  const hand = db.settings.hand;
  const side = sides(hand);
  const all = computeStats(db.sessions);
  const leave = all.leaves.find((l) => l.standing.join('-') === pins.join('-'));
  const name = leaveName(pins);
  const note = carryNote(pins, hand);
  const read = leaveRead(pins, hand);
  let why = 'It doesn\'t say much about your line: often it\'s just how the pins fell. Focus on picking it up.';
  if (note) why = `On a pocket hit it usually means: ${note.text}`;
  else if (read === 'light') why = `It usually comes from a light hit, the ball reaching the head pin too far ${side.hand}. Keep your arrow and move your feet 2 boards ${side.hand}.`;
  else if (read === 'high') why = `It usually comes from a high hit, too much head pin. Keep your arrow and move your feet 2 boards ${side.other}, or add a touch of speed so it hooks later.`;
  const items = [{
    title: `Why ${name}`,
    text: `${leave ? `You've left it ${plural(leave.count, 'time')} (${pct(leave.count, all.firstBalls)}% of first balls). ` : ''}${why}`,
  }];
  const aim = spareAimFor(pins, db.sessions, db.practice, hand);
  if (aim) {
    items.push({
      title: `Picking up ${name}`,
      text: `Feet ${aim.feet}, arrow ${aim.target}${aim.learned ? ', adjusted to your tries' : ' (the 3-6-9 system)'}.${leave?.chances ? ` You've made it ${leave.made} of ${leave.chances}.` : ''}`,
      link: { href: `#/practice/${pins.join('-')}`, label: `Practice ${name}` },
    });
  }
  return items;
}

function strikeItems(db) {
  const hand = db.settings.hand;
  const side = sides(hand);
  const st = recentStats(db.sessions);
  const reads = collectShots(st.games.map(({ session, game }) => ({ ...session, games: [game] })))
    .filter((x) => x.fresh).map((x) => ballRead(x.shot, hand));
  const light = reads.filter((r) => r === 'light').length;
  const high = reads.filter((r) => r === 'high').length;
  const items = [{
    title: 'Your strikes',
    text: `${pct(st.strikes, st.firstBalls) ?? 0}% of your first balls over your last ${plural(st.games.length, 'game')} were strikes${st.firstBallAvg == null ? '' : `, knocking down ${st.firstBallAvg.toFixed(1)} pins on average`}. Strikes come from hitting the pocket at a good angle, the same way every time.`,
  }];
  if (light >= 4 && light >= high * 2) {
    items.push({ title: 'Most misses are light', text: `${light} of your first balls left pins that point to a light hit. Move your feet 2 boards ${side.hand} and keep your arrow, then check again after a few frames.`, basis: `From ${plural(reads.length, 'first ball')}.` });
  } else if (high >= 4 && high >= light * 2) {
    items.push({ title: 'Most misses are high', text: `${high} of your first balls left pins that point to a high hit. Move your feet 2 boards ${side.other} and keep your arrow. Splits mostly come from high hits too.`, basis: `From ${plural(reads.length, 'first ball')}.` });
  } else {
    items.push({ title: 'Repeat the same shot', text: 'Your misses go both ways, so the line is fine: it\'s the shot that changes. Same steps, same speed, eyes on your arrow, and finish facing your target.' });
  }
  if (st.carry.pocket >= 5) {
    const leave = st.carry.leaves[0];
    const note = leave && carryNote(leave.pins, hand);
    items.push({ title: 'Carry', text: `You strike on ${pct(st.carry.strikes, st.carry.pocket)}% of your pocket hits.${note ? ` Most often you leave ${leaveName(leave.pins)}: ${note.text}` : ''}`, basis: `From ${plural(st.carry.pocket, 'pocket hit')}.` });
  }
  return items;
}

function spareItems(db) {
  const all = computeStats(db.sessions);
  const st = recentStats(db.sessions);
  const items = [{
    title: 'Your spares',
    text: `You've made ${pct(st.sparesMade, st.spareChances) ?? 0}% of your spares lately${st.singleChances ? `, and ${pct(st.singleMade, st.singleChances)}% of single pins` : ''}. Picking up spares is the quickest way to raise your average: every missed spare costs about 10 pins.`,
  }, {
    title: 'The 3-6-9 system',
    text: 'Keep your strike-ball arrow and only move your feet: the farther the pin is from your strike line, the more you move. The spare aim under your line counts the boards for you and learns from your tries.',
  }];
  const worst = all.leaves.filter((l) => !l.split && l.chances >= 3 && l.made / l.chances < 0.6)
    .sort((a, b) => a.made / a.chances - b.made / b.chances)[0];
  if (worst) {
    const aim = spareAimFor(worst.standing, db.sessions, db.practice, db.settings.hand);
    items.push({
      title: `Work on ${leaveName(worst.standing)}`,
      text: `You've made it ${worst.made} of ${worst.chances}. Try feet ${aim.feet}, arrow ${aim.target}.`,
      link: { href: `#/practice/${worst.standing.join('-')}`, label: `Practice ${leaveName(worst.standing)}` },
    });
  }
  if (st.singleChances >= 4 && st.singleMade / st.singleChances < 0.8) {
    items.push({ title: 'Single pins', text: 'Throw single pins straight, a little slower, and cross the lane: for pins on your hand side, stand on the far side of the approach and aim back across.' });
  }
  return items;
}

const FASTER = 'To add speed, hold the ball a little higher when you set up and push it away a bit farther, so it swings higher. Keep your steps smooth and don\'t muscle it with your arm.';
const SLOWER = 'To take speed off, hold the ball lower when you set up, keep the push-away small and slow your first step a little.';

function speedItems(db) {
  const unit = db.settings.speedUnit;
  const label = SPEED_UNITS[unit];
  const st = computeStats(db.sessions);
  if (st.speedCount < 8) {
    return [{
      title: 'Log a few speeds first',
      text: `Most lane screens show your speed after each ball. Set What to log to Everything and type it under More details; after a few games I can tell you which speed strikes best for you. Most bowlers roll ${unit === 'mph' ? '14 to 18 mph' : '22 to 29 km/h'}, and steady matters more than fast.`,
      link: { href: '#/settings', label: 'What to log' },
    }];
  }
  const items = [];
  const bands = speedBands(st, unit).filter((b) => b.n >= 5);
  const usual = bands.reduce((a, b) => (!a || b.n > a.n ? b : a), null);
  const best = bands.reduce((a, b) => (!a || b.strikes / b.n > a.strikes / a.n ? b : a), null);
  const range = (b) => `${b.from}–${b.to} ${label}`;
  if (best && usual && best !== usual && best.strikes / best.n - usual.strikes / usual.n >= 0.1) {
    const faster = best.from > usual.from;
    items.push({
      title: faster ? 'Try a little more speed' : 'Try a little less speed',
      text: `You strike ${pct(best.strikes, best.n)}% at ${range(best)}, against ${pct(usual.strikes, usual.n)}% at your usual ${range(usual)}. ${faster ? FASTER : SLOWER} Change it a little at a time and keep everything else the same.`,
      basis: `From ${plural(best.n + usual.n, 'first ball')} with a speed recorded.`,
    });
  } else {
    items.push({ title: 'Speed is fine', text: `Your strike rate is about the same across your speeds${usual ? `, so stay around ${range(usual)}` : ''}. Work on your line and spares instead.` });
  }
  if (st.speedSD >= 1) {
    items.push({ title: 'Steady it', text: `Your speed changes by about ±${toSpeedUnit(st.speedSD, unit).toFixed(1)} ${label} from ball to ball, which changes how much the ball hooks. Same steps, same push-away, every ball.` });
  }
  return items;
}

function improvingItems(db) {
  const p = progress(db.sessions);
  const items = [];
  if (!p) {
    items.push({ title: 'Too early to tell', text: 'Finish 4 games and I can compare your first games with your latest.' });
  } else {
    const a1 = Math.round(p.first.average);
    const a2 = Math.round(p.last.average);
    items.push({
      title: a2 > a1 ? 'Yes, you are!' : a2 < a1 ? 'Not lately' : 'Holding steady',
      text: `Your last ${p.k} games average ${a2}, against ${a1} in your first ${p.k}. Strikes ${pct(p.first.strikes, p.first.firstBalls) ?? 0}% → ${pct(p.last.strikes, p.last.firstBalls) ?? 0}%, spares ${pct(p.first.sparesMade, p.first.spareChances) ?? 0}% → ${pct(p.last.sparesMade, p.last.spareChances) ?? 0}%.`,
      basis: `From ${plural(p.total, 'game')}.`,
      link: { href: '#/stats', label: 'See your progress' },
    });
  }
  for (const s of goalStatus(db.sessions, db.settings.goals)) {
    if (s.value == null) continue;
    items.push({ title: s.met ? 'Goal reached' : 'Goal', text: `${goalText(s.goal)}: you're at ${s.type.fmt(s.value)}.` });
  }
  return items;
}

function workOnItems(db) {
  const list = ranked(db, recentStats(db.sessions), db.sessions).slice(0, 2);
  return list.length ? list : [{
    title: 'Keep it simple',
    text: 'Nothing stands out yet. Play the same line every first ball, keep your eyes on the arrow, and use the spare aim on every spare. The more you log, the more I can tell you.',
  }];
}

// The coach's answer to question `key` (from questions()).
export function answer(key, db, ctx) {
  if (key === 'now') return ctx.when === 'during' ? nowAdvice(ctx.game, ctx.session, db) : workOnItems(db);
  if (key === 'line') return [...lineItems(db, ctx.session?.center ?? ctx.center ?? ''), ...(ctx.when === 'during' ? [] : [WARM_UP])];
  if (key.startsWith('leave:')) return leaveItems(db, key.slice(6).split('-').map(Number));
  if (key === 'strikes') return strikeItems(db);
  if (key === 'spares') return spareItems(db);
  if (key === 'speed') return speedItems(db);
  if (key === 'improving') return improvingItems(db);
  if (key === 'workon') return workOnItems(db);
  if (key === 'findline') return [{ title: 'Finding your line', text: startText(db.settings.hand) }];
  if (key === 'arrows') return [ARROWS];
  return [];
}
