"""Generate the app icons (an amber bowling ball on navy) as PNGs, using only the standard library.

Usage: python tools/make_icons.py
"""
import math
import struct
import zlib
from pathlib import Path

BG = (11, 18, 34)
BALL = (255, 176, 32)
SHINE = (255, 222, 150)
HOLE = (11, 18, 34)


def render(size):
    s = size / 512
    cx, cy, r = 256 * s, 262 * s, 150 * s
    holes = [(206, 196, 20), (256, 186, 20), (236, 246, 23)]
    holes = [(x * s, y * s, hr * s) for x, y, hr in holes]
    rows = []
    for y in range(size):
        row = bytearray([0])
        for x in range(size):
            px, py = x + 0.5, y + 0.5
            color = BG
            d = math.hypot(px - cx, py - cy)
            if d <= r:
                # simple highlight toward the upper left
                t = max(0.0, 1 - math.hypot(px - (cx - 60 * s), py - (cy - 60 * s)) / (r * 1.1))
                color = tuple(int(b + (h - b) * t * 0.55) for b, h in zip(BALL, SHINE))
                for hx, hy, hr in holes:
                    if math.hypot(px - hx, py - hy) <= hr:
                        color = HOLE
            elif d <= r + 1:
                a = r + 1 - d
                color = tuple(int(bg + (bl - bg) * a) for bg, bl in zip(BG, BALL))
            row += bytes(color)
        rows.append(bytes(row))
    raw = b"".join(rows)

    def chunk(tag, data):
        c = struct.pack(">I", len(data)) + tag + data
        return c + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)

    ihdr = struct.pack(">IIBBBBB", size, size, 8, 2, 0, 0, 0)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr) + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b"")


if __name__ == "__main__":
    out = Path(__file__).resolve().parent.parent / "icons"
    out.mkdir(exist_ok=True)
    for size in (192, 512):
        (out / f"icon-{size}.png").write_bytes(render(size))
        print("wrote", out / f"icon-{size}.png")
