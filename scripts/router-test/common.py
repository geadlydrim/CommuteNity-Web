"""Shared helpers for the router test harness (stdlib + requests/pyproj/shapely)."""
import json, os, time, hashlib, math
import requests
from pyproj import Transformer
from shapely.geometry import LineString, Point
from shapely.ops import transform

HOME = os.path.expanduser(os.environ.get("ROUTER_HOME", "~/.cache/commutenity/router"))
UA = "CommuteNity-router-test/0.1 (research; https://github.com/geadlydrim/CommuteNity-Web)"
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "docs", "research", "router-test")
VALHALLA = "http://127.0.0.1:8002"
OSRM = "http://127.0.0.1:5000"

_to_utm = Transformer.from_crs(4326, 32651, always_xy=True).transform
_to_ll = Transformer.from_crs(32651, 4326, always_xy=True).transform


def utm(coords):
    """[(lng,lat)...] -> shapely LineString in EPSG:32651 metres."""
    return LineString([_to_utm(x, y) for x, y in coords])


def to_utm_pt(lng, lat):
    return _to_utm(lng, lat)


def to_ll_pt(x, y):
    return _to_ll(x, y)


def haversine_m(a, b):
    """a, b = (lng, lat)."""
    r = 6371008.8
    p1, p2 = math.radians(a[1]), math.radians(b[1])
    dphi, dl = p2 - p1, math.radians(b[0] - a[0])
    h = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(h))


def cached_post(url, key, **kw):
    """POST/GET with an on-disk cache keyed by `key` (used for Overpass/Nominatim)."""
    d = os.path.join(HOME, "http-cache")
    os.makedirs(d, exist_ok=True)
    p = os.path.join(d, hashlib.sha1(key.encode()).hexdigest() + ".json")
    if os.path.exists(p):
        return json.load(open(p))
    r = requests.request(kw.pop("method", "POST"), url, headers={"User-Agent": UA}, timeout=300, **kw)
    r.raise_for_status()
    data = r.json()
    json.dump(data, open(p, "w"))
    time.sleep(2)  # be polite to public services
    return data


def decode_polyline(s, precision=6):
    """Google/Valhalla encoded polyline -> [(lng, lat), ...]."""
    coords, i, lat, lng, f = [], 0, 0, 0, 10.0 ** precision
    while i < len(s):
        for which in (0, 1):
            shift = result = 0
            while True:
                b = ord(s[i]) - 63
                i += 1
                result |= (b & 0x1F) << shift
                shift += 5
                if b < 0x20:
                    break
            d = ~(result >> 1) if result & 1 else result >> 1
            if which == 0:
                lat += d
            else:
                lng += d
        coords.append((lng / f, lat / f))
    return coords


def valhalla_route(points, costing="auto", options=None, timeout=60):
    """points = [(lng,lat)...]; first/last are `break`, the rest `through`.
    Returns (coords, summary dict) or raises RuntimeError with the engine's message."""
    locs = []
    for i, (x, y) in enumerate(points):
        t = "break" if i in (0, len(points) - 1) else "through"
        locs.append({"lon": x, "lat": y, "type": t})
    body = {"locations": locs, "costing": costing, "directions_type": "none"}
    if options:
        body["costing_options"] = {costing: options}
    r = requests.post(VALHALLA + "/route", json=body, timeout=timeout)
    if r.status_code != 200:
        try:
            msg = r.json().get("error", r.text)
        except Exception:
            msg = r.text
        raise RuntimeError(f"valhalla {r.status_code}: {msg}")
    j = r.json()
    trip = j["trip"]
    shape = []
    for leg in trip["legs"]:
        shape += decode_polyline(leg["shape"], 6)
    return shape, {"km": trip["summary"]["length"], "seconds": trip["summary"]["time"], "legs": len(trip["legs"])}


def osrm_route(points, timeout=60):
    path = ";".join(f"{x:.6f},{y:.6f}" for x, y in points)
    r = requests.get(f"{OSRM}/route/v1/driving/{path}", params={"overview": "full", "geometries": "geojson", "steps": "false"}, timeout=timeout)
    j = r.json()
    if j.get("code") != "Ok":
        raise RuntimeError(f"osrm {j.get('code')}: {j.get('message')}")
    rt = j["routes"][0]
    return [tuple(c) for c in rt["geometry"]["coordinates"]], {"km": rt["distance"] / 1000, "seconds": rt["duration"]}


def osrm_up():
    try:
        return requests.get(OSRM + "/route/v1/driving/120.98,14.60;121.05,14.62", timeout=3).status_code == 200
    except Exception:
        return False
