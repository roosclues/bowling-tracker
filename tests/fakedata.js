// Made-up bowling for the speed check (tests/perf.js).

// About 3 years of bowling: sessions of 3 games, every ball with feet, arrow, breakpoint, hit and
// speed, a few centers, balls and oils, league nights, and some spare practice.
export function fakeData(games) {
  let seed = 11;
  const rand = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  const ALL = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  const pick = (pins, n) => pins.slice().sort(() => rand() - 0.5).slice(0, n).sort((a, b) => a - b);
  const leave = () => pick(ALL, 1 + Math.floor(rand() * (rand() < 0.6 ? 2 : 5)));
  const second = (standing) => (rand() < 0.55 ? [] : pick(standing, 1 + Math.floor(rand() * standing.length)));
  const ball = (standing) => ({
    standing, feet: 18 + Math.floor(rand() * 5), target: 9 + Math.floor(rand() * 3), breakpoint: 6 + Math.floor(rand() * 4),
    hit: standing.length ? ['light', 'high', 'pocket'][Math.floor(rand() * 3)] : 'pocket',
    speed: 15 + Math.round(rand() * 30) / 10, tags: rand() < 0.1 ? ['Rushed'] : [], note: '',
  });
  const sessions = [];
  const day = new Date(2023, 10, 1);
  for (let n = 0; n * 3 < games; n++) {
    const list = [];
    for (let g = 0; g < 3 && n * 3 + g < games; g++) {
      const frames = [];
      for (let f = 0; f < 9; f++) {
        if (rand() < 0.3) { frames.push([ball([])]); continue; }
        const first = leave();
        frames.push([ball(first), ball(second(first))]);
      }
      const first = leave();
      const next = second(first);
      frames.push(next.length ? [ball(first), ball(next)] : [ball(first), ball(next), ball(leave())]);
      list.push({ id: `s${n}g${g}`, frames });
    }
    const iso = day.toISOString().slice(0, 10);
    sessions.push({
      id: `s${n}`, date: iso, center: ['North Lanes', 'Star Bowl', 'Lucky Strike'][n % 3], lane: String(1 + (n % 24)),
      ball: n % 4 ? 'Phaze' : 'Spare ball', oil: n % 5 ? 'House' : 'Sport', notes: '', league: n % 2 === 0, games: list,
    });
    day.setDate(day.getDate() + 6 + (n % 3));
  }
  const practice = Array.from({ length: 300 }, (_, i) => ({
    id: `p${i}`, date: sessions[i % sessions.length].date, leave: [[10], [7], [2, 4, 5], [3, 6, 10]][i % 4], made: rand() < 0.6, miss: null, feet: 20, target: 10,
  }));
  return { settings: { seenVersion: 'x', league: { on: true } }, sessions, practice };
}
