"""
Converts a PNG to JPEG - Instagram's media API only accepts JPEG images.

Usage:
    python to_jpeg.py <input.png> <output.jpg>
"""

import sys
from pathlib import Path

from PIL import Image


def convert(src: Path, dst: Path) -> None:
    dst.parent.mkdir(parents=True, exist_ok=True)
    Image.open(src).convert("RGB").save(dst, "JPEG", quality=92)
    print(f"{src} -> {dst}")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("Usage: python to_jpeg.py <input.png> <output.jpg>")
        sys.exit(1)
    convert(Path(sys.argv[1]), Path(sys.argv[2]))
