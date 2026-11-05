"""Builds src/lib/rail/rail-lines.json from the Geofabrik Philippines extract.

Run through scripts/rail/build-rail.sh, which prepares a venv with pyosmium.

For each rail line the app offers (MRT-3, LRT-1, LRT-2) the output holds, per
direction, the track as one ordered chain (a Google encoded polyline, precision
5) and each station's position in metres along that chain, plus every
station's stop positions for snapping pins. Relations are chosen by OSM ID and
checked against their route_master, never found by tag: a tag search also
collects PNR, MRT-7 and the unbuilt subway (docs/research/rail-geometry.md).

Output is deterministic: the same extract gives byte-identical output.
"""
import json
import math
import sys

import osmium

EARTH_RADIUS_M = 6_371_000
TRACK_RAILWAY = {"light_rail", "subway"}
STOP_ROLES = {"stop", "stop_entry_only", "stop_exit_only"}
# Chain simplification tolerance; stations' stop vertices are always kept.
TOLERANCE_M = 2.0
PRECISION = 5

# `directions` are the two full-line route relations of a line; each must be a
# member of the line's route_master.
LINES = [
    {
        "id": "mrt-3",
        "mode": "mrt",
        "name": "MRT-3",
        "master": 8000255,
        "directions": [109159, 8000253],
    },
    {
        "id": "lrt-1",
        "mode": "lrt",
        "name": "LRT-1",
        "master": 8000262,
        "directions": [8000260, 110418],
    },
    {
        "id": "lrt-2",
        "mode": "lrt",
        "name": "LRT-2",
        "master": 8000265,
        "directions": [110410, 8000264],
    },
]


def fail(message):
    sys.exit(f"build_rail: {message}")


def haversine(a, b):
    la1, lo1 = math.radians(a[0]), math.radians(a[1])
    la2, lo2 = math.radians(b[0]), math.radians(b[1])
    h = (
        math.sin((la2 - la1) / 2) ** 2
        + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2
    )
    return 2 * EARTH_RADIUS_M * math.asin(math.sqrt(h))


def encode_polyline(points):
    out = []
    prev_lat = prev_lng = 0
    for lat, lng in points:
        ilat = round(lat * 10**PRECISION)
        ilng = round(lng * 10**PRECISION)
        for delta in (ilat - prev_lat, ilng - prev_lng):
            v = ~(delta << 1) if delta < 0 else delta << 1
            while v >= 0x20:
                out.append(chr((0x20 | (v & 0x1F)) + 63))
                v >>= 5
            out.append(chr(v + 63))
        prev_lat, prev_lng = ilat, ilng
    return "".join(out)


def local_xy(p, origin):
    """Metres east/north of `origin`; accurate enough at track scale."""
    k = math.pi / 180 * EARTH_RADIUS_M
    return (
        (p[1] - origin[1]) * k * math.cos(math.radians(origin[0])),
        (p[0] - origin[0]) * k,
    )


def project_on_segment(p, a, b):
    """(distance m, fraction 0..1) of the closest point on segment ab to p."""
    ax, ay = local_xy(a, a)
    bx, by = local_xy(b, a)
    px, py = local_xy(p, a)
    dx, dy = bx - ax, by - ay
    length2 = dx * dx + dy * dy
    t = 0.0 if length2 == 0 else max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / length2))
    return math.hypot(px - (ax + t * dx), py - (ay + t * dy)), t


def simplify(points, keep, tolerance):
    """Douglas-Peucker between forced-kept indices; returns the kept indices."""
    anchors = sorted({0, len(points) - 1, *keep})
    kept = set(anchors)
    for lo, hi in zip(anchors, anchors[1:]):
        stack = [(lo, hi)]
        while stack:
            s, e = stack.pop()
            worst, worst_i = -1.0, None
            for i in range(s + 1, e):
                d, _ = project_on_segment(points[i], points[s], points[e])
                if d > worst:
                    worst, worst_i = d, i
            if worst_i is not None and worst > tolerance:
                kept.add(worst_i)
                stack.extend([(s, worst_i), (worst_i, e)])
    return sorted(kept)


def read_osm(pbf):
    relation_ids = set()
    for line in LINES:
        relation_ids.add(line["master"])
        relation_ids.update(line["directions"])

    relations = {}
    for rel in osmium.FileProcessor(pbf, osmium.osm.RELATION).with_filter(
        osmium.filter.IdFilter(relation_ids)
    ):
        relations[rel.id] = {
            "tags": {t.k: t.v for t in rel.tags},
            "members": [(m.type, m.ref, m.role) for m in rel.members],
        }
    missing = relation_ids - relations.keys()
    if missing:
        fail(f"relations not in the extract: {sorted(missing)}")

    for line in LINES:
        master = relations[line["master"]]
        if master["tags"].get("type") != "route_master":
            fail(f"{line['master']} is not a route_master")
        members = {ref for kind, ref, _ in master["members"] if kind == "r"}
        for rid in line["directions"]:
            if rid not in members:
                fail(f"relation {rid} is not a member of route_master {line['master']}")

    way_ids, stop_ids = set(), set()
    for line in LINES:
        for rid in line["directions"]:
            for kind, ref, role in relations[rid]["members"]:
                if kind == "w" and role in ("", "forward", "backward"):
                    way_ids.add(ref)
                elif kind == "n" and role in STOP_ROLES:
                    stop_ids.add(ref)

    ways = {}
    for way in osmium.FileProcessor(pbf, osmium.osm.WAY).with_filter(osmium.filter.IdFilter(way_ids)):
        if way.tags.get("railway") in TRACK_RAILWAY:
            ways[way.id] = [n.ref for n in way.nodes]

    node_ids = set(stop_ids)
    for refs in ways.values():
        node_ids.update(refs)
    nodes = {}
    for node in osmium.FileProcessor(pbf, osmium.osm.NODE).with_filter(osmium.filter.IdFilter(node_ids)):
        nodes[node.id] = {
            "lat": round(node.location.lat, PRECISION),
            "lng": round(node.location.lon, PRECISION),
            "tags": {t.k: t.v for t in node.tags},
        }
    missing = node_ids - nodes.keys()
    if missing:
        fail(f"nodes not in the extract: {sorted(missing)[:5]}")

    # Stop areas group a station's stop nodes across both directions.
    stop_areas = {}
    for rel in osmium.FileProcessor(pbf, osmium.osm.RELATION):
        tags = rel.tags
        if tags.get("type") != "public_transport" or tags.get("public_transport") != "stop_area":
            continue
        member_stops = [m.ref for m in rel.members if m.type == "n" and m.ref in stop_ids]
        if member_stops:
            stop_areas[rel.id] = {"name": tags.get("name", ""), "stops": member_stops}
    return relations, ways, nodes, stop_areas


def build_chain(relation, ways, nodes):
    """The relation's track ways as one ordered chain of node IDs."""
    ordered = []
    seen = set()
    for kind, ref, role in relation["members"]:
        if kind == "w" and role in ("", "forward", "backward") and ref in ways and ref not in seen:
            seen.add(ref)
            ordered.append(ways[ref])
    if len(ordered) < 2:
        fail("a direction has fewer than two track ways")
    first, second = ordered[0], ordered[1]
    if first[-1] in (second[0], second[-1]):
        chain = list(first)
    elif first[0] in (second[0], second[-1]):
        chain = list(reversed(first))
    else:
        fail("first two track ways do not connect")
    for refs in ordered[1:]:
        if chain[-1] == refs[0]:
            chain.extend(refs[1:])
        elif chain[-1] == refs[-1]:
            chain.extend(reversed(refs[:-1]))
        else:
            fail(f"gap in the chain after node {chain[-1]}")
    return chain


def station_name(group_nodes, area):
    for node in group_nodes:
        name = node["tags"].get("name", "")
        if any(c.isalpha() for c in name):
            return name
    for node in group_nodes:
        name = node["tags"].get("name:en", "")
        if name:
            return name
    return area["name"]


def build_line(line, relations, ways, nodes, stop_areas):
    area_of = {}
    for area_id, area in stop_areas.items():
        for ref in area["stops"]:
            area_of.setdefault(ref, area_id)

    directions = []
    for rid in line["directions"]:
        relation = relations[rid]
        chain = build_chain(relation, ways, nodes)
        stops = []
        for kind, ref, role in relation["members"]:
            if kind == "n" and role in STOP_ROLES:
                if ref not in area_of:
                    fail(f"stop node {ref} of relation {rid} is in no stop_area")
                stops.append(ref)
        directions.append({"rid": rid, "chain": chain, "stops": stops})

    # Stations in the first direction's order, then any only the other has.
    station_order = []
    for d in directions:
        for ref in d["stops"]:
            key = area_of[ref]
            if key not in station_order:
                station_order.append(key)

    result_dirs = []
    for d in directions:
        chain = d["chain"]
        points = [(nodes[n]["lat"], nodes[n]["lng"]) for n in chain]
        index_of = {n: i for i, n in enumerate(chain)}
        by_area = {}
        for ref in d["stops"]:
            by_area.setdefault(area_of[ref], []).append(ref)
        # Stations whose stop nodes lie on this chain are exact vertices.
        on_chain = {a: [index_of[r] for r in refs if r in index_of] for a, refs in by_area.items()}
        keep = {i for idxs in on_chain.values() for i in idxs}
        kept = simplify(points, keep, TOLERANCE_M)
        new_index = {old: new for new, old in enumerate(kept)}
        simple = [points[i] for i in kept]
        cum = [0.0]
        for a, b in zip(simple, simple[1:]):
            cum.append(cum[-1] + haversine(a, b))
        d["simple"] = simple
        d["cum"] = cum
        d["at"] = {}
        for area_id, idxs in on_chain.items():
            if idxs:
                d["at"][area_id] = sum(cum[new_index[i]] for i in idxs) / len(idxs)
        result_dirs.append(d)

    # A station missing from a direction is projected from the other's stops;
    # the order check below catches a wrong projection.
    for d in result_dirs:
        for area_id in station_order:
            if area_id in d["at"]:
                continue
            candidates = [
                (nodes[r]["lat"], nodes[r]["lng"])
                for other in result_dirs
                for r in other["stops"]
                if area_of[r] == area_id
            ]
            best = None
            for p in candidates:
                for i in range(len(d["simple"]) - 1):
                    dist, t = project_on_segment(p, d["simple"][i], d["simple"][i + 1])
                    if best is None or dist < best[0]:
                        best = (dist, d["cum"][i] + t * (d["cum"][i + 1] - d["cum"][i]))
            if best is None:
                fail(f"cannot place station {area_id} on a direction of {line['id']}")
            d["at"][area_id] = best[1]
            print(f"{line['id']}: station {area_id} projected {best[0]:.0f} m onto relation {d['rid']}", file=sys.stderr)

    stations = []
    for area_id in station_order:
        refs = [r for d in result_dirs for r in d["stops"] if area_of[r] == area_id]
        stop_nodes = [nodes[r] for r in refs]
        stops = []
        for node in stop_nodes:
            p = [node["lat"], node["lng"]]
            if p not in stops:
                stops.append(p)
        stations.append({"name": station_name(stop_nodes, stop_areas[area_id]), "stops": stops})

    out_dirs = []
    for d in result_dirs:
        at = [round(d["at"][a]) for a in station_order]
        ordered = sorted(at)
        if len(set(at)) != len(at):
            fail(f"{line['id']}: two stations share a position along relation {d['rid']}")
        # Along one direction the stations are either in order or reversed.
        if ordered != at and ordered[::-1] != at:
            fail(f"{line['id']}: stations out of order along relation {d['rid']}: {at}")
        out_dirs.append(
            {
                "name": relations[d["rid"]]["tags"]["from"] + " → " + relations[d["rid"]]["tags"]["to"],
                "path": encode_polyline(d["simple"]),
                "at": at,
            }
        )
    return {
        "id": line["id"],
        "mode": line["mode"],
        "name": line["name"],
        "stations": stations,
        "directions": out_dirs,
    }


def main():
    if len(sys.argv) != 4:
        fail("usage: build_rail.py <extract.osm.pbf> <extract name> <output.json>")
    pbf, extract, out_path = sys.argv[1:]
    relations, ways, nodes, stop_areas = read_osm(pbf)
    lines = [build_line(line, relations, ways, nodes, stop_areas) for line in LINES]
    document = {
        "license": "Contains information from OpenStreetMap, which is made available under the Open Database License (ODbL) 1.0. See NOTICE.md.",
        "extract": extract,
        "lines": lines,
    }
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(document, f, ensure_ascii=False, separators=(",", ":"))
        f.write("\n")
    for line in lines:
        print(f"{line['id']}: {len(line['stations'])} stations, " + ", ".join(f"{len(d['path'])} chars" for d in line["directions"]), file=sys.stderr)


if __name__ == "__main__":
    main()
