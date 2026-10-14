"""
Builds a seamless limestone texture from photographs of real cathedral stone.

Sources are own photos of the limestone piers of Saint-Denis (References/).
The lighting is divided out (only the stone's own pitting, staining and
tooling remain), patches free of bed joints are cut out, and they are laid
down "dead-leaves" style — random feathered patches composited on a torus —
so the tile is seamless and shows no repeating grid. A height field from the
same image gives the micro-relief normal map.

    python3 tools/build_stone.py
    -> public/textures/limestone-detail.jpg   colour variation, mean 50% grey
    -> public/textures/limestone-normal.jpg   micro-relief (tangent space)

Needs: numpy, scipy, opencv-python-headless, pillow, pillow-heif.
"""

from pathlib import Path

import cv2
import numpy as np
import pillow_heif
from PIL import Image
from scipy import ndimage

ROOT = Path(__file__).resolve().parent.parent
OUT_DETAIL = ROOT / 'public' / 'textures' / 'limestone-detail.jpg'
OUT_NORMAL = ROOT / 'public' / 'textures' / 'limestone-normal.jpg'

# (file, crop box) — plain dressed faces of piers, full-resolution pixels
SOURCES = [
    ('IMG_5836.HEIC', (40, 1500, 290, 2300)),
    ('IMG_5841.HEIC', (60, 1500, 300, 2600)),
    ('IMG_5841.HEIC', (300, 1500, 460, 2600)),
]
SIZE = 1024
PATCH = 112
COUNT = 900
SEED = 7


def load(name: str, box) -> np.ndarray:
    pillow_heif.register_heif_opener()
    im = Image.open(ROOT / 'References' / name).convert('RGB').crop(box)
    return np.asarray(im).astype(np.float32) / 255


def flatten(img: np.ndarray) -> np.ndarray:
    """Divide out shading (column curvature, light falloff); keep the stone's
    own variation as a ratio around 1."""
    low = cv2.GaussianBlur(img, (0, 0), 35)
    return img / np.maximum(low, 1e-3)


def has_joint(p: np.ndarray) -> bool:
    """A bed joint shows as a dark horizontal band across the patch."""
    lum = p.mean(2)
    rows = lum.mean(1) - lum.mean()
    cols = lum.mean(0) - lum.mean()
    return rows.min() < -0.06 or cols.min() < -0.08


def main() -> None:
    rng = np.random.default_rng(SEED)
    srcs = [flatten(load(n, b)) for n, b in SOURCES]
    canvas = np.ones((SIZE, SIZE, 3), np.float32)

    yy, xx = np.mgrid[0:PATCH, 0:PATCH]
    d = np.hypot(xx - PATCH / 2 + 0.5, yy - PATCH / 2 + 0.5) / (PATCH / 2)
    feather = np.clip((1.0 - d) / 0.45, 0, 1) ** 1.5  # soft-edged disc

    placed = 0
    tries = 0
    while placed < COUNT and tries < COUNT * 20:
        tries += 1
        s = srcs[rng.integers(len(srcs))]
        h, w = s.shape[:2]
        y0, x0 = rng.integers(0, h - PATCH), rng.integers(0, w - PATCH)
        p = s[y0:y0 + PATCH, x0:x0 + PATCH]
        if has_joint(p):
            continue
        if rng.random() < 0.5:
            p = p[:, ::-1]
        if rng.random() < 0.5:
            p = p[::-1]
        ty, tx = rng.integers(0, SIZE), rng.integers(0, SIZE)
        # composite on a torus so the tile wraps seamlessly
        iy = (np.arange(PATCH) + ty) % SIZE
        ix = (np.arange(PATCH) + tx) % SIZE
        region = canvas[np.ix_(iy, ix)]
        a = feather[..., None]
        canvas[np.ix_(iy, ix)] = region * (1 - a) + p * a
        placed += 1

    # normalise: mean 0.5 in every channel, contrast kept but tamed
    canvas = canvas / canvas.reshape(-1, 3).mean(0)
    canvas = 1 + (canvas - 1) * 0.9
    detail = np.clip(canvas * 0.5, 0, 1)

    # micro-relief: pits and tooling read darker in the photo -> lower
    lum = canvas.mean(2)
    hp = lum - ndimage.gaussian_filter(lum, 6, mode='wrap')
    hgt = ndimage.gaussian_filter(hp, 0.8, mode='wrap') * 6.0
    gx = (np.roll(hgt, -1, 1) - np.roll(hgt, 1, 1)) * 0.5
    gy = (np.roll(hgt, -1, 0) - np.roll(hgt, 1, 0)) * 0.5
    n = np.stack([-gx, gy, np.ones_like(gx)], -1)  # image rows run down
    n /= np.linalg.norm(n, axis=-1, keepdims=True)

    OUT_DETAIL.parent.mkdir(parents=True, exist_ok=True)
    cv2.imwrite(str(OUT_DETAIL), (detail[..., ::-1] * 255).astype(np.uint8), [cv2.IMWRITE_JPEG_QUALITY, 88])
    cv2.imwrite(str(OUT_NORMAL), ((n * 0.5 + 0.5)[..., ::-1] * 255).astype(np.uint8), [cv2.IMWRITE_JPEG_QUALITY, 90])
    print(f'{placed} patches ({tries} tries) -> {OUT_DETAIL.relative_to(ROOT)}')


if __name__ == '__main__':
    main()
