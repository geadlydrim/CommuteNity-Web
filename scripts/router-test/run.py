"""Run the router test: car corridors, via simulation, walking, existing posts, latency.
Usage: run.py [car] [walk] [posts] [latency]   (no args = all). Results merge into docs/research/router-test/results.json;
geometry for the renderer goes to $ROUTER_HOME/run/geometry.json (outside the repo)."""
import json, os, random, statistics, sys, time, collections, datetime
import requests
from shapely.geometry import LineString, Point, MultiLineString
from shapely.ops import linemerge
from common import *
from refs import all_candidates
import overpass

TOL = 25.0           # metres: "within" threshold
STOP = 0.95          # via simulation stops when both overlaps reach this
MAX_VIAS = 10

# (relation id, corridor label). Chosen from the stitched relations; see the doc's Method section.
SELECTED = [
    (14885756, "España Boulevard"),
    (14885770, "Cubao to Divisoria via Aurora"),
    (9856704, "Quezon Avenue to Fairview"),
    (14878113, "Commonwealth Avenue"),
    (8202646, "Commonwealth to SM Fairview"),
    (19701253, "Taft Avenue"),
    (14885760, "Taft Avenue to Monumento"),
    (21293817, "Mabini / Taft side streets"),
    (9453755, "EDSA Carousel"),
    (15093996, "M.H. del Pilar to Divisoria"),
    (15094000, "Imelda / SSH south"),
    (4515957, "Katipunan to North EDSA"),
]

os.makedirs(os.path.join(HOME, "run"), exist_ok=True)
GEO_PATH = os.path.join(HOME, "run", "geometry.json")
RES_PATH = os.path.join(OUT, "results.json")
os.makedirs(OUT, exist_ok=True)


def load(p, default):
    return json.load(open(p)) if os.path.exists(p) else default


RES = load(RES_PATH, {})
GEO = load(GEO_PATH, {})


def save():
    json.dump(RES, open(RES_PATH, "w"), indent=1, ensure_ascii=False)
    json.dump(GEO, open(GEO_PATH, "w"))


def r5(coords):
    return [[round(x, 5), round(y, 5)] for x, y in coords]


def overlaps(ref_u, path_u):
    bp, br = path_u.buffer(TOL), ref_u.buffer(TOL)
    return ref_u.intersection(bp).length / ref_u.length, path_u.intersection(br).length / path_u.length


def verdict(o_ref, o_path):
    m = min(o_ref, o_path)
    return "useful default" if m >= 0.90 else "close" if m >= 0.75 else "off"


def off_stretches(ref_u, path_u):
    """Maximal stretches of the reference farther than TOL from the path, longest first."""
    d = ref_u.difference(path_u.buffer(TOL))
    if d.is_empty:
        return []
    if d.geom_type == "MultiLineString":
        d = linemerge(d)
    parts = [d] if d.geom_type == "LineString" else list(d.geoms)
    return sorted((p for p in parts if p.geom_type == "LineString"), key=lambda p: -p.length)


def ll(pt_u):
    return to_ll_pt(pt_u.x, pt_u.y)


# --------------------------------------------------------------------------- car corridors
def way_notes(ref_u, owners, tags, stretch):
    """OSM tags of the reference ways that lie on an off-path stretch."""
    ref_vertices = list(ref_u.coords)
    cum, acc = [], 0.0
    for i, v in enumerate(ref_vertices):
        if i:
            acc += Point(ref_vertices[i - 1]).distance(Point(v))
        cum.append(acc)
    import bisect
    out = collections.OrderedDict()
    n = max(2, int(stretch.length // 25))
    for k in range(n + 1):
        s = ref_u.project(stretch.interpolate(stretch.length * k / n))
        i = min(bisect.bisect_left(cum, s), len(owners) - 1)
        wid = owners[i][0]
        if wid not in out:
            t = tags.get(wid, {})
            out[wid] = {k2: t[k2] for k2 in ("name", "highway", "oneway", "access", "bus", "psv", "motor_vehicle", "vehicle", "service", "junction", "lanes") if k2 in t}
            out[wid]["way"] = wid
    return list(out.values())


def car():
    cands, rej = all_candidates()
    flat = {s["id"]: s for m in cands for s in cands[m]}
    all_rel = {m: len(cands[m]) + sum(len(v) for v in rej[m].values()) for m in cands}
    RES["reference_pool"] = {m: {"relations": all_rel[m], "stitched": len(cands[m]), "rejected": sum(len(v) for v in rej[m].values()), "reasons": {k: len(v) for k, v in rej[m].items()}} for m in cands}
    sel = [(flat[i], label) for i, label in SELECTED]
    tags = overpass.way_tags([w for s, _ in sel for w, _f in set(s["owners"])])
    osrm = osrm_up()
    RES["osrm_up"] = osrm
    corridors = []
    for s, label in sel:
        ref_ll, owners = s["coords"], s["owners"]
        ref_u = utm(ref_ll)
        start, end = ref_ll[0], ref_ll[-1]
        row = {"id": s["id"], "label": label, "name": s["name"], "ref": s["ref"], "mode": s["mode"], "operator": s["operator"],
               "length_km": round(s["length_km"], 2), "straight_km": round(s["straight_km"], 2), "last_edit": s["timestamp"], "n_ways": s["n_ways"],
               "start": [round(start[0], 5), round(start[1], 5)], "end": [round(end[0], 5), round(end[1], 5)]}
        geo = {"ref": r5(ref_ll)}
        # one-way check: how much of the reference runs against a oneway=yes way (or with a oneway=-1 way)
        pu = list(ref_u.coords)
        contra = oneway = 0.0
        for i in range(1, len(pu)):
            seg = Point(pu[i - 1]).distance(Point(pu[i]))
            wid, fwd = owners[i]
            ow = tags.get(wid, {}).get("oneway")
            if ow in ("yes", "true", "1"):
                oneway += seg; contra += 0 if fwd else seg
            elif ow == "-1":
                oneway += seg; contra += seg if fwd else 0
        row["oneway_share"] = round(oneway / ref_u.length, 3)
        row["contraflow_m"] = round(contra)
        # 1. default path, no vias
        try:
            path, sm = valhalla_route([start, end])
            p_u = utm(path)
            o_ref, o_path = overlaps(ref_u, p_u)
            row["valhalla"] = {"km": round(sm["km"], 2), "overlap_ref": round(o_ref, 3), "overlap_path": round(o_path, 3), "ratio": round(p_u.length / ref_u.length, 3), "verdict": verdict(o_ref, o_path)}
            geo["valhalla"] = r5(path)
            edges = trace_edges(path, "auto", extra=["edge.toll"]) or []
            by_name = collections.Counter()
            for e in edges:
                by_name[(e.get("names") or ["(unnamed)"])[0]] += e["length"]
            row["valhalla"]["top_roads"] = [[n, round(m, 1)] for n, m in by_name.most_common(5)]
            row["valhalla"]["motorway_km"] = round(sum(e["length"] for e in edges if e.get("road_class") == "motorway"), 2)
            row["valhalla"]["toll_km"] = round(sum(e["length"] for e in edges if e.get("toll")), 2)
            row["off_stretches"] = []
            for st in off_stretches(ref_u, p_u)[:4]:
                if st.length < 100:
                    continue
                mid = ll(st.interpolate(0.5, normalized=True))
                row["off_stretches"].append({"length_m": round(st.length), "at": [round(mid[0], 5), round(mid[1], 5)], "ref_ways": way_notes(ref_u, owners, tags, st)})
        except RuntimeError as e:
            row["valhalla"] = {"error": str(e)}
            path = None
        # 1b. extra, not asked for: the same query with toll roads and highways discouraged (use_tolls=0, use_highways=0)
        try:
            tp, tm = valhalla_route([start, end], "auto", {"use_tolls": 0.0, "use_highways": 0.0})
            t_u = utm(tp)
            a, b = overlaps(ref_u, t_u)
            row["valhalla_no_tolls"] = {"km": round(tm["km"], 2), "overlap_ref": round(a, 3), "overlap_path": round(b, 3), "ratio": round(t_u.length / ref_u.length, 3), "verdict": verdict(a, b)}
        except RuntimeError as e:
            row["valhalla_no_tolls"] = {"error": str(e)}
        # 2. OSRM
        if osrm:
            try:
                op, osm = osrm_route([start, end])
                op_u = utm(op)
                a, b = overlaps(ref_u, op_u)
                row["osrm"] = {"km": round(osm["km"], 2), "overlap_ref": round(a, 3), "overlap_path": round(b, 3), "ratio": round(op_u.length / ref_u.length, 3), "verdict": verdict(a, b)}
                geo["osrm"] = r5(op)
            except RuntimeError as e:
                row["osrm"] = {"error": str(e)}
        # 3. via simulation
        if path is not None:
            vias, hist, cur = [], [], path
            cur_u = p_u
            err = None
            while True:
                a, b = overlaps(ref_u, cur_u)
                hist.append({"vias": len(vias), "overlap_ref": round(a, 3), "overlap_path": round(b, 3), "km": round(cur_u.length / 1000, 2)})
                if (a >= STOP and b >= STOP) or len(vias) >= MAX_VIAS:
                    break
                offs = off_stretches(ref_u, cur_u)
                if not offs:  # reference fully covered; remaining shortfall is path length outside the reference
                    break
                mid = ll(offs[0].interpolate(0.5, normalized=True))
                vias.append(mid)
                vias.sort(key=lambda v: ref_u.project(Point(*to_utm_pt(*v))))
                try:
                    cur, _ = valhalla_route([start] + vias + [end])
                except RuntimeError as e:
                    err = str(e)
                    vias = [v for v in vias if v != mid]
                    break
                cur_u = utm(cur)
            ok = hist[-1]["overlap_ref"] >= STOP and hist[-1]["overlap_path"] >= STOP
            row["via_sim"] = {"reached": ok, "vias_used": len(vias), "history": hist, "final_overlap_ref": hist[-1]["overlap_ref"], "final_overlap_path": hist[-1]["overlap_path"],
                              "vias": [[round(x, 5), round(y, 5)] for x, y in vias], "error": err,
                              "summary": str(len(vias)) if ok else f">{MAX_VIAS} (reached {min(hist[-1]['overlap_ref'], hist[-1]['overlap_path']):.0%})" if len(vias) >= MAX_VIAS else f"stalled at {len(vias)} (reached {min(hist[-1]['overlap_ref'], hist[-1]['overlap_path']):.0%})"}
            geo["reshaped"] = r5(cur)
            geo["vias"] = [[round(x, 5), round(y, 5)] for x, y in vias]
        corridors.append(row)
        GEO["car:" + str(s["id"])] = geo
        print(label, row.get("valhalla"), row.get("via_sim", {}).get("summary"), flush=True)
    RES["car"] = corridors
    save()


# --------------------------------------------------------------------------- walking corridors
def find_anchor(els, pred):
    for e in els:
        if pred(e.get("tags", {})):
            c = e.get("center") or {"lat": e.get("lat"), "lon": e.get("lon")}
            return (c["lon"], c["lat"]), e["tags"].get("name"), f'{e["type"]}/{e["id"]}'
    return None


def trace_edges(shape, costing, extra=()):
    r = requests.post(VALHALLA + "/trace_attributes", json={
        "shape": [{"lat": y, "lon": x} for x, y in shape], "costing": costing, "shape_match": "walk_or_snap",
        "filters": {"attributes": ["edge.use", "edge.length", "edge.names", "edge.bridge", "edge.tunnel", "edge.sidewalk", "edge.road_class", *extra], "action": "include"}}, timeout=60)
    if r.status_code != 200:
        return None
    return r.json()["edges"]


# Walking anchors: OSM elements found through Overpass (overpass.anchors / overpass.cubao_mrt3).
# MRT-3 Cubao is the station node on EDSA, not the LRT-2 "Araneta Center - Cubao" building next to Gateway Mall.
ANCHORS = {
    "cubao": ("MRT-3 Cubao station", "node", 11329697351),
    "gateway": ("Gateway Mall 1", "way", 30146167),
    "quiapo": ("Quiapo Church", "way", 27086772),
    "carriedo": ("Carriedo LRT-1 station", "way", 288089644),
    "ayala": ("Ayala MRT-3 station", "way", 27663063),
    "glorietta": ("Glorietta mall", "way", 40190900),
    "recto": ("Recto LRT-2 station", "way", 179240108),
    "168": ("168 Shopping Mall", "way", 319524305),
}


def walk():
    els = {(e["type"], e["id"]): e for e in overpass.anchors() + overpass.cubao_mrt3()}
    pts = {}
    for k, (name, typ, i) in ANCHORS.items():
        e = els[(typ, i)]
        c = e.get("center") or e
        pts[k] = ((c["lon"], c["lat"]), name, f"{typ}/{i}")
    RES["walk_anchors"] = {k: {"name": v[1], "osm": v[2], "lng": round(v[0][0], 5), "lat": round(v[0][1], 5)} for k, v in pts.items()}
    corridors = [("Cubao MRT-3 to Gateway Mall", "cubao", "gateway"), ("Quiapo Church to Carriedo LRT-1", "quiapo", "carriedo"),
                 ("Ayala MRT-3 to Glorietta", "ayala", "glorietta"), ("Recto LRT-2 to 168 Mall", "recto", "168")]
    out = []
    for label, a, b in corridors:
        if pts[a] is None or pts[b] is None:
            out.append({"label": label, "error": "anchor missing: " + ", ".join(k for k in (a, b) if pts[k] is None)})
            continue
        pa, pb = pts[a][0], pts[b][0]
        row = {"label": label, "from": pts[a][1], "to": pts[b][1], "from_ll": [round(pa[0], 5), round(pa[1], 5)], "to_ll": [round(pb[0], 5), round(pb[1], 5)],
               "straight_m": round(haversine_m(pa, pb))}
        geo = {}
        try:
            path, sm = valhalla_route([pa, pb], "pedestrian")
        except RuntimeError as e:
            row["pedestrian"] = {"error": str(e)}
            out.append(row)
            continue
        geo["pedestrian"] = r5(path)
        edges = trace_edges(path, "pedestrian") or []
        total = sum(e["length"] for e in edges) or 1
        by_use = collections.Counter()
        for e in edges:
            by_use[e["use"]] += e["length"]
        sidewalk_m = sum(e["length"] for e in edges if e["use"] == "road" and e.get("sidewalk", "none") != "none") * 1000
        road_m = sum(e["length"] for e in edges if e["use"] == "road") * 1000
        bridge_m = sum(e["length"] for e in edges if e.get("bridge")) * 1000
        tunnel_m = sum(e["length"] for e in edges if e.get("tunnel")) * 1000
        bridge_foot = sum(e["length"] for e in edges if e.get("bridge") and e["use"] in ("footway", "pedestrian", "steps", "path", "sidewalk")) * 1000
        # compress to a readable sequence
        seq = []
        for e in edges:
            key = (e["use"], tuple(e.get("names", [])[:1]), bool(e.get("bridge")), bool(e.get("tunnel")))
            if seq and seq[-1][0] == key:
                seq[-1][1] += e["length"] * 1000
            else:
                seq.append([key, e["length"] * 1000])
        row["pedestrian"] = {"km": round(sm["km"], 3), "minutes": round(sm["seconds"] / 60, 1), "ratio": round(sm["km"] * 1000 / row["straight_m"], 2),
                             "use_share": {k: round(v / total, 3) for k, v in by_use.most_common()},
                             "road_m": round(road_m), "road_with_mapped_sidewalk_m": round(sidewalk_m), "bridge_m": round(bridge_m), "bridge_footway_m": round(bridge_foot), "tunnel_m": round(tunnel_m),
                             "steps_m": round(by_use.get("steps", 0) * 1000), "elevator_m": round(by_use.get("elevator", 0) * 1000), "escalator_m": round(by_use.get("escalator", 0) * 1000),
                             "crossings": sum(1 for e in edges if e["use"] == "pedestrian_crossing"),
                             "sequence": [{"use": k[0], "name": k[1][0] if k[1] else None, "bridge": k[2], "tunnel": k[3], "m": round(m)} for k, m in seq]}
        try:
            cpath, cs = valhalla_route([pa, pb], "auto")
            row["auto"] = {"km": round(cs["km"], 3), "minutes": round(cs["seconds"] / 60, 1), "ratio": round(cs["km"] * 1000 / row["straight_m"], 2)}
            p_u, c_u = utm(path), utm(cpath)
            row["auto"]["pedestrian_within_25m_of_auto"] = round(p_u.intersection(c_u.buffer(TOL)).length / p_u.length, 3)
            geo["auto"] = r5(cpath)
        except RuntimeError as e:
            row["auto"] = {"error": str(e)}
        GEO["walk:" + label] = geo
        out.append(row)
        print(label, {k: v for k, v in row["pedestrian"].items() if k != "sequence"}, row.get("auto"), flush=True)
    RES["walk"] = out
    save()


# --------------------------------------------------------------------------- existing posts
def short(label):
    return label.split(",")[0].strip()


def posts():
    base = os.path.join(HOME, "db")
    rows = []
    for r in json.load(open(os.path.join(base, "posts.json")))["rows"]:
        pins = r["map_data"]["pins"]
        for a, b in zip(pins, pins[1:]):
            rows.append(("post", None, a, b))
    for r in json.load(open(os.path.join(base, "comments.json")))["rows"]:
        for leg in r["map_data"]["legs"]:
            rows.append(("guide leg", leg["mode"], leg["origin"], leg["destination"]))
    out = []
    for kind, mode, a, b in rows:
        pa, pb = (a["lng"], a["lat"]), (b["lng"], b["lat"])
        costing = "pedestrian" if mode in ("walk", "walking") else "auto"
        row = {"kind": kind, "mode": mode, "from": short(a["label"]), "to": short(b["label"]), "costing": costing, "straight_km": round(haversine_m(pa, pb) / 1000, 2)}
        try:
            path, sm = valhalla_route([pa, pb], costing)
            row.update(routed_km=round(sm["km"], 2), ratio=round(sm["km"] * 1000 / haversine_m(pa, pb), 2), error=None)
            GEO["post:%d" % len(out)] = {"path": r5(path), "pins": [[pa[0], pa[1]], [pb[0], pb[1]]]}
        except RuntimeError as e:
            row.update(routed_km=None, ratio=None, error=str(e))
        if osrm_up() and costing == "auto":
            try:
                _, o = osrm_route([pa, pb])
                row["osrm_km"] = round(o["km"], 2)
            except RuntimeError as e:
                row["osrm_error"] = str(e)
        out.append(row)
        print(row, flush=True)
    RES["posts"] = out
    save()


# --------------------------------------------------------------------------- latency
def pct(xs, p):
    xs = sorted(xs)
    k = (len(xs) - 1) * p / 100
    f = int(k)
    return xs[f] + (xs[min(f + 1, len(xs) - 1)] - xs[f]) * (k - f)


def latency(n=50):
    cands, _ = all_candidates()
    flat = {s["id"]: s for m in cands for s in cands[m]}
    refs = [utm(flat[i]["coords"]) for i, _ in SELECTED]
    rng = random.Random(6)
    reqs = []  # (start, end, [10 vias]) in lng/lat; sub-sets use evenly spaced prefixes of the same corridor
    for i in range(n):
        ln = refs[i % len(refs)]
        L = min(8000.0, ln.length * 0.6)
        t0 = rng.uniform(0, ln.length - L)
        seg = lambda f: ln.interpolate(t0 + L * f)
        reqs.append({k: ll(seg(f)) for k, f in (("start", 0.0), ("end", 1.0))} | {"fracs": [(j + 1) / 11 for j in range(10)], "seg": (ln, t0, L)})
    def pts(rq, k):
        ln, t0, L = rq["seg"]
        fr = [(j + 1) / (k + 1) for j in range(k)]
        return [rq["start"]] + [ll(ln.interpolate(t0 + L * f)) for f in fr] + [rq["end"]]
    series = [("valhalla auto, 0 vias", "auto", 0), ("valhalla auto, 5 vias", "auto", 5), ("valhalla auto, 10 vias", "auto", 10), ("valhalla pedestrian, 0 vias", "pedestrian", 0)]
    osrm = osrm_up()
    if osrm:
        series += [("osrm car, 0 vias", "osrm", 0), ("osrm car, 5 vias", "osrm", 5), ("osrm car, 10 vias", "osrm", 10)]
    out = []
    for name, costing, k in series:
        fn = (lambda p: osrm_route(p)) if costing == "osrm" else (lambda p, c=costing: valhalla_route(p, c))
        for rq in reqs[:3]:  # warm-up, not counted
            try: fn(pts(rq, k))
            except RuntimeError: pass
        ms, fails = [], 0
        for rq in reqs:
            t = time.perf_counter()
            try:
                fn(pts(rq, k))
                ms.append((time.perf_counter() - t) * 1000)
            except RuntimeError:
                fails += 1
        out.append({"series": name, "requests": n, "failed": fails, "p50_ms": round(pct(ms, 50), 1), "p95_ms": round(pct(ms, 95), 1), "max_ms": round(max(ms), 1)})
        print(out[-1], flush=True)
    RES["latency"] = out
    RES["latency_note"] = "sequential client on the same machine, 3 warm-up requests per series not counted; corridors cycle through the car references; each request is an ~8 km (or shorter) stretch of a reference route"
    save()


if __name__ == "__main__":
    todo = sys.argv[1:] or ["car", "walk", "posts", "latency"]
    RES["generated"] = datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds")
    for t in todo:
        {"car": car, "walk": walk, "posts": posts, "latency": latency}[t]()
