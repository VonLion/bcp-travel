"""Generate ezOV app icons: indigo tile with a white transit roundel.

Pure-stdlib PNG writer (no Pillow). Run: python3 gen_icons.py
"""
import os
import struct
import zlib

BG = (49, 46, 129)      # indigo-900
FG = (255, 255, 255)


def smoothstep(edge0, edge1, x):
    t = max(0.0, min(1.0, (x - edge0) / (edge1 - edge0)))
    return t * t * (3 - 2 * t)


def render(size):
    cx = cy = size / 2
    ring_r = size * 0.30
    ring_t = size * 0.065
    bar_w = size * 0.74
    bar_h = size * 0.115
    aa = max(1.0, size * 0.004)

    rows = []
    for y in range(size):
        row = bytearray([0])  # filter byte
        for x in range(size):
            dx, dy = x + 0.5 - cx, y + 0.5 - cy
            d = (dx * dx + dy * dy) ** 0.5

            # ring coverage
            ring = smoothstep(-aa, aa, ring_r + ring_t / 2 - d) * \
                   smoothstep(-aa, aa, d - (ring_r - ring_t / 2))
            # horizontal bar coverage (rounded ends)
            bx = abs(dx) - (bar_w / 2 - bar_h / 2)
            if bx < 0:
                bar_d = abs(dy)
            else:
                bar_d = (bx * bx + dy * dy) ** 0.5
            bar = smoothstep(-aa, aa, bar_h / 2 - bar_d)

            a = max(ring, bar)
            px = tuple(round(BG[i] + (FG[i] - BG[i]) * a) for i in range(3))
            row += bytes(px)
        rows.append(bytes(row))
    return b''.join(rows)


def write_png(path, size):
    raw = render(size)

    def chunk(tag, data):
        c = struct.pack('>I', len(data)) + tag + data
        return c + struct.pack('>I', zlib.crc32(tag + data))

    ihdr = struct.pack('>IIBBBBB', size, size, 8, 2, 0, 0, 0)
    png = (b'\x89PNG\r\n\x1a\n'
           + chunk(b'IHDR', ihdr)
           + chunk(b'IDAT', zlib.compress(raw, 9))
           + chunk(b'IEND', b''))
    with open(path, 'wb') as f:
        f.write(png)
    print(f'{path} ({size}x{size}, {len(png)} bytes)')


os.makedirs('icons', exist_ok=True)
write_png('icons/icon-192.png', 192)
write_png('icons/icon-512.png', 512)
write_png('icons/apple-touch-icon.png', 180)
