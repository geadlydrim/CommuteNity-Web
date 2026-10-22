# Feed map thumbnails are static tile images, not live maps

In the feed, post maps and guides render as a stitched set of plain `<img>` OSM tiles with an SVG line drawn on top. The interactive MapLibre map appears only in the focus view and in the builders. A feed of 50 cards would otherwise create up to 50 WebGL contexts; browsers cap the number of live contexts and phones struggle well before that.

## Consequences

- Line geometry is drawn twice: once for MapLibre, and once for the SVG overlay.
