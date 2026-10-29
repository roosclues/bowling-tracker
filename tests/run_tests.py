"""Run the scoring tests and the end-to-end test in headless Microsoft Edge.

Usage (from the project folder):
    python tests/run_tests.py

You can also serve the folder (python -m http.server) and open tests/test.html or
tests/e2e.html in a browser; e2e.html?stop=<step> freezes the app at a step to look at it.
"""
import http.server
import shutil
import subprocess
import sys
import tempfile
import threading
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
EDGE_PATHS = [
    Path(r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"),
    Path(r"C:\Program Files\Microsoft\Edge\Application\msedge.exe"),
]


def find_browser():
    for p in EDGE_PATHS:
        if p.exists():
            return str(p)
    for name in ("msedge", "google-chrome", "chromium", "chrome"):
        found = shutil.which(name)
        if found:
            return found
    sys.exit("Could not find Edge or Chrome.")


# Test pages POST their result text to /__results (the browser's stdout isn't reliably capturable).
RESULTS = {}
RESULT_READY = threading.Event()


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=str(ROOT), **kw)

    def log_message(self, *a):
        pass

    def do_POST(self):
        if self.path == "/__results":
            length = int(self.headers.get("Content-Length", 0))
            RESULTS["text"] = self.rfile.read(length).decode("utf-8")
            RESULT_READY.set()
        self.send_response(204)
        self.end_headers()


def start_server():
    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server


def run_browser(browser, url):
    RESULTS.clear()
    RESULT_READY.clear()
    with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as profile:
        cmd = [browser, "--headless=new", "--disable-gpu", "--no-first-run",
               f"--user-data-dir={profile}", "--window-size=1100,915",
               "--virtual-time-budget=120000", url]
        proc = subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        try:
            RESULT_READY.wait(timeout=90)
        finally:
            if proc.poll() is None:
                proc.kill()
                proc.wait()
    return RESULTS.get("text")


def main():
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")  # results include ▲ and →
    browser = find_browser()
    server = start_server()
    base = f"http://127.0.0.1:{server.server_address[1]}"
    failed = False
    try:
        for page in ("test.html", "e2e.html"):
            body = run_browser(browser, f"{base}/tests/{page}")
            print(f"== {page} ==\n{body or '(no result received)'}\n")
            if not body or "FAIL" in body:
                failed = True
    finally:
        server.shutdown()
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
