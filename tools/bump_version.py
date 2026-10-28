"""Run before every deploy: gives sw.js and js/version.js (shown in Settings) a new VERSION
so phones download the update, and checks that every app file is in the service worker's
offline list.

Usage: python tools/bump_version.py
"""
import re
import sys
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SW = ROOT / "sw.js"
APP_VERSION = ROOT / "js" / "version.js"

text = SW.read_text(encoding="utf-8")
listed = set(re.findall(r"^\s*'([^']+)',?$", text, re.M))
on_disk = {"index.html", "manifest.webmanifest"}
for pattern in ("css/*.css", "icons/*.png", "js/**/*.js"):
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
SW.write_text(text, encoding="utf-8")
APP_VERSION.write_text(app_text, encoding="utf-8")
print(f"Version is now {version} (sw.js and js/version.js). All {len(on_disk)} app files are listed.")
