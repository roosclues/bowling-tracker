// Update history shown on the "What's new" screen, newest first.
// Add an entry with version: 'next' at the top for each update; tools/bump_version.py
// stamps it with the real version number when publishing.

export const CHANGELOG = [
  {
    version: 'v20261029-1523',
    title: 'Minimal is now the main theme',
    items: [
      'Minimal is first in Settings → Theme and is the look the app starts with. Midnight lanes is still there if you want it.',
      'The "App updated" message now stays until you close it with ×, like the other messages.',
    ],
  },
  {
    version: 'v20261029-1322',
    title: 'See your progress, and a Minimal theme',
    items: [
      'Stats → "Are you improving?" compares your first games with your latest ones: average, 1st-ball pins, strikes, spares, 1-pin spares, open frames and pocket hits, each marked Better, Worse or Same.',
      'New Personal bests: high game, best session average, most strikes, strikes in a row and fewest open frames, with the date you set each one.',
      'The score chart can show each session\'s average (smoother than single games) or every game.',
      'Home shows how your average has changed, and the game summary says when you bowl a new high game.',
      'New theme in Settings → Theme: Minimal, with plain colors, the Inter font, and numbers in simple rows.',
      'Messages at the bottom of the screen now stay until you close them with ×.',
      'Approach dots on the lane pictures are now on boards 5, 10, 15, 20, 25, 30 and 35.',
    ],
  },
  {
    version: 'v20261029-0710',
    title: 'Realistic lane guide and update history',
    items: [
      'Help → Reading the lane now shows a full-length lane drawn to scale: approach dots, foul line, guide dots, arrows, where the oil usually ends, range finders and the pins at 60 ft.',
      'Tap that lane to see how your feet, arrow and breakpoint change the ball\'s path.',
      'New "What\'s new" page (Settings → About) with this history of updates.',
      'After each update, Home shows a one-time note linking here.',
    ],
  },
  {
    version: 'v20261029-0655',
    title: 'Version number in Settings',
    items: [
      'Settings → About shows which version you have.',
      'New "Check for updates" button.',
      'Fixed "1 sessions" wording in Settings.',
    ],
  },
  {
    version: 'v20261029-0641',
    title: 'First release',
    items: [
      'Log every ball: pins left standing, feet board, arrow, breakpoint, pin hit, speed and how it felt.',
      'Automatic scoring with a bowling-alley scoreboard, plus a STRIKE!/SPARE! celebration.',
      'Stats: average, strike and spare rates, most common leaves, and your best feet + arrow lines.',
      'Beginner glossary and coaching tips.',
      'Works offline, keeps the screen on while bowling, backups to Drive or email, and spreadsheet (CSV) export.',
    ],
  },
];
