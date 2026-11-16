# Whoosh to Surabaya Calculator

Interactive calculator for extending the Whoosh high-speed railway from Jakarta and Bandung to Surabaya. Seven routes can be compared: the three alternatives of KCIC's pre-feasibility study, and four other combinations of the corridors on that study's map.

Open `index.html` in a browser. No build step, no external dependencies.

What it computes, live from the sliders:

- A choice of route (`?route=south|central|north|ncoast|ccentral|cnorth|coast`; Lintas Selatan when absent), with all seven compared side by side under the current sliders
- Travel time and speed profile for any choice of stops (Jakarta, Bandung Padalarang, Bandung Tegalluar, Surabaya always; Karawang and the route's new stations optional)
- Fare, scaled from today's Jakarta–Bandung fare by distance, travel time and stations served
- English and Bahasa Indonesia, switched with the EN / ID buttons (`?lang=id`); translations live in `lang-id.js` and are applied by `i18n.js`, Wikipedia links stay English
- Comparison with ten real high-speed corridors of similar length (speed, rail share against air, construction cost per km)
- Elevation profile under the speed chart: the ground along each line and a rail level derived from it, with gravity on that level included in running time and energy (switchable)
- CO₂ includes building the line, the trainsets, the aircraft and the airports, each on its own slider
- Door-to-door time and cost against the flights from both Jakarta airports (HLP–SUB and CGK–SUB), each with its own configurable fare, block time and city-to-airport time, plus a slider for the share of flights leaving from CGK
- An optional government surcharge on every flight ticket, with the surcharge at which the train ties the flight and the one at which the traveller's verdict turns to the train
- Economics of building the Bandung–Surabaya section
- CO₂ per passenger for both modes, with optional carbon offsets
- Three verdicts (traveller, investor, planet) and an overall feasibility call

Every input and result has an "i" button with an explanation and references.

## Routes

| `route=` | Route | New line | In tunnel | Stations | Published time | New stations |
|---|---|---|---|---|---|---|
| `south` (default) | KCIC 1, Lintas Selatan | 629.45 km | 21.25 km | 13 + 2 reserve | 180 min | *Garut*, Tasikmalaya, Banjar, Sidareja, *Cilacap*, Kroya, Kebumen, Yogyakarta International Airport, Yogyakarta, Surakarta, Sragen, Madiun, Nganjuk, Mojokerto, Surabaya |
| `central` | KCIC 2, Lintas Tengah | 679.19 km | 44.61 km | 15 + 1 reserve | 193 min | *Sumedang*, Kertajati, Cirebon, Babakan, Karanganyar, Purwokerto, Kroya, then as Lintas Selatan |
| `north` | KCIC 3, Lintas Utara | 641.96 km | 51.95 km | 14 + 1 reserve | 184 min | *Sumedang*, Kertajati, Cirebon, Babakan, Tegal, Pekalongan, Lebo, Semarang, Salatiga, Surakarta, then as Lintas Selatan |
| `ncoast` | Lintas Utara, then the north coast | about 597 km | – | 12 + 1 reserve | – | as Lintas Utara to Semarang, then (Purwodadi), (Cepu), (Bojonegoro), (Lamongan), Surabaya Pasar Turi |
| `ccentral` | North coast, then Lintas Tengah | about 741 km | – | 15 | – | (Jatibarang), Cirebon, then as Lintas Tengah |
| `cnorth` | North coast, then Solo | about 701 km | – | 14 | – | (Jatibarang), Cirebon, then as Lintas Utara |
| `coast` | North coast throughout | about 659 km | – | 12 | – | (Jatibarang), Cirebon, Babakan, Tegal, Pekalongan, Lebo, Semarang, (Purwodadi), (Cepu), (Bojonegoro), (Lamongan), Surabaya Pasar Turi |

*Italic*: reserve station. (Parentheses): inferred by this project. Stations are the new ones, Surabaya included.

The three KCIC alternatives come from the comparison map of KCIC's pre-feasibility study (2024, still under review) that Kompas.id published in December 2024. The map gives each alternative's length from Tegalluar, tunnel length, station count and travel time, and names the stations. The same map shows the north-coast corridor of JICA's semi-high-speed study (713 km from Jakarta, 5 passenger stations, 5.5 hours). `tools/build-route.mjs` turns it into geometry:

- The map is a sketch on a base map, so each corridor is redrawn as a smooth curve through hand-placed waypoints at its stations. Chainage is stretched to the published length, 4–5 % over the drawn length on all three alternatives.
- Station names in red on the map add up to the published counts. Sumedang, Garut and Cilacap, labelled in green, are taken to be the reserve stations; that gives Lintas Selatan two where its legend says one.
- The last four routes are the other ways of joining the mapped corridors end to end. None is an alternative of either study. Their lengths are the drawn length plus the average stretch of the three alternatives, and their stations on JICA's corridor are inferred.
- `ccentral`, `cnorth` and `coast` leave the built line at Karawang and do not serve Bandung. That branch point is this project's assumption; JICA's own line starts in Jakarta.
- Routes ending along the coast terminate at Pasar Turi; all others at the Waru interchange on the southern edge of Surabaya, which is this project's assumption.

## Files

| File | Purpose |
|---|---|
| `index.html` | Markup and styles |
| `app.js` | Model, charts, map, references |
| `route-data.js` | Generated route geometry, stations, coastline |
| `tools/` | Scripts that fetch-process the geometry and test the page |
| `data/` | Inputs to `tools/build-route.mjs` |

## Regenerating the route data

```
node tools/stitch-hsr.mjs data/hsr_osm.json data/hsr_line.json   # built line from OpenStreetMap ways
node tools/build-route.mjs                                        # writes route-data.js; fetches any elevations not yet in data/elevation.json
node tools/check-links.mjs                                        # verifies the reference links
```

`data/ne_10m_land.geojson` (Natural Earth, 10 MB) is not tracked; download it from
`https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_land.geojson`.

## Data sources

- Built line: © OpenStreetMap contributors (ODbL)
- KCIC alternatives: figures and station names from the map of KCIC's 2024 pre-feasibility study as published by Kompas.id; the alignments are redrawn schematically from it
- Coastline: Natural Earth (public domain)
- Elevation: SRTM 30 m through the OpenTopoData public API, cached in `data/elevation.json`

Built by AI. Nothing is human-verified.
