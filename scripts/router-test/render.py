"""Render corridor PNGs from results.json + $ROUTER_HOME/run/geometry.json over cached OSM raster tiles.
Tiles: https://tile.openstreetmap.org (identifying User-Agent, on-disk cache, hard cap of 300 distinct tiles)."""
import io, json, math, os, re, sys, time
import requests
from PIL import Image, ImageDraw, ImageFont
from common import HOME, UA, OUT

TILE_DIR = os.path.join(HOME, "tiles")
os.makedirs(TILE_DIR, exist_ok=True)
MAX_TILES = 300
W, H = 800, 520
RES = json.load(open(os.path.join(OUT, "results.json")))
GEO = json.load(open(os.path.join(HOME, "run", "geometry.json")))
ATTR = "© OpenStreetMap contributors"

def font(names, size):
    for n in names:
        try:
            return ImageFont.truetype(n, size)
        except OSError:
            pass
    return ImageFont.load_default(size)


REG = ["LiberationSans-Regular.ttf", "/usr/share/fonts/liberation-sans-fonts/LiberationSans-Regular.ttf", "DejaVuSans.ttf", "/usr/share/fonts/open-sans/OpenSans-Regular.ttf"]
BOLD = ["LiberationSans-Bold.ttf", "/usr/share/fonts/liberation-sans-fonts/LiberationSans-Bold.ttf", "DejaVuSans-Bold.ttf", "/usr/share/fonts/open-sans/OpenSans-Bold.ttf"]
F, FB, FS = font(REG, 14), font(BOLD, 13), font(REG, 11)


def merc(lng, lat, z):
    n = 256 * 2 ** z
    x = (lng + 180) / 360 * n
    y = (1 - math.log(math.tan(math.radians(lat)) + 1 / math.cos(math.radians(lat))) / math.pi) / 2 * n
    return x, y


def tile(z, x, y):
    p = os.path.join(TILE_DIR, f"{z}_{x}_{y}.png")
    if not os.path.exists(p):
        if len(os.listdir(TILE_DIR)) >= MAX_TILES:
            raise SystemExit(f"tile cap {MAX_TILES} reached")
        for attempt in range(4):
            try:
                r = requests.get(f"https://tile.openstreetmap.org/{z}/{x}/{y}.png", headers={"User-Agent": UA}, timeout=(5, 15))
                r.raise_for_status()
                break
            except requests.RequestException as e:
                print("tile retry", z, x, y, e, flush=True)
                if attempt == 3:
                    raise
                time.sleep(2 * (attempt + 1))
        open(p, "wb").write(r.content)
        time.sleep(0.3)
    return Image.open(p).convert("RGB")


def view(points):
    """Pick zoom + origin so all points fit in W x H with padding."""
    lngs, lats = [p[0] for p in points], [p[1] for p in points]
    for z in range(17, 8, -1):
        xs, ys = zip(*(merc(x, y, z) for x, y in zip(lngs, lats)))
        if max(xs) - min(xs) <= W - 90 and max(ys) - min(ys) <= H - 90:
            break
    cx, cy = (min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2
    return z, cx - W / 2, cy - H / 2


def basemap(z, ox, oy):
    img = Image.new("RGB", (W, H), (230, 230, 230))
    for tx in range(int(ox // 256), int((ox + W) // 256) + 1):
        for ty in range(int(oy // 256), int((oy + H) // 256) + 1):
            img.paste(tile(z, tx, ty), (round(tx * 256 - ox), round(ty * 256 - oy)))
    return img


def px(coords, z, ox, oy):
    return [(merc(x, y, z)[0] - ox, merc(x, y, z)[1] - oy) for x, y in coords]


def dashed(d, pts, fill, width, on=14, off=9):
    carry, draw = 0.0, True
    for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
        L = math.hypot(x1 - x0, y1 - y0)
        pos = 0.0
        while pos < L:
            step = min((on if draw else off) - carry, L - pos)
            if draw:
                d.line([(x0 + (x1 - x0) * pos / L, y0 + (y1 - y0) * pos / L), (x0 + (x1 - x0) * (pos + step) / L, y0 + (y1 - y0) * (pos + step) / L)], fill=fill, width=width)
            pos += step
            carry += step
            if carry >= (on if draw else off) - 1e-9:
                draw, carry = not draw, 0.0


def marker(d, xy, text, fill, r=11):
    x, y = xy
    d.ellipse([x - r, y - r, x + r, y + r], fill=fill, outline=(255, 255, 255), width=2)
    w = d.textlength(text, font=FB)
    d.text((x - w / 2, y - 8), text, fill=(255, 255, 255), font=FB)


def via_marker(d, xy, n):
    x, y = xy
    d.ellipse([x - 11, y - 11, x + 11, y + 11], fill=(255, 255, 255), outline=(30, 30, 30), width=2)
    w = d.textlength(str(n), font=FB)
    d.text((x - w / 2, y - 8), str(n), fill=(30, 30, 30), font=FB)


def legend(d, lines, x=10, y=10):
    w = max(d.textlength(t, font=F) for _, t in lines) + 44
    h = 8 + 20 * len(lines)
    d.rectangle([x, y, x + w, y + h], fill=(255, 255, 255, 225), outline=(120, 120, 120, 255))
    for i, (style, t) in enumerate(lines):
        yy = y + 14 + 20 * i
        col, kind = style
        if kind == "dash":
            dashed(d, [(x + 8, yy), (x + 30, yy)], col, 4, 6, 4)
        elif kind == "thick":
            d.line([(x + 8, yy), (x + 30, yy)], fill=col, width=10)
        else:
            d.line([(x + 8, yy), (x + 30, yy)], fill=col, width=4)
        d.text((x + 38, yy - 8), t, fill=(20, 20, 20), font=F)


def attribution(d):
    w = d.textlength(ATTR, font=FS)
    d.rectangle([W - w - 12, H - 18, W, H], fill=(255, 255, 255, 215))
    d.text((W - w - 6, H - 16), ATTR, fill=(40, 40, 40), font=FS)


GREY = (90, 90, 90, 110)
BLUE = (0, 70, 255, 255)
ORANGE = (255, 120, 0, 255)
MAGENTA = (225, 0, 140, 255)
GREEN = (0, 150, 60, 255)
RED = (200, 30, 30, 255)


def panel(base, layers, z, ox, oy, legend_lines, ends=None, vias=None):
    img = base.copy().convert("RGBA")
    ov = Image.new("RGBA", img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(ov)
    for coords, col, width, dash in layers:
        pts = px(coords, z, ox, oy)
        if dash:
            dashed(d, pts, col, width)
        else:
            d.line(pts, fill=col, width=width, joint="curve")
    if ends:
        marker(d, px([ends[0]], z, ox, oy)[0], "A", GREEN)
        marker(d, px([ends[1]], z, ox, oy)[0], "B", RED)
    for i, v in enumerate(vias or [], 1):
        via_marker(d, px([v], z, ox, oy)[0], i)
    legend(d, legend_lines)
    attribution(d)
    return Image.alpha_composite(img, ov).convert("RGB")


def save(img, name):
    img = img.quantize(colors=128, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.NONE)
    p = os.path.join(OUT, name)
    img.save(p, optimize=True)
    print(name, os.path.getsize(p) // 1024, "KB", flush=True)


def car_images():
    for row in RES["car"]:
        g = GEO.get(f"car:{row['id']}")
        if not g or "valhalla" not in g:
            continue
        pts = g["ref"] + g["valhalla"] + g.get("reshaped", []) + g.get("osrm", [])
        z, ox, oy = view(pts)
        base = basemap(z, ox, oy)
        v = row["valhalla"]
        lines = [((GREY, "thick"), f"OSM relation {row['id']} (reference)"),
                 ((BLUE, "line"), f"Valhalla auto, no vias: {v['overlap_ref']:.0%} / {v['overlap_path']:.0%} overlap, {v['verdict']}")]
        layers = [(g["ref"], GREY, 12, False), (g["valhalla"], BLUE, 5, False)]
        if "osrm" in g:
            layers.append((g["osrm"], ORANGE, 4, True))
            o = row["osrm"]
            lines.append(((ORANGE, "dash"), f"OSRM car: {o['overlap_ref']:.0%} / {o['overlap_path']:.0%}"))
        p1 = panel(base, layers, z, ox, oy, lines, ends=(g["ref"][0], g["ref"][-1]))
        vs = row.get("via_sim")
        if vs and "reshaped" in g:
            lines2 = [((GREY, "thick"), row["label"] + f" (zoom {z})"), ((MAGENTA, "line"), f"Reshaped with {vs['vias_used']} via(s): {vs['final_overlap_ref']:.0%} / {vs['final_overlap_path']:.0%}")]
            p2 = panel(base, [(g["ref"], GREY, 12, False), (g["reshaped"], MAGENTA, 5, False)], z, ox, oy, lines2, ends=(g["ref"][0], g["ref"][-1]), vias=g.get("vias"))
        else:
            p2 = base
        both = Image.new("RGB", (2 * W + 6, H), (255, 255, 255))
        both.paste(p1, (0, 0)); both.paste(p2, (W + 6, 0))
        save(both, f"car-{row['id']}.png")


def slug(s):
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


def walk_images():
    for row in RES["walk"]:
        g = GEO.get("walk:" + row["label"])
        if not g or "pedestrian" not in g:
            continue
        pd, au = row["pedestrian"], row.get("auto", {})
        # when the car detour is much longer, frame the walk and let the car path run off the image
        framed_on_walk = au.get("km", 0) > 3 * pd["km"]
        z, ox, oy = view(g["pedestrian"] if framed_on_walk else g["pedestrian"] + g.get("auto", []))
        base = basemap(z, ox, oy)
        lines = [((MAGENTA, "line"), f"Pedestrian: {pd['km'] * 1000:.0f} m, {pd['minutes']:.0f} min"), ((BLUE, "dash"), f"Auto: {au.get('km', 0) * 1000:.0f} m, {au.get('minutes', 0):.0f} min" + (" (runs off the image)" if framed_on_walk else "")),
                 ((GREY, "line"), f"Straight line {row['straight_m']} m")]
        layers = [([g["pedestrian"][0], g["pedestrian"][-1]], (60, 60, 60, 200), 2, True)]
        layers += [(g["auto"], BLUE, 5, True)] if "auto" in g else []
        layers += [(g["pedestrian"], MAGENTA, 6, False)]
        img = panel(base, layers, z, ox, oy, lines, ends=(g["pedestrian"][0], g["pedestrian"][-1]))
        save(img, f"walk-{slug(row['label'])}.png")


if __name__ == "__main__":
    what = sys.argv[1:] or ["car", "walk"]
    if "car" in what: car_images()
    if "walk" in what: walk_images()
    print("tiles cached:", len(os.listdir(TILE_DIR)))
