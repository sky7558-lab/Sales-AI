"""Generate simple PNG icons for the PWA without external dependencies.

Produces a flat purple background with a white check + bar mark.
Run: python3 scripts/make_icons.py
"""
import os
import struct
import zlib

OUT_DIR = os.path.join(os.path.dirname(__file__), "..", "public", "icons")
os.makedirs(OUT_DIR, exist_ok=True)

BG = (124, 92, 255)   # accent purple
FG = (255, 255, 255)


def png_bytes(pixels, width, height):
    raw = b""
    for y in range(height):
        raw += b"\x00"  # filter byte: None
        for x in range(width):
            r, g, b, a = pixels[y * width + x]
            raw += bytes((r, g, b, a))
    compressed = zlib.compress(raw, 9)

    def chunk(tag, data):
        return (
            struct.pack(">I", len(data))
            + tag
            + data
            + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
        )

    sig = b"\x89PNG\r\n\x1a\n"
    ihdr = struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)
    return sig + chunk(b"IHDR", ihdr) + chunk(b"IDAT", compressed) + chunk(b"IEND", b"")


def make_icon(size, padding_ratio=0.18):
    pad = int(size * padding_ratio)
    pixels = []
    # Draw background with rounded-ish corners (simple radial mask is overkill;
    # use a square — masking handles the corner radius on iOS home screen).
    for y in range(size):
        for x in range(size):
            pixels.append((*BG, 255))

    # Draw a check mark: a thick diagonal "✓" inside the padded area.
    inner = size - 2 * pad
    thick = max(2, size // 14)

    # The check has two segments:
    #   short: from (0.20, 0.55) to (0.40, 0.75)
    #   long:  from (0.40, 0.75) to (0.85, 0.30)
    def line(p0, p1):
        x0, y0 = p0
        x1, y1 = p1
        steps = max(abs(x1 - x0), abs(y1 - y0)) * 4
        for i in range(int(steps) + 1):
            t = i / steps if steps else 0
            cx = x0 + (x1 - x0) * t
            cy = y0 + (y1 - y0) * t
            for dy in range(-thick, thick + 1):
                for dx in range(-thick, thick + 1):
                    if dx * dx + dy * dy <= thick * thick:
                        px, py = int(cx + dx), int(cy + dy)
                        if 0 <= px < size and 0 <= py < size:
                            pixels[py * size + px] = (*FG, 255)

    a = (pad + inner * 0.18, pad + inner * 0.55)
    b = (pad + inner * 0.42, pad + inner * 0.78)
    c = (pad + inner * 0.85, pad + inner * 0.28)
    line(a, b)
    line(b, c)

    return png_bytes(pixels, size, size)


def write(path, data):
    with open(path, "wb") as f:
        f.write(data)
    print("wrote", path, len(data), "bytes")


for size in (192, 512):
    write(os.path.join(OUT_DIR, f"icon-{size}.png"), make_icon(size))

# Apple touch icon: 180x180 (standard)
write(os.path.join(OUT_DIR, "apple-touch-icon.png"), make_icon(180, padding_ratio=0.15))

# Favicon: 32x32
write(os.path.join(OUT_DIR, "favicon-32.png"), make_icon(32, padding_ratio=0.1))
