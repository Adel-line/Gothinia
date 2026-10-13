"""
Traces the rose window — stone AND glass — from a photograph of the real one.

Source: References/IMG_6251.jpg, own photo of the south rose of Notre-Dame de
Paris (c. 1260), shot near head-on. The rose has 12-fold rotational symmetry
(twelve inner lights doubling to twenty-four) with a mirror axis in every
sector, which is what lets a partly occluded photo give a complete window.

Pipeline
  1. Segment stone from glass in the photo (stone is dull grey-brown).
  2. Unwrap the rose into polar coordinates (the photo is foreshortened, so
     the rose is an ellipse there) and take the best-photographed sector,
     mirror-symmetrised, as the canonical one.
  3. Re-wrap that sector 12 times: a clean full-rose glass mask. Its contours
     are the openings, so stone bars can never overlap or cut each other —
     every hole is a real opening of the real window.
  4. A stone relief (normal map) from distance-to-glass: every bar gets the
     same rounded roll at its edges, however wide it is.
  5. The glass image: each point takes the photographed glass at the same
     place in the rose, or, where the photo is cropped or behind the railing,
     the same place one sector over.

    python3 tools/trace_rose.py
    -> src/scenes/roseWindow/roseTracery.json   openings + callout anchors
    -> public/textures/rose-glass.jpg           full rose, glass only
    -> public/textures/rose-stone-normal.jpg    moulding relief, plate face

Needs: numpy, scipy, opencv-python-headless.
"""

import json
import math
import sys
from pathlib import Path

import cv2
import numpy as np
from scipy import ndimage

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'References' / 'IMG_6251.jpg'
OUT_JSON = ROOT / 'src' / 'scenes' / 'roseWindow' / 'roseTracery.json'
OUT_GLASS = ROOT / 'public' / 'textures' / 'rose-glass.jpg'
OUT_NORMAL = ROOT / 'public' / 'textures' / 'rose-stone-normal.jpg'

# Rose in the photo (pixels), fitted by maximising its 12-fold symmetry; the
# radius is where the outermost glass ends.
CX, CY = 1139.0, 1536.0
RX = 1165.0
RY = RX * 853.0 / 1026.0
RAIL_Y = 2405.0  # gallery railing crosses the lower rose below this
SECTORS = 12

# Normalised units: 1.0 = outer edge of the glazing. The stone plate runs a
# little further, to the rim mouldings.
PLATE_R = 1.09
TEX = 4096  # glass + relief textures cover [-PLATE_R, PLATE_R]^2

P = 720  # polar columns per sector
NT = P * SECTORS
NR = 1400
DEBUG = '--debug' in sys.argv
MIRROR = '--no-mirror' not in sys.argv


def glass_mask(img: np.ndarray) -> np.ndarray:
    """1 = opening, 0 = stone. Stone is the consistent class: dull (low
    saturation) and mid-bright; glass is saturated, its lead dark and its
    glints bright. Small specks either way are noise."""
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV).astype(np.float32) / 255
    s, v = hsv[..., 1], hsv[..., 2]
    stone = ((s < 0.33) & (v > 0.10) & (v < 0.8)).astype(np.uint8)
    stone = cv2.morphologyEx(stone, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    lab, n = ndimage.label(stone)
    sizes = ndimage.sum(stone, lab, range(1, n + 1))
    stone = np.isin(lab, np.nonzero(sizes >= 600)[0] + 1).astype(np.uint8)
    stone = cv2.morphologyEx(stone, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))
    return (1 - stone).astype(np.float32)


def polar_maps(h: int, w: int):
    th = np.arange(NT) / NT * 2 * np.pi
    r = (np.arange(NR) + 0.5) / NR * PLATE_R
    tt, rr = np.meshgrid(th, r)
    mx = (CX + rr * RX * np.cos(tt)).astype(np.float32)
    my = (CY - rr * RY * np.sin(tt)).astype(np.float32)
    valid = (mx > 3) & (mx < w - 4) & (my > 3) & (my < RAIL_Y)
    return mx, my, valid


def cart_to_polar_index():
    """For each texture pixel: (row, col) into the polar arrays, and radius."""
    s = (np.arange(TEX) + 0.5) / TEX * 2 - 1
    x, y = np.meshgrid(s * PLATE_R, -s * PLATE_R)  # row 0 = top = +y
    r = np.hypot(x, y)
    th = np.mod(np.arctan2(y, x), 2 * np.pi)
    row = (r / PLATE_R * NR - 0.5).astype(np.float32)
    col = (th / (2 * np.pi) * NT).astype(np.float32)
    return row, col, r


def smooth_contour(c: np.ndarray, sigma: float = 4.0) -> np.ndarray:
    """Resample a closed pixel contour evenly, smooth it (dressed stone has
    clean curves, not pixel steps), then drop redundant points."""
    seg = np.hypot(*np.diff(np.vstack([c, c[:1]]), axis=0).T)
    t = np.concatenate([[0], np.cumsum(seg)])
    n = max(int(t[-1]), 8)
    u = np.linspace(0, t[-1], n, endpoint=False)
    closed = np.vstack([c, c[:1]])
    xy = np.stack([np.interp(u, t, closed[:, 0]), np.interp(u, t, closed[:, 1])], 1)
    xy = ndimage.gaussian_filter1d(xy, sigma, axis=0, mode='wrap')
    return cv2.approxPolyDP(xy.astype(np.float32)[:, None, :], 0.7, True)[:, 0, :].astype(np.float64)


def mirror_axis(sector_mean: np.ndarray) -> int:
    """Column (0..P-1) of the mirror axis within a sector."""
    best, best_a = -1e9, 0
    A = sector_mean - sector_mean.mean()
    for a in range(P):
        idx_l = (a - np.arange(1, P // 2)) % P
        idx_r = (a + np.arange(1, P // 2)) % P
        s = float((A[:, idx_l] * A[:, idx_r]).sum())
        if s > best:
            best, best_a = s, a
    return best_a


def main() -> None:
    img = cv2.imread(str(SRC), cv2.IMREAD_COLOR)
    if img is None:
        raise SystemExit(f'cannot read {SRC}')
    h, w = img.shape[:2]
    mask = glass_mask(img)
    mx, my, valid = polar_maps(h, w)
    Mp = cv2.remap(mask, mx, my, cv2.INTER_LINEAR)
    Cp = cv2.remap(img, mx, my, cv2.INTER_CUBIC)
    V = valid.astype(np.float32)

    # ---- canonical sector ---------------------------------------------------
    stack = Mp.reshape(NR, SECTORS, P)
    vstack = V.reshape(NR, SECTORS, P)
    mean0 = (stack * vstack).sum(1) / np.maximum(vstack.sum(1), 1)
    axis = mirror_axis(mean0)
    start = (axis - P // 2) % P  # sector = [axis - P/2, axis + P/2)
    # The canonical sector is the single best-photographed one — the sector
    # at the top, square to the camera — not an average: averaging sectors
    # that the perspective has slightly misaligned turns the rim's foiled
    # lights into blobs. Its two halves are averaged about the mirror axis.
    Mr = np.roll(Mp, -start, axis=1).reshape(NR, SECTORS, P)
    top = int(((math.pi / 2) / (2 * math.pi) * NT - start) // P) % SECTORS
    canon = Mr[:, top, :]
    if MIRROR:
        canon = 0.5 * (canon + canon[:, ::-1])
    canon = cv2.GaussianBlur(canon, (0, 0), 2.0)

    # ---- full clean mask in texture space -----------------------------------
    row, col, rad = cart_to_polar_index()
    ccol = np.mod(col - start, P).astype(np.float32)
    canon_wrap = np.concatenate([canon, canon[:, :1]], axis=1)  # wrap edge
    full = cv2.remap(canon_wrap, ccol, row, cv2.INTER_LINEAR)
    full[rad > 1.0] = 0
    glass = (full > 0.5).astype(np.uint8)
    # knock off teeth and fill notches the photo's lighting left on edges;
    # dressed stone has clean curves
    disk = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (13, 13))
    glass = cv2.morphologyEx(glass, cv2.MORPH_OPEN, disk)
    glass = cv2.morphologyEx(glass, cv2.MORPH_CLOSE, disk)
    # stone specks inside a light (lead lines, glints) are not tracery, and
    # dot-sized "openings" are noise
    glass = ndimage.binary_fill_holes(glass).astype(np.uint8)
    lab, n = ndimage.label(glass)
    sizes = ndimage.sum(glass, lab, range(1, n + 1))
    glass = np.isin(lab, np.nonzero(sizes >= 2500)[0] + 1).astype(np.uint8)
    if DEBUG:
        cv2.imwrite(str(ROOT / 'tools' / 'debug-rose-mask.png'), glass * 255)

    # ---- openings (contours) ------------------------------------------------
    px = 2 * PLATE_R / TEX  # normalised units per texture pixel
    contours, _ = cv2.findContours(glass, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    openings = []
    for c in contours:
        c = smooth_contour(c[:, 0, :].astype(np.float64))
        if len(c) < 4:
            continue
        pts = np.stack([(c[:, 0] + 0.5) * px - PLATE_R, PLATE_R - (c[:, 1] + 0.5) * px], 1)
        cxy = pts.mean(0)
        openings.append({
            'r': round(float(np.hypot(*cxy)), 4),
            'theta': round(float(math.atan2(cxy[1], cxy[0])), 4),
            'points': [round(float(v), 5) for v in pts.reshape(-1)],
        })
    openings.sort(key=lambda o: (o['r'], o['theta']))

    # narrowest stone bar between openings (for sizing the edge roll)
    stone = (1 - glass).astype(np.uint8)
    stone[rad > 1.0] = 0
    dist = ndimage.distance_transform_edt(stone)
    # bar width ≈ 2 × ridge height of the distance field; take a low
    # percentile of ridge pixels inside the glazed field
    ridge = (dist == ndimage.maximum_filter(dist, 5)) & (dist > 1) & (rad < 0.98)
    bar_half_px = float(np.percentile(dist[ridge], 5))

    # ---- stone relief -------------------------------------------------------
    stone_all = (1 - glass).astype(np.uint8)
    d = ndimage.distance_transform_edt(stone_all)
    W = max(bar_half_px * 0.9, 3.0)  # roll radius never exceeds half a bar
    t = np.clip(d / W, 0, 1)
    hgt = np.sqrt(1 - (1 - t) ** 2)  # quarter-round roll at every glass edge
    hgt -= 0.18 * np.exp(-(((d - W * 1.35) / (0.35 * W)) ** 2))  # fillet beside it
    hgt = cv2.GaussianBlur(hgt.astype(np.float32), (0, 0), 0.8)
    gy, gx = np.gradient(hgt * W)  # height in pixel units -> slopes
    nx, ny, nz = -gx, gy, np.ones_like(gx)  # image rows run down, +y is up
    norm = np.sqrt(nx * nx + ny * ny + nz * nz)
    nmap = np.stack([nx / norm, ny / norm, nz / norm], -1)
    nmap[glass > 0] = (0, 0, 1)
    nimg = ((nmap * 0.5 + 0.5) * 255).astype(np.uint8)[..., ::-1]  # RGB -> BGR

    # ---- glass image --------------------------------------------------------
    # nearest real glass for any photographed stone or lead outside the
    # clean openings, so no grey sliver shows at an opening's edge
    gsrc = Mp > 0.5
    _, (iy, ix) = ndimage.distance_transform_edt(~gsrc, return_indices=True)
    Cf = Cp[iy, ix]
    Gf = gsrc[iy, ix] & valid[iy, ix]
    # where this spot is out of frame / behind the railing, borrow the same
    # spot from the nearest sector that is visible
    out = np.zeros_like(Cf)
    have = np.zeros(valid.shape, bool)
    for k in (0, 1, -1, 2, -2, 3, -3, 4, -4, 5, -5, 6):
        sh = k * P
        ok = np.roll(valid, -sh, 1) & ~have
        out[ok] = np.roll(Cf, -sh, 1)[ok]
        have |= ok
    Cg = out

    # tone it as a light source: lift the mid-tones on value (keeps hue), keep
    # lead dark, even out the rim the phone metered darker, roll off glints
    hsv = cv2.cvtColor(Cg, cv2.COLOR_BGR2HSV).astype(np.float32)
    Vv = hsv[..., 2] / 255
    rows_med = np.array([np.percentile(Vv[i][Vv[i] > 0.05], 60) if (Vv[i] > 0.05).any() else 0.3
                         for i in range(NR)])
    rows_med = ndimage.uniform_filter1d(rows_med, 31)
    gain = np.clip(0.3 / np.maximum(rows_med, 1e-3), 0.8, 2.0)[:, None]
    x = np.clip((Vv * gain - 0.05) / 0.95, 0, None)
    y = x ** 0.75
    y = y / (y + 0.3) * 1.3
    hsv[..., 2] = np.clip(y, 0, 1) * 255
    Cg = cv2.cvtColor(hsv.astype(np.uint8), cv2.COLOR_HSV2BGR)

    Cg_wrap = np.concatenate([Cg, Cg[:, :1]], axis=1)
    gimg = cv2.remap(Cg_wrap, col, row, cv2.INTER_LINEAR)
    gimg[rad > 1.02] = 0

    # ---- callout anchors (normalised units) ---------------------------------
    def pick(r_lo, r_hi, theta):
        cands = [o for o in openings if r_lo <= o['r'] <= r_hi]
        return min(cands, key=lambda o: abs(math.remainder(o['theta'] - theta, 2 * math.pi)))

    inner = [o for o in openings if 0.2 < o['r'] < 0.5]
    inner_r = float(np.median([o['r'] for o in inner]))
    near = sorted(inner, key=lambda o: abs(math.remainder(o['theta'] - math.radians(100), 2 * math.pi)))[:2]
    mull_t = math.atan2(sum(math.sin(o['theta']) for o in near), sum(math.cos(o['theta']) for o in near))
    pane = pick(0.5, 0.75, math.radians(50))
    outer = max(openings, key=lambda o: o['r'] - 0.3 * abs(math.remainder(o['theta'] + math.radians(35), 2 * math.pi)))
    anchors = {
        'oculus': [0.0, 0.0],
        'mullion': [inner_r * math.cos(mull_t), inner_r * math.sin(mull_t)],
        'trefoil': [outer['r'] * math.cos(outer['theta']), outer['r'] * math.sin(outer['theta'])],
        'pane': [pane['r'] * math.cos(pane['theta']), pane['r'] * math.sin(pane['theta'])],
    }

    OUT_GLASS.parent.mkdir(parents=True, exist_ok=True)
    cv2.imwrite(str(OUT_GLASS), gimg, [cv2.IMWRITE_JPEG_QUALITY, 84])
    cv2.imwrite(str(OUT_NORMAL), nimg, [cv2.IMWRITE_JPEG_QUALITY, 90])
    OUT_JSON.write_text(json.dumps({
        'source': 'References/IMG_6251.jpg (Notre-Dame de Paris, south rose)',
        'sectors': SECTORS,
        'plateRadius': PLATE_R,
        'barHalfWidth': round(bar_half_px * px, 5),
        'anchors': {k: [round(v[0], 4), round(v[1], 4)] for k, v in anchors.items()},
        'openings': openings,
    }) + '\n')
    print(f'{len(openings)} openings, mirror axis col {axis}, '
          f'min half-bar {bar_half_px * px:.4f}, json {OUT_JSON.stat().st_size // 1024} KB')


if __name__ == '__main__':
    main()
