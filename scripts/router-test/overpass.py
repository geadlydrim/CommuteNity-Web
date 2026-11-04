"""Fetch reference route relations and walking-corridor anchors from Overpass (cached on disk)."""
import json, sys
from common import cached_post, HOME
import os

URL = "https://overpass-api.de/api/interpreter"
BBOX = "14.35,120.90,14.80,121.20"  # S,W,N,E: Metro Manila and a margin


def q(ql, key):
    return cached_post(URL, key, data={"data": ql})


def jeepney_relations():
    ql = f'[out:json][timeout:240];relation["type"="route"]["route"="bus"]["bus"="share_taxi"]({BBOX});out geom meta;'
    return q(ql, "jeepney:" + BBOX)["elements"]


def bus_relations():
    ql = f'[out:json][timeout:240];relation["type"="route"]["route"="bus"]["network"~"LTFRB National Capital Region"]({BBOX});out geom meta;'
    return q(ql, "bus-ltfrb-ncr:" + BBOX)["elements"]


def anchors():
    """Station/mall coordinates for the walking corridors: one union query over four small boxes (cached)."""
    ql = '''[out:json][timeout:180];(
 nwr["name"~"Gateway|Araneta Center|Araneta City"](14.612,121.03,14.632,121.07);
 nwr["name"~"Quiapo|Carriedo|Black Nazarene|Recto|Doroteo"](14.595,120.975,14.612,120.995);
 nwr["name"~"Ayala|Glorietta"](14.545,121.015,14.565,121.035);
 nwr["name"~"168"](14.598,120.965,14.612,120.985);
);out center tags;'''
    return q(ql, "anchors3")["elements"]


def way_tags(way_ids):
    """Tags of the given ways (one query), as {id: tags}."""
    ids = sorted(set(way_ids))
    ql = "[out:json][timeout:240];way(id:" + ",".join(map(str, ids)) + ");out tags;"
    return {e["id"]: e["tags"] for e in q(ql, "waytags:" + ",".join(map(str, ids)))["elements"]}


if __name__ == "__main__":
    for f in (jeepney_relations, bus_relations, anchors):
        print(f.__name__, len(f()))


def cubao_mrt3():
    """The MRT-3 Cubao station (named just 'Cubao' or 'Araneta Center-Cubao' on EDSA): stations/stops near the EDSA-Aurora junction."""
    ql = '[out:json][timeout:180];(nwr["railway"~"station|stop|subway_entrance|train_station_entrance"](14.612,121.043,14.626,121.058);nwr["network"~"MRT"]["name"~"Cubao"](14.612,121.043,14.626,121.058););out center tags;'
    return q(ql, "cubao-mrt3")["elements"]
