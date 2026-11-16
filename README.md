# Whoosh to Surabaya Calculator

Interactive calculator for extending the Whoosh high-speed railway from Jakarta and Bandung to Surabaya, assuming the track follows the existing Trans-Java toll roads.

Open `index.html` in a browser. No build step, no external dependencies.

What it computes, live from the sliders:

- Travel time and speed profile for any choice of stops (Jakarta, Bandung Padalarang, Bandung Tegalluar, Surabaya always; Karawang, Cirebon, Tegal, Pekalongan, Semarang, Surakarta, Madiun, Mojokerto optional)
- Fare, scaled from today's Jakarta–Bandung fare by distance, travel time and stations served
- English and Bahasa Indonesia, switched with the EN / ID buttons (`?lang=id`); translations live in `lang-id.js` and are applied by `i18n.js`, Wikipedia links stay English
- Comparison with ten real high-speed corridors of similar length (speed, rail share against air, construction cost per km)
- CO₂ includes building the line, the trainsets, the aircraft and the airports, each on its own slider
- Door-to-door time and cost against the flights from both Jakarta airports (HLP–SUB and CGK–SUB), each with its own configurable fare, block time and city-to-airport time, plus a slider for the share of flights leaving from CGK
- Economics of building the Bandung–Surabaya section
- CO₂ per passenger for both modes, with optional carbon offsets
- Three verdicts (traveller, investor, planet) and an overall feasibility call

Every input and result has an "i" button with an explanation and references.

## Files

| File | Purpose |
|---|---|
| `index.html` | Markup and styles |
| `app.js` | Model, charts, map, references |
| `route-data.js` | Generated route geometry, stations, toll sections, coastline |
| `tools/` | Scripts that fetch-process the geometry and test the page |
| `data/` | Inputs to `tools/build-route.mjs` |

## Regenerating the route data

```
node tools/stitch-hsr.mjs data/hsr_osm.json data/hsr_line.json   # built line from OpenStreetMap ways
node tools/build-route.mjs                                        # writes route-data.js
node tools/check-links.mjs                                        # verifies the reference links
```

`data/ne_10m_land.geojson` (Natural Earth, 10 MB) is not tracked; download it from
`https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_land.geojson`.

## Data sources

- Built line: © OpenStreetMap contributors (ODbL)
- Toll corridor: OSRM driving route over OpenStreetMap data, pinned to the toll roads
- Coastline: Natural Earth (public domain)

Built by AI. Nothing is human-verified.
