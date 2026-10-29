# Bowling Tracker

A phone app (Progressive Web App) for logging every ball you bowl: pins left, where your feet started, which arrow the ball crossed, the breakpoint, pin hit, speed and how it felt. It works out your score and shows which feet + arrow lines get you the most strikes.

Plain HTML, CSS and JavaScript, with no build step and no dependencies. Data stays on the phone (browser localStorage), with backup/restore and CSV export in Settings.

## Run it on this PC

```
python -m http.server 8000
```

Then open http://localhost:8000. For a phone-sized view in Edge or Chrome, press F12 and then Ctrl+Shift+M.

The service worker serves the app from its offline cache, so edits don't show up on a normal reload. While you're editing, tick "Update on reload" in DevTools → Application → Service workers.

## Tests

```
python tests/run_tests.py
```

This runs the scoring tests (`tests/test.html`) and an end-to-end run of the app in a phone-sized frame (`tests/e2e.html`) using headless Edge. Both pages also work in a normal browser while the server is running. To freeze the app at a step and look at it, use `tests/e2e.html?stop=game` (other steps: `welcome`, `summary300`, `pins`, `summary`, `home`, `stats`, `help`, `lanetop`, `lanebottom`, `changelog`, `settings`, `about`, `lefty`).

## Put it on your phone

Installing a PWA requires HTTPS, so the folder has to be hosted. Both of these options are free:

- **GitHub Pages**: push this folder to a GitHub repository, then go to Settings → Pages → "Deploy from a branch" → `main` / root. Open `https://<username>.github.io/<repo>/` on the phone.
- **Netlify Drop**: drag this folder onto https://app.netlify.com/drop to get an HTTPS link.

On the Samsung phone, open the link in Chrome or Samsung Internet, then use the menu → **Add to Home screen** / **Install app**. After that it opens full-screen and works offline.

**Updates:** before every publish:

1. Add an entry with `version: 'next'` at the top of `js/changelog.js`, describing the update in plain words. It appears on the app's "What's new" page.
2. Run

   ```
   python tools/bump_version.py
   ```

   It gives `sw.js` and `js/version.js` a new version (without one, phones keep running the old app), stamps the `'next'` changelog entry with that version, and checks that every app file is in the offline list. It refuses to run if there's no `'next'` entry; use `--no-changelog` for fixes nobody will notice. The phone downloads the update the next time the app is opened online, and uses it from the following launch.

**Backups:** your data lives only in that phone's browser. Use Settings → Backup now and then; the app reminds you every 5 sessions. "Save backup to Drive / email" shares a `.txt` file, because Android won't share `.json` files. Restore accepts either. A restore can be undone from Settings.

## Project layout

| Path | What it does |
|---|---|
| `index.html`, `css/styles.css` | App shell and styles: two themes (Midnight lanes, Minimal), each light and dark |
| `fonts/` | Inter font for the Minimal theme (SIL Open Font License, `fonts/OFL.txt`) |
| `js/app.js` | Router, bottom tabs, theme, glossary pop-ups, messages |
| `js/scoring.js` | Bowling score rules, split detection |
| `js/storage.js` | Saving, backup/restore, CSV export, sync between open copies |
| `js/normalize.js` | Checks and repairs saved or restored data |
| `js/stats.js` | Stat calculations, progress (first vs latest games), personal bests, coaching tips |
| `js/lane.js`, `js/pins.js` | Tappable lane and pin-deck pickers |
| `js/lanemap.js` | To-scale lane on the Help screen |
| `js/changelog.js`, `js/version.js` | Update history and the current version (shown in Settings) |
| `js/scoreboard.js`, `js/charts.js` | Scoreboard and charts |
| `js/terms.js` | Labels and the beginner glossary |
| `js/ui.js`, `js/device.js` | Icons and top bar; keep-screen-on, vibration, strike flash |
| `js/views/` | One file per screen |
| `sw.js`, `manifest.webmanifest`, `icons/` | Offline support and install info |
| `tools/bump_version.py` | Run before each publish (see Updates) |
| `tools/make_icons.py` | Regenerates the icons |
