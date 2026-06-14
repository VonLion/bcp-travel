"""Generate BCP Travel app icons from icon.svg.

Rasterises the brand flip-board icon to the PNG sizes the PWA manifest and
iOS need. Requires rsvg-convert (brew install librsvg).

Run: python3 gen_icons.py
"""
import os
import shutil
import subprocess

SIZES = {
    'icons/icon-192.png': 192,
    'icons/icon-512.png': 512,
    'icons/apple-touch-icon.png': 180,
}

if shutil.which('rsvg-convert') is None:
    raise SystemExit('rsvg-convert not found — install with: brew install librsvg')

os.makedirs('icons', exist_ok=True)
for path, size in SIZES.items():
    subprocess.run(
        ['rsvg-convert', '-w', str(size), '-h', str(size), 'icon.svg', '-o', path],
        check=True,
    )
    print(f'{path} ({size}x{size})')
