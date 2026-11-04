"""Stitch Overpass route relations into single continuous lines and pick reference routes."""
import json
from common import haversine_m, utm
from overpass import jeepney_relations, bus_relations

SKIP_ROLES = ("platform", "stop", "platform_entry_only", "platform_exit_only", "stop_entry_only", "stop_exit_only")


def _pt(g):
    return (g["lon"], g["lat"])


def stitch(rel, gap_m=0.0):
    """Join a relation's way members, in member order, into one line.
    Returns (coords, owners, None) or (None, None, reason); owners[i] = (OSM way id, traversed_forward) of vertex i."""
    mem = [m for m in rel.get("members", []) if m["type"] == "way" and m.get("role", "") not in SKIP_ROLES and m.get("geometry")]
    ways = [[_pt(g) for g in m["geometry"]] for m in mem]
    ids = [m["ref"] for m in mem]
    if not ways:
        return None, None, "no ways"
    tol = max(gap_m, 0.01)
    if len(ways) == 1:
        return ways[0], [(ids[0], True)] * len(ways[0]), None
    w0, w1 = ways[0], ways[1]
    # orient the first way using the second
    best = min(((haversine_m(a, b), a_rev) for a_rev, a in ((0, w0[-1]), (1, w0[0])) for b in (w1[0], w1[-1])), key=lambda t: t[0])
    if best[0] > tol:
        return None, None, "gap between way 1 and 2"
    chain = list(w0) if not best[1] else list(reversed(w0))
    owners = [(ids[0], not best[1])] * len(chain)
    for i, w in enumerate(ways[1:], start=1):
        end = chain[-1]
        fwd = True
        if haversine_m(end, w[0]) <= tol:
            seg = w[1:]
        elif haversine_m(end, w[-1]) <= tol:
            seg, fwd = list(reversed(w))[1:], False
        else:
            return None, None, f"gap before way {i + 1}"
        chain += seg
        owners += [(ids[i], fwd)] * len(seg)
    return chain, owners, None


def summarize(rel, coords):
    ln = utm(coords)
    return {
        "id": rel["id"],
        "name": rel["tags"].get("name") or f"{rel['tags'].get('from','?')} - {rel['tags'].get('to','?')}",
        "ref": rel["tags"].get("ref"),
        "from": rel["tags"].get("from"), "to": rel["tags"].get("to"),
        "operator": rel["tags"].get("operator"),
        "length_km": ln.length / 1000,
        "straight_km": haversine_m(coords[0], coords[-1]) / 1000,
        "timestamp": rel.get("timestamp"),
        "version": rel.get("version"),
        "start": coords[0], "end": coords[-1],
        "n_ways": sum(1 for m in rel["members"] if m["type"] == "way"),
    }


def all_candidates():
    out = {"jeepney": [], "bus": []}
    rej = {"jeepney": {}, "bus": {}}
    seen = set()
    for _, rels in (("jeepney", jeepney_relations()), ("bus", bus_relations())):
        for rel in rels:
            if rel["id"] in seen:
                continue
            seen.add(rel["id"])
            # the NCR-network query also returns the jeepney relations; classify by tag
            mode = "jeepney" if rel["tags"].get("bus") == "share_taxi" else "bus"
            c, owners, why = stitch(rel)
            if c is None:
                rej[mode].setdefault(why.split(" (")[0].split(" before")[0], []).append(rel["id"])
                continue
            s = summarize(rel, c)
            s["mode"] = mode
            s["coords"] = c
            s["owners"] = owners
            out[mode].append(s)
    return out, rej


if __name__ == "__main__":
    out, rej = all_candidates()
    for m in out:
        print(m, "stitched", len(out[m]), "rejected", {k: len(v) for k, v in rej[m].items()})
    for m in out:
        for s in sorted(out[m], key=lambda s: s["name"]):
            loop = s["straight_km"] * 1000 < 300
            print(m, s["id"], s["name"][:70], "|", s["ref"], f"{s['length_km']:.1f}km straight {s['straight_km']:.1f}", "LOOP" if loop else "", (s["timestamp"] or "")[:10])
