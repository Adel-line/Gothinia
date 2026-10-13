"""
Builds the rose window's glass atlas from a photograph of a real rose.

Source: References/IMG_6251.jpg — the north rose of Notre-Dame de Paris
(own photo, shot near head-on). Every glazed opening in the photo is found,
cut out, turned so its radial axis points up (outward), and packed into an
atlas tile. At runtime each pane of our procedural tracery is given the
photographed opening closest to it in ring position and shape, so every
opening carries real 13th-c. glass — leading, painted figures, mosaic grounds
— instead of drawn motifs.

    python3 tools/build_rose_glass.py
    -> public/textures/rose-glass-atlas.jpg   (GRID columns of tiles)
    -> src/scenes/roseWindow/roseGlassTiles.json

Needs: numpy, scipy, opencv-python-headless.
"""

import json
import math
from pathlib import Path

import cv2
import numpy as np
from scipy import ndimage

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'References' / 'IMG_6251.jpg'
OUT_IMG = ROOT / 'public' / 'textures' / 'rose-glass-atlas.jpg'
OUT_JSON = ROOT / 'src' / 'scenes' / 'roseWindow' / 'roseGlassTiles.json'

# Rose in the source photo (pixels). Shot from below, so the circle is
# foreshortened vertically into an ellipse; it is rectified to a circle first.
CX, CY = 1136.0, 1527.0
RX, RY = 1200.0, 955.0
# Gallery railing crosses the lower rose; ignore openings below this (photo y).
RAIL_Y = 2420.0

TILE = 256
GRID = 8  # 64 tiles max


def rectify(img: np.ndarray) -> tuple[np.ndarray, float, float]:
    """Stretch vertically so the rose is a circle of radius RX about (CX, CY')."""
    k = RX / RY
    h, w = img.shape[:2]
    out = cv2.resize(img, (w, int(round(h * k))), interpolation=cv2.INTER_CUBIC)
    return out, CY * k, RAIL_Y * k


def glass_mask(img: np.ndarray) -> np.ndarray:
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    sat = hsv[..., 1].astype(np.float32) / 255
    val = hsv[..., 2].astype(np.float32) / 255
    raw = (sat > 0.38) & (val > 0.06)
    # bridge the lead cames and painted lines so each opening is one blob
    m = cv2.morphologyEx(raw.astype(np.uint8), cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))
    m = ndimage.binary_fill_holes(m).astype(np.uint8)
    m = cv2.morphologyEx(m, cv2.MORPH_OPEN, np.ones((9, 9), np.uint8))
    return m > 0


def main() -> None:
    src = cv2.imread(str(SRC), cv2.IMREAD_COLOR)
    if src is None:
        raise SystemExit(f'cannot read {SRC}')
    img, cy, rail = rectify(src)
    h, w = img.shape[:2]
    mask = glass_mask(img)
    labels, n = ndimage.label(mask)

    candidates = []
    for i, sl in enumerate(ndimage.find_objects(labels), start=1):
        if sl is None:
            continue
        comp = labels[sl] == i
        area = int(comp.sum())
        if area < 4000:
            continue
        ys, xs = np.nonzero(comp)
        ys = ys + sl[0].start
        xs = xs + sl[1].start
        # must sit wholly inside the frame and above the railing
        if xs.min() < 4 or xs.max() > w - 5 or ys.min() < 4 or ys.max() > rail:
            continue
        mx, my = xs.mean(), ys.mean()
        dx, dy = mx - CX, cy - my  # +y up
        rn = math.hypot(dx, dy) / RX
        if rn > 1.0:
            continue
        phi = math.atan2(dy, dx) if rn > 0.03 else math.pi / 2
        # local frame: +v radial outward, +u tangential
        ru = np.array([math.cos(phi), math.sin(phi)])
        tu = np.array([-ru[1], ru[0]])
        px = np.stack([xs - mx, my - ys], axis=1)  # +y up
        along = px @ ru
        across = px @ tu
        radius = float(np.sqrt((px ** 2).sum(axis=1)).max())
        elong = float((along.max() - along.min()) / max(across.max() - across.min(), 1.0))
        candidates.append(dict(cx=mx, cy=my, rn=rn, phi=phi, radius=radius, elong=elong, area=area))

    # spread the atlas over the whole radius: up to GRID openings (the
    # largest) from each of GRID radial bands, so every ring of our tracery
    # finds glass of the right kind
    chosen = []
    for b in range(GRID):
        band = [c for c in candidates if b / GRID <= c['rn'] < (b + 1) / GRID]
        band.sort(key=lambda c: -c['area'])
        chosen += band[:GRID]
    candidates = chosen[: GRID * GRID]
    candidates.sort(key=lambda c: (c['rn'], c['phi']))

    # nearest-glass fill for whatever stone a tile's square corners catch
    raw_glass = mask
    _, (iy, ix) = ndimage.distance_transform_edt(~raw_glass, return_indices=True)
    # dimmed, so any of it that does show reads as shadowed glass, not as
    # a bright starburst of smeared colour
    filled = np.where(raw_glass[..., None], img, (img[iy, ix] * 0.4).astype(np.uint8))

    rows = math.ceil(len(candidates) / GRID)
    atlas = np.zeros((rows * TILE, GRID * TILE, 3), np.uint8)
    tiles = []
    for k, c in enumerate(candidates):
        # rotate about the opening's centre so its outward radial axis is up
        rot_deg = 90.0 - math.degrees(c['phi'])
        scale = TILE / (2.0 * c['radius'])
        R = cv2.getRotationMatrix2D((0, 0), rot_deg, scale)
        R[0, 2] = TILE / 2 - (R[0, 0] * c['cx'] + R[0, 1] * c['cy'])
        R[1, 2] = TILE / 2 - (R[1, 0] * c['cx'] + R[1, 1] * c['cy'])
        tile = cv2.warpAffine(filled, R, (TILE, TILE), flags=cv2.INTER_AREA, borderMode=cv2.BORDER_REFLECT)
        gx, gy = k % GRID, k // GRID
        atlas[gy * TILE:(gy + 1) * TILE, gx * TILE:(gx + 1) * TILE] = tile
        tiles.append(dict(
            tile=k,
            rn=round(c['rn'], 4),
            elong=round(c['elong'], 3),
            size=round(c['radius'] / RX, 4),
        ))

    # Tone the photo for use as a light source. The phone exposed for the
    # brightest glass, so most pot-metal sits near black; lift the mid-tones on
    # the value channel (keeps hue and saturation) while holding the lead cames
    # dark, even out each tile's exposure (the rim was metered darker than the
    # centre), and roll off the top so blown glints don't read as white bulbs.
    hsv = cv2.cvtColor(atlas, cv2.COLOR_BGR2HSV).astype(np.float32)
    for k in range(len(tiles)):
        gx, gy = k % GRID, k // GRID
        V = hsv[gy * TILE:(gy + 1) * TILE, gx * TILE:(gx + 1) * TILE, 2] / 255
        gain = np.clip(0.3 / max(float(np.percentile(V, 60)), 1e-3), 0.8, 2.0)
        x = np.clip((V * gain - 0.05) / 0.95, 0, None)   # lead below ~5% stays black
        y = x ** 0.75                                    # lift the mid-tones
        y = y / (y + 0.3) * 1.3                          # soft shoulder, 1 -> 1
        hsv[gy * TILE:(gy + 1) * TILE, gx * TILE:(gx + 1) * TILE, 2] = np.clip(y, 0, 1) * 255
    hsv[..., 1] = np.clip(hsv[..., 1] * 1.05, 0, 255)
    atlas = cv2.cvtColor(hsv.astype(np.uint8), cv2.COLOR_HSV2BGR)

    OUT_IMG.parent.mkdir(parents=True, exist_ok=True)
    cv2.imwrite(str(OUT_IMG), atlas, [cv2.IMWRITE_JPEG_QUALITY, 88])
    OUT_JSON.write_text(json.dumps({'cols': GRID, 'rows': rows, 'tiles': tiles}, indent=1) + '\n')
    print(f'{len(tiles)} tiles from {n} glass regions -> {OUT_IMG.relative_to(ROOT)}')


if __name__ == '__main__':
    main()
