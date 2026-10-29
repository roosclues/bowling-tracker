"""Run before every deploy: gives sw.js and js/version.js (shown in Settings) a new VERSION
so phones download the update, stamps the 'next' entry in js/changelog.js with it, and
checks that every app file is in the service worker's offline list.

Usage: python tools/bump_version.py [--no-changelog]
  --no-changelog  publish without a new "What's new" entry (for invisible fixes)
"""
import re
import sys
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SW = ROOT / "sw.js"
APP_VERSION = ROOT / "js" / "version.js"
CHANGELOG = ROOT / "js" / "changelog.js"
skip_changelog = "--no-changelog" in sys.argv[1:]

text = SW.read_text(encoding="utf-8")
listed = set(re.findall(r"^\s*'([^']+)',?$", text, re.M))
on_disk = {"index.html", "manifest.webmanifest"}
for pattern in ("css/*.css", "fonts/*.woff2", "icons/*.png", "js/**/*.js"):
    on_disk |= {p.relative_to(ROOT).as_posix() for p in ROOT.glob(pattern)}

missing = sorted(on_disk - listed)
stale = sorted(f for f in listed - on_disk if f != "./")
if missing or stale:
    for f in missing:
        print(f"Missing from FILES in sw.js: {f}")
    for f in stale:
        print(f"Listed in sw.js but not found: {f}")
    sys.exit("Fix the FILES list in sw.js, then run this again.")

version = "v" + datetime.now().strftime("%Y%m%d-%H%M")

text, n = re.subn(r"const VERSION = '[^']*';", f"const VERSION = '{version}';", text)
if n != 1:
    sys.exit("Could not find the VERSION line in sw.js.")
app_text, m = re.subn(r"export const APP_VERSION = '[^']*';", f"export const APP_VERSION = '{version}';",
                      APP_VERSION.read_text(encoding="utf-8"))
if m != 1:
    sys.exit("Could not find the APP_VERSION line in js/version.js.")
log_text, k = re.subn(r"version: 'next',", f"version: '{version}',", CHANGELOG.read_text(encoding="utf-8"))
if k > 1:
    sys.exit("js/changelog.js has more than one 'next' entry; merge them into one.")
if k == 0 and not skip_changelog:
    sys.exit("Add an entry with version: 'next' at the top of js/changelog.js describing this update\n"
             "(or run with --no-changelog for a fix people won't notice).")

SW.write_text(text, encoding="utf-8")
APP_VERSION.write_text(app_text, encoding="utf-8")
if k:
    CHANGELOG.write_text(log_text, encoding="utf-8")
print(f"Version is now {version} (sw.js, js/version.js{', js/changelog.js' if k else ''}). "
      f"All {len(on_disk)} app files are listed.")
