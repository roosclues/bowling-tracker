"""Generate the app icons (an amber bowling ball on navy) as PNGs, using only the standard library.

Usage: python tools/make_icons.py [output folder]     (default: icons/)

The ball is shaded as a sphere lit from the upper left, with drilled-looking finger holes and
a faint glow. Every edge is blended over about a pixel, so the icon is smooth at any size.
The ball stays inside the middle 80% of the square: Android's round and squircle crops
("maskable" in the manifest) don't clip it.
"""
import math
import struct
import sys
import zlib
from pathlib import Path

BG = (11, 18, 34)             # the corners: the manifest's background_color
BG_LIFT = (24, 37, 68)        # behind the ball
GLOW = (255, 176, 32)
BALL_LIGHT = (255, 212, 122)  # toward the light
BALL = (255, 176, 32)         # the app's amber
BALL_DEEP = (224, 126, 4)     # away from the light
SHINE = (255, 240, 205)
HOLE_DARK = (3, 6, 14)        # the shaded side of a hole
HOLE_LIGHT = (22, 33, 60)     # the side that catches the light
LIP = (255, 224, 160)         # a hole's lower-right edge

# In ball radii from the ball's centre.
LIGHT = (-0.38, -0.42)        # where the light falls
HOLES = [(-0.34, -0.44, 0.135), (0.0, -0.52, 0.135), (-0.14, -0.10, 0.155)]  # x, y, radius
RADIUS = 160 / 512            # of the icon's width


def mix(a, b, t):
    return tuple(x + (y - x) * t for x, y in zip(a, b))


def clamp(v):
    return 0.0 if v < 0 else 1.0 if v > 1 else v


def ease(t):
    t = clamp(t)
    return t * t * (3 - 2 * t)


def cover(distance):
    """How much of a pixel lies inside a shape whose edge is `distance` pixels away (negative inside)."""
    return clamp(0.5 - distance)


def ball_color(nx, ny, dn):
    """The ball's surface at (nx, ny), in ball radii from its centre; dn is the distance from the centre."""
    q = math.hypot(nx - LIGHT[0], ny - LIGHT[1]) / 1.55
    color = mix(BALL_LIGHT, BALL, ease(q / 0.45)) if q < 0.45 else mix(BALL, BALL_DEEP, ease((q - 0.45) / 0.55))
    color = mix(color, BALL_DEEP, 0.3 * ease((dn - 0.78) / 0.22))  # the edge turns away from the light
    shine = ease(1 - math.hypot(nx - LIGHT[0] * 1.15, ny - LIGHT[1] * 1.15) / 0.34)
    return mix(color, SHINE, 0.5 * shine)


def pixels(size):
    """The icon as rows of (r, g, b) tuples."""
    c = size / 2
    r = RADIUS * size
    rows = []
    for y in range(size):
        row = []
        for x in range(size):
            px, py = x + 0.5 - c, y + 0.5 - c
            d = math.hypot(px, py)
            # Navy, a little lighter behind the ball, with a faint amber glow around it.
            color = mix(BG, BG_LIFT, ease(1 - d / (size * 0.62)))
            if d > r - 1:
                color = mix(color, GLOW, 0.1 * ease(1 - (d - r) / (r * 0.5)) ** 2)  # faint, so the edge stays crisp
            if d < r + 1:
                nx, ny = px / r, py / r
                surface = ball_color(nx, ny, d / r)
                for hx, hy, hr in HOLES:
                    ox, oy = nx - hx, ny - hy
                    od = math.hypot(ox, oy)
                    if od > hr + 0.06:
                        continue
                    toward = (ox + oy) / (od * math.sqrt(2)) if od else 0  # 1 at the lower right, -1 at the upper left
                    # A thin bright lip where the far edge catches the light...
                    lip = cover(abs(od - hr - 0.012) * r - 0.012 * r) * clamp(toward)
                    surface = mix(surface, LIP, 0.55 * lip)
                    # ...and the hole itself, darker under its near edge.
                    inside = mix(HOLE_DARK, HOLE_LIGHT, ease(0.5 + 0.5 * toward * od / hr))
                    surface = mix(surface, inside, cover((od - hr) * r))
                color = mix(color, surface, cover(d - r))
            row.append(tuple(int(round(v)) for v in color))
        rows.append(row)
    return rows


def png(rows):
    size = len(rows)
    raw = b"".join(b"\x00" + bytes(v for px in row for v in px) for row in rows)

    def chunk(tag, data):
        c = struct.pack(">I", len(data)) + tag + data
        return c + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)

    ihdr = struct.pack(">IIBBBBB", size, size, 8, 2, 0, 0, 0)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr) + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b"")


if __name__ == "__main__":
    out = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).resolve().parent.parent / "icons"
    out.mkdir(exist_ok=True)
    for size in (192, 512):
        (out / f"icon-{size}.png").write_bytes(png(pixels(size)))
        print("wrote", out / f"icon-{size}.png")
