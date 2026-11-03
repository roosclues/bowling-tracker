// Update history shown on the "What's new" screen, newest first.
// Add an entry with version: 'next' at the top for each update; tools/bump_version.py
// stamps it with the real version number when publishing.

export const CHANGELOG = [
  {
    version: 'v20261104-0743',
    title: 'Your own coach, less to fill in and lane notes',
    items: [
      'New Coach tab: a bowling coach that works offline. Before you bowl it tells you where to start and what to work on; during a game it reads your last first balls (the pins you leave say if you hit light or high) and tells you when to move your feet or arrow, by how many boards; after a session it compares the day with your usual.',
      'Tap questions to ask the coach: what line to play, why you keep leaving a pin, how to get more strikes or spares, whether to change your speed, and whether you\'re improving. During a game, the speech bubble next to your score opens it.',
      'Lane notes: mark a lane Avoid or Good, tap what was wrong (ball return, pinsetter, scoring screen, oil, approach) and add a few words. Add one from the session or game summary screen.',
      'Next time, Home shows the lanes to avoid under "Bowl at …", and the session form shows your note as soon as you type the lane number, so you can ask the desk for another lane.',
      'The spare aim learns from you: after a few tries at a pin, it moves up to 2 boards toward where you make it. In Spare practice, Missed is now Left or Right; in a game, a missed spare can say which way it went (optional).',
      'Home: "Bowl at …" starts a session in one tap, with the same center, ball and oil as last time. Add the lane later with the session\'s Edit button if you want it.',
      'New session asks only for the center, the lane and what to log. Date, ball, oil and notes keep last time\'s values under "More details".',
      'What to log: Pins only, Feet & arrow, or Everything. Feet & arrow is the new standard: the game screen no longer shows the breakpoint, pin hit, speed and how it felt. Want them back? Pick Everything in Settings, when you start a session, or at the bottom of the game screen.',
      'Your feet and arrow carry over from the last ball as one line, so the pins and Save fit on the screen. Moved? Tap the arrows next to Feet or Arrow to move a board. Change opens the lane.',
      'No tab bar during a game, bigger pins on larger phones, and the spare aim shows once, under your line.',
      'A spare you haven\'t logged before now starts on the suggested spare aim, not on the line from a different spare.',
    ],
  },
  {
    version: 'v20261031-0622',
    title: 'Strike carry, your moves and a bowling calendar',
    items: [
      'Log just the pins during the game (quick mode is handy for this), then fill in your feet, arrow, breakpoint, pin hit, speed and how it felt from the game summary.',
      'Tap any ball on the summary\'s scoreboard, or Edit next to it in Frame by frame, to change that ball\'s details.',
      '"Add details" steps through every ball without feet or arrow. Each one starts from the line of the ball before it, so you only change what was different. Skip any you don\'t remember.',
      'The pins stay as you entered them, so the score can\'t change by accident. To fix pins, use Undo last ball.',
      'Stats → First ball: "Pocket hits: did they carry?" shows how often your pocket hits are strikes, which pins they leave, and what each leave usually means (the 10 pin: too weak; the 4 pin: too strong).',
      'Session screen: "Your moves" spots when you moved your feet during the session and kept the new spot, and shows your strikes before and after.',
      'Home: sessions are grouped by month, with that month\'s average. Older months fold away.',
      'Stats → Overview: a calendar of the days you bowled, shaded by how each day compared with your average.',
      'Game screen: more room for the pins and lane once you\'ve bowled a few games.',
      'Ball speed is now in km/h. Prefer mph? Switch it in Settings → Ball speed; speeds you already logged are converted.',
    ],
  },
  {
    version: 'v20261029-1641',
    title: 'Spare practice, goals and smarter coaching',
    items: [
      'Spare practice (Home): pick a leave, throw at it, tap Made or Missed, and watch your make rate for each leave over time. Home shows today\'s practice, and Stats shows your practice results next to each leave.',
      'Spare aim: on every spare ball the app suggests where to stand and which arrow to hit, using the 3-6-9 system from your usual strike line. Tap Use to put it on the lane.',
      'Goals (Home): set targets like at least 60% spares or at most 3 open frames a game, measured over your last 10 games. The game summary says when a game gets you there.',
      'Quick mode: "Pins only" on the game screen (or in Settings) saves just the pins, for busy league nights. The spare aim still shows.',
      '"Same as last ball" copies the feet, arrow, breakpoint and speed from your last ball of the same kind.',
      'Stats now has tabs: Overview, First ball, Spares and Feel.',
      'New in Stats: how repeatable your feet and arrow are, scores and strikes by game 1, 2, 3 of a session, strike rate by ball speed, what "Rushed" and other feelings do to your strikes, the average breakpoint for each line, and an oil pattern filter.',
      'Tap a leave in Stats to see the last 8 times you left it, the aim for it, and the line that has worked for you.',
      'Game summary: how the game compares with your average, what you would have scored with every spare, and a link to practice each spare you missed.',
      'Session screen: strikes, spares, open frames, 3-game series and tips for that session, plus a link to your stats at that center. Your session notes show on the game screen as a reminder.',
      'More coaching tips, each saying how much data it is based on. High series is now a personal best.',
      'The backup reminder now also comes up 2 weeks after your last backup, not just after 5 sessions. The spreadsheet export includes your practice tries and session notes.',
    ],
  },
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
