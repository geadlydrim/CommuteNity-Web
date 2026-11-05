# Rail line data: ODbL notice

`rail-lines.json` contains information from [OpenStreetMap](https://www.openstreetmap.org/copyright), which is made available under the [Open Database License (ODbL) 1.0](https://opendatacommons.org/licenses/odbl/1-0/). © OpenStreetMap contributors.

It is a database derived from OpenStreetMap, not a work of this project: the track of MRT-3, LRT-1, and LRT-2 and their stations' stop positions, selected from the Geofabrik Philippines extract named in the file's `extract` field (data processed by Geofabrik GmbH). Coordinates are rounded to 5 decimal places and the tracks are simplified to 2 m. The rest of this repository is a separate work and is not covered by the ODbL.

You may copy, distribute, and adapt the data under the ODbL, provided you credit OpenStreetMap and its contributors, keep this notice, and share any adapted version of the database under the same licence. Maps drawn from it carry the OpenStreetMap attribution (`OsmAttribution` and the MapLibre attribution control).

## Method

The file is rebuilt, not edited by hand:

```bash
scripts/router/download.sh   # the extract the router uses, if you haven't already
scripts/rail/build-rail.sh   # writes src/lib/rail/rail-lines.json
```

`scripts/rail/build_rail.py` selects the six route relations by OSM ID and checks each against its `route_master` (never a tag search), keeps their `railway=light_rail|subway` ways, chains them, and takes each stop position from the relation's stop members. Anyone can reproduce the file from the same extract.
