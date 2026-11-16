// Build route-data.js from the fetched geometry.
// usage: node tools/build-route.mjs   (run from the project root)
//
// Inputs (data/):
//   hsr_line.json  – built Jakarta–Bandung high-speed line, stitched from OpenStreetMap by stitch-hsr.mjs
//   elevation.json – ground elevations fetched and cached by elevation.mjs (SRTM 30 m)
//   ALTS (below)   – hand-placed waypoints for the corridors on the map of KCIC's pre-feasibility study
// Output: route-data.js, defining ROUTE = { builtKm, whoosh, refKm, routes:[{ id, builtKm, extKm, line:[[lon,lat,km],…], stations:[…] },…], land, airports }
import fs from "node:fs";
import { hav, lineLen, simplify, project, spline } from "./geo.mjs";
import { elevations } from "./elevation.mjs";

const OFFICIAL_KM = 142.3; // published length of the built line, Halim → Tegalluar
const hsr = JSON.parse(fs.readFileSync("data/hsr_line.json", "utf8"));

// ---- existing line: trim to the two terminal stations, rescale chainage to the official length
const HALIM = [106.885241, -6.2464709], KARAWANG = [107.2187006, -6.3656612], PADALARANG = [107.4966122, -6.8428638], TEGALLUAR = [107.712516, -6.96423];
const cut = (line, s0, s1) => {
  const out = []; let s = 0;
  const lerp = (a, b, t) => [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])];
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1], b = line[i], d = hav(a, b), e = s + d;
    if (e >= s0 && s <= s1) {
      if (!out.length) out.push(s0 > s ? lerp(a, b, (s0 - s) / d) : a);
      out.push(e > s1 ? lerp(a, b, (s1 - s) / d) : b);
    }
    s = e;
  }
  return out;
};
const pH = project(hsr, HALIM), pT = project(hsr, TEGALLUAR);
const built = cut(hsr, pH.s, pT.s);
const builtLen = lineLen(built), kBuilt = OFFICIAL_KM / builtLen;
const pK = project(built, KARAWANG), pP = project(built, PADALARANG);
console.log("built line", builtLen.toFixed(2), "km measured; scale to official", kBuilt.toFixed(4));

// ---- stations: existing ones at their real position; new ones at the point of the alignment nearest the town centre.
// [name, town centre, short name, where to put it if not nearest the centre]
const C = {
  // on the map of KCIC's pre-feasibility study
  sumedang: ["Sumedang", [107.9214, -6.8586]],
  kertajati: ["Kertajati", [108.160, -6.655]],            // the airport terminal, not the village
  cirebon: ["Cirebon", [108.5574, -6.7071]],
  babakan: ["Babakan", [108.7200, -6.8700]],
  karanganyar: ["Karanganyar", null, null, [109.0100, -7.1000]],   // read off the study's map, less the eastward offset its other dots show; which Karanganyar is meant is not stated
  purwokerto: ["Purwokerto", [109.2344, -7.4214]],
  tegal: ["Tegal", [109.1418, -6.8674]],
  pekalongan: ["Pekalongan", [109.66666667, -6.88333333]],
  lebo: ["Lebo", [110.0600, -6.9750]],
  semarang: ["Semarang", [110.4225, -6.99]],
  salatiga: ["Salatiga", [110.5000, -7.3300]],
  garut: ["Garut", [107.9087, -7.2279]],
  tasikmalaya: ["Tasikmalaya", [108.2207, -7.3274]],
  banjar: ["Banjar", [108.5414, -7.3706]],
  sidareja: ["Sidareja", [108.7900, -7.4850]],
  cilacap: ["Cilacap", [109.0150, -7.7270], null, [109.1400, -7.6100]],  // drawn just west of Kroya, about where the Cilacap branch leaves the main line at Maos
  kroya: ["Kroya", [109.2461, -7.6328]],
  kebumen: ["Kebumen", [109.6558, -7.6703]],
  yia: ["Yogyakarta International Airport", [110.0570, -7.9050], "YIA"],
  yogyakarta: ["Yogyakarta", [110.3644, -7.8014]],
  surakarta: ["Surakarta (Solo)", [110.81666667, -7.56666667], "Surakarta"],
  sragen: ["Sragen", [111.0200, -7.4300]],
  madiun: ["Madiun", [111.52305556, -7.63]],
  nganjuk: ["Nganjuk", [111.9000, -7.6000]],
  mojokerto: ["Mojokerto", [112.4320, -7.4632]],
  // not on that map: inferred for the corridor of JICA's semi-high-speed study
  jatibarang: ["Indramayu (Jatibarang)", [108.3050, -6.4750], "Jatibarang"],
  purwodadi: ["Purwodadi", [110.9158, -7.0868]],
  cepu: ["Cepu", [111.5900, -7.1500]],
  bojonegoro: ["Bojonegoro", [111.8816, -7.1502]],
  lamongan: ["Lamongan", [112.4167, -7.1167]],
};
const SURABAYA_CENTRE = [112.73777778, -7.24583333];
const r1 = x => +x.toFixed(1), r2 = x => +x.toFixed(2), r4 = x => +x.toFixed(4);
const builtStations = [
  { id: "jakarta", name: "Jakarta (Halim)", short: "Jakarta", must: true, built: true, km: 0, pos: built[0] },
  { id: "karawang", name: "Karawang", short: "Karawang", must: false, built: true, km: pK.s * kBuilt, pos: pK.pt },
  { id: "padalarang", name: "Bandung (Padalarang)", short: "Padalarang", must: true, built: true, km: pP.s * kBuilt, pos: pP.pt, off: pP.d },
  { id: "bandung", name: "Bandung (Tegalluar)", short: "Bandung", must: true, built: true, km: OFFICIAL_KM, pos: built[built.length - 1] },
];
// Where a route leaves the built line: at its end, or at Karawang for the routes that skip Bandung.
const FROM = {
  bandung: { km: OFFICIAL_KM, pos: built[built.length - 1], lead: built[built.length - 8], stations: builtStations, line: built },
  karawang: { km: pK.s * kBuilt, pos: pK.pt, lead: cut(built, pK.s - 3, pK.s)[0], stations: builtStations.slice(0, 2), line: cut(built, 0, pK.s) },
};
// extLine: geometry of the new line, starting where it leaves the built one; kExt: chainage km per measured km.
// ids: "town" for a station, "town?" for one the study holds in reserve, "town*" for one this project inferred.
const stationsFor = (from, extLine, kExt, ids, end) => {
  const st = from.stations.map(s => ({ ...s }));
  for (const spec of ids) {
    const id = spec.replace(/[?*]$/, ""), [name, centre, short, at] = C[id], p = project(extLine, at || centre);
    st.push({ id, name, short: short || name, must: false, built: false, km: from.km + p.s * kExt, pos: p.pt, ...(centre ? { off: at ? hav(p.pt, centre) : p.d } : {}), ...(spec.endsWith("?") ? { reserve: true } : {}), ...(spec.endsWith("*") ? { inferred: true } : {}) });
  }
  const last = extLine[extLine.length - 1];
  st.push({ id: "surabaya", name: end.name, short: "Surabaya", must: true, built: false, km: from.km + lineLen(extLine) * kExt, pos: last, off: hav(last, SURABAYA_CENTRE) });
  for (let i = 1; i < st.length; i++) if (st[i].km <= st[i - 1].km) throw new Error("stations out of order: " + st[i - 1].id + " / " + st[i].id);
  return st;
};
const report = (id, st) => { console.log("—", id); for (const s of st) console.log("  " + s.id.padEnd(12), s.km.toFixed(1).padStart(7), "km", s.off !== undefined ? "  " + s.off.toFixed(1) + " km from the centre" : "", s.reserve ? " (reserve)" : s.inferred ? " (inferred)" : ""); };

// ---- simplify, keeping true chainage on every retained vertex
const withKm = (line, k, s0) => { let s = 0; return line.map((p, i) => { if (i) s += hav(line[i - 1], p); return [p[0], p[1], s0 + s * k]; }); };
const simp = (line3, tol) => { const keep = new Set(simplify(line3.map(p => [p[0], p[1]]), tol).map(p => p[0] + "," + p[1])); return line3.filter(p => keep.has(p[0] + "," + p[1])); };
const fmtLine = l => l.map(p => [r4(p[0]), r4(p[1]), +p[2].toFixed(2)]);
const fullLine = (from, extLine, kExt, tol) => fmtLine([...simp(withKm(from.line, kBuilt, 0), 0.04), ...simp(withKm(extLine, kExt, from.km), tol).slice(1)]);
const outStations = st => st.map(s => ({ id: s.id, name: s.name, short: s.short, must: s.must, built: s.built, km: r1(s.km), lon: r4(s.pos[0]), lat: r4(s.pos[1]), ...(s.off !== undefined ? { off: r1(s.off) } : {}), ...(s.reserve ? { reserve: true } : {}), ...(s.inferred ? { inferred: true } : {}) }));
const newStations = st => st.filter(s => !s.built && !s.reserve).length;

const WARU = { id: "waru", name: "Surabaya (Waru)", pos: [112.726039, -7.346778] };           // the Waru interchange, on the southern edge of the city
const PASAR_TURI = { id: "pasarturi", name: "Surabaya (Pasar Turi)", pos: [112.7310, -7.2480] }; // the terminus of the north-coast main line
const routes = [];
// ---- the corridors on the comparison map of KCIC's pre-feasibility study (2024, still under review), presented by the
// transport ministry in December 2024 and published by Kompas.id. The map gives, for each of the study's three
// alternatives, the length from Tegalluar, the length in tunnel, the number of stations and the travel time, and it
// names the stations. It is a sketch on a base map, not a surveyed alignment, so each corridor is drawn here as a
// smooth curve through hand-placed waypoints at the stations and the towns between them.
const W_NORTH = [[107.800, -6.930], [107.920, -6.872], [108.030, -6.780], [108.150, -6.690], [108.330, -6.705], [108.520, -6.745]]; // Tegalluar → Sumedang → Kertajati → Cirebon
const BABAKAN = [[108.720, -6.855]];                                                                                               // shared by the central and north lines east of Cirebon
const W_SOUTH = [[107.800, -6.985], [107.900, -7.020], [107.990, -7.045], [108.080, -7.080], [108.150, -7.170], [108.220, -7.295], [108.360, -7.335], [108.540, -7.365], [108.790, -7.475], [108.980, -7.560], [109.130, -7.605], [109.245, -7.615]]; // Tegalluar → north of Garut → Tasikmalaya → Banjar → Sidareja → Kroya
const LINK_CENTRAL = [[108.880, -6.980], [109.010, -7.100], [109.020, -7.250], [109.060, -7.380], [109.160, -7.445], [109.225, -7.455], [109.235, -7.540], [109.255, -7.610]]; // Babakan → Karanganyar → Bumiayu valley, west of Mount Slamet → Purwokerto → Kroya
const MID_SOUTH = [[109.480, -7.630], [109.660, -7.685], [109.880, -7.770], [110.060, -7.885], [110.200, -7.875], [110.330, -7.840], [110.480, -7.780], [110.610, -7.720], [110.790, -7.600], [110.920, -7.500]]; // Kroya → Kebumen → Yogyakarta airport → Yogyakarta → Solo
const COAST_W = [[109.030, -6.910], [109.140, -6.920], [109.380, -6.930], [109.670, -6.930], [109.900, -6.970], [110.060, -6.990], [110.200, -6.970], [110.380, -7.020]]; // Babakan → Tegal → Pekalongan → Lebo → Semarang
const SEM_SOLO = [[110.450, -7.130], [110.530, -7.320], [110.620, -7.450], [110.720, -7.520], [110.820, -7.515], [110.920, -7.490]];   // Semarang → Salatiga → Solo
const EAST = [[111.030, -7.445], [111.250, -7.420], [111.430, -7.450], [111.540, -7.570], [111.680, -7.580], [111.900, -7.590], [112.100, -7.575], [112.240, -7.520], [112.430, -7.455], [112.580, -7.405]]; // Solo → Sragen → Madiun → Nganjuk → Mojokerto
// The same map shows the corridor of JICA's semi-high-speed study along the north coast (713 km from Jakarta, 5 passenger
// stations, 5.5 hours). Its two ends are the only parts not shared with the north line.
const JKT_CIREBON = [[107.400, -6.400], [107.650, -6.440], [107.940, -6.460], [108.300, -6.490], [108.430, -6.630], [108.520, -6.745]]; // Karawang → Cikampek → Jatibarang → Cirebon
const COAST_E = [[110.500, -7.030], [110.620, -7.060], [110.900, -7.100], [111.250, -7.130], [111.580, -7.160], [111.880, -7.170], [112.200, -7.130], [112.410, -7.140], [112.600, -7.210]]; // Semarang → Purwodadi → Cepu → Bojonegoro → Lamongan
const ST_EAST = ["surakarta", "sragen", "madiun", "nganjuk", "mojokerto"], ST_MID = ["kroya", "kebumen", "yia", "yogyakarta"];
const ST_CENTRAL = ["babakan", "karanganyar", "purwokerto"], ST_COAST_W = ["babakan", "tegal", "pekalongan", "lebo", "semarang"], ST_COAST_E = ["purwodadi*", "cepu*", "bojonegoro*", "lamongan*"];
// Station names in red on the map count toward the published number. Sumedang, Garut and Cilacap are labelled in green and
// are taken as the reserve stations: that reproduces 13, 15 and 14 exactly, though it leaves the south line two reserve
// dots where its legend says one.
const ALTS = [
  // the three alternatives of the study
  { id: "south", kind: "kcic", alt: 1, name: "Lintas Selatan", via: "Kroya, Yogyakarta", from: "bandung", end: WARU, pub: { km: 629.45, tunnelKm: 21.25, stations: 13, reserve: 1, min: 180 },
    way: [...W_SOUTH, ...MID_SOUTH, ...EAST], st: ["garut?", "tasikmalaya", "banjar", "sidareja", "cilacap?", ...ST_MID, ...ST_EAST], def: ["tasikmalaya", "yogyakarta", "surakarta"], key: "yogyakarta" },
  { id: "central", kind: "kcic", alt: 2, name: "Lintas Tengah", via: "Cirebon, Purwokerto", from: "bandung", end: WARU, pub: { km: 679.19, tunnelKm: 44.61, stations: 15, reserve: 1, min: 193 },
    way: [...W_NORTH, ...BABAKAN, ...LINK_CENTRAL, ...MID_SOUTH, ...EAST], st: ["sumedang?", "kertajati", "cirebon", ...ST_CENTRAL, ...ST_MID, ...ST_EAST], def: ["cirebon", "purwokerto", "yogyakarta", "surakarta"], key: "yogyakarta" },
  { id: "north", kind: "kcic", alt: 3, name: "Lintas Utara", via: "Cirebon, Semarang", from: "bandung", end: WARU, pub: { km: 641.96, tunnelKm: 51.95, stations: 14, reserve: 1, min: 184 },
    way: [...W_NORTH, ...BABAKAN, ...COAST_W, ...SEM_SOLO, ...EAST], st: ["sumedang?", "kertajati", "cirebon", ...ST_COAST_W, "salatiga", ...ST_EAST], def: ["cirebon", "semarang", "surakarta"], key: "semarang" },
  // the other ways of joining the corridors on that map end to end; none of these is an alternative of either study
  { id: "ncoast", kind: "combo", name: "Lintas Utara, then the north coast", via: "Cirebon, Semarang, Bojonegoro", from: "bandung", end: PASAR_TURI,
    way: [...W_NORTH, ...BABAKAN, ...COAST_W, ...COAST_E], st: ["sumedang?", "kertajati", "cirebon", ...ST_COAST_W, ...ST_COAST_E], def: ["cirebon", "semarang"], key: "semarang" },
  { id: "ccentral", kind: "combo", name: "North coast, then Lintas Tengah", via: "Cirebon, Purwokerto, Yogyakarta", from: "karawang", end: WARU,
    way: [...JKT_CIREBON, ...BABAKAN, ...LINK_CENTRAL, ...MID_SOUTH, ...EAST], st: ["jatibarang*", "cirebon", ...ST_CENTRAL, ...ST_MID, ...ST_EAST], def: ["cirebon", "purwokerto", "yogyakarta", "surakarta"], key: "yogyakarta" },
  { id: "cnorth", kind: "combo", name: "North coast, then Solo", via: "Cirebon, Semarang, Solo", from: "karawang", end: WARU,
    way: [...JKT_CIREBON, ...BABAKAN, ...COAST_W, ...SEM_SOLO, ...EAST], st: ["jatibarang*", "cirebon", ...ST_COAST_W, "salatiga", ...ST_EAST], def: ["cirebon", "semarang", "surakarta"], key: "semarang" },
  { id: "coast", kind: "combo", name: "North coast throughout", via: "Cirebon, Semarang, Bojonegoro", from: "karawang", end: PASAR_TURI, jica: { km: 713, passenger: 5, operating: 11, min: 330 },
    way: [...JKT_CIREBON, ...BABAKAN, ...COAST_W, ...COAST_E], st: ["jatibarang*", "cirebon", ...ST_COAST_W, ...ST_COAST_E], def: ["cirebon", "semarang"], key: "semarang" },
];
// Chainage is stretched so that each of the study's alternatives has its published length. The combinations have no
// published length: they get the average of those three stretches.
for (const a of ALTS) { a.fromPt = FROM[a.from]; a.extLine = spline([a.fromPt.pos, ...a.way, a.end.pos], a.fromPt.lead, 1); a.drawn = lineLen(a.extLine); }
const kcic = ALTS.filter(a => a.pub), kMean = kcic.reduce((t, a) => t + a.pub.km / a.drawn, 0) / kcic.length;
for (const a of ALTS) {
  const kExt = a.pub ? a.pub.km / a.drawn : kMean, extKm = a.pub ? a.pub.km : Math.round(a.drawn * kMean);
  a.extKm = extKm;
  const st = stationsFor(a.fromPt, a.extLine, extKm / a.drawn, a.st, a.end);
  if (a.pub && newStations(st) !== a.pub.stations) throw new Error(a.id + ": " + newStations(st) + " stations, published " + a.pub.stations);
  report(a.id, st);
  const line = fullLine(a.fromPt, a.extLine, extKm / a.drawn, 0.15);
  console.log("  drawn", a.drawn.toFixed(1), "km,", a.pub ? "published " + a.pub.km : "estimated " + extKm, "→ chainage ×" + kExt.toFixed(3), "; vertices", line.length);
  routes.push({ id: a.id, kind: a.kind, ...(a.alt ? { alt: a.alt } : {}), name: a.name, via: a.via, ...(a.from === "karawang" ? { skipsBandung: true } : {}), builtKm: r2(a.fromPt.km), extKm, drawnKm: r1(a.drawn),
    ...(a.pub ? { pub: a.pub } : { stretch: r2(kMean) }), ...(a.jica ? { jica: a.jica } : {}), nStations: newStations(st), nReserve: st.filter(s => s.reserve).length, terminus: a.end.id, line, stations: outStations(st), def: a.def, key: a.key });
}

// ---- elevation profiles: the ground under each line, and a rail level derived from it.
// The ground is sampled every PROF_STEP km of chainage. A railway cannot follow it: the rail level is the mean of the
// highest and the lowest profile that stay within the ruling gradient of the ground's valleys and summits, smoothed for
// vertical curves. Where the ground rises well above it the line would be in tunnel, where it falls well below, on viaduct.
const PROF_STEP = 0.5, MAX_GRADE = 0.030, TUNNEL_COVER = 30, VIADUCT_DROP = 15;     // km, 30 ‰ as on the built line, metres
const pointAt = (line, s) => { let d = 0; for (let i = 1; i < line.length; i++) { const seg = hav(line[i - 1], line[i]); if (d + seg >= s) { const t = seg ? (s - d) / seg : 0; return [line[i - 1][0] + t * (line[i][0] - line[i - 1][0]), line[i - 1][1] + t * (line[i][1] - line[i - 1][1])]; } d += seg; } return line[line.length - 1]; };
const samples = (line, lenKm, k) => { const n = Math.ceil(lenKm / PROF_STEP), geo = lineLen(line); return Array.from({ length: n + 1 }, (_, j) => pointAt(line, Math.min(geo, j * PROF_STEP / k))); };
const railLevel = (z, stepKm) => {
  const n = z.length, d = MAX_GRADE * stepKm * 1000, lo = z.slice(), hi = z.slice();
  for (let i = 1; i < n; i++) { lo[i] = Math.min(lo[i], lo[i - 1] + d); hi[i] = Math.max(hi[i], hi[i - 1] - d); }
  for (let i = n - 2; i >= 0; i--) { lo[i] = Math.min(lo[i], lo[i + 1] + d); hi[i] = Math.max(hi[i], hi[i + 1] - d); }
  let r = z.map((_, i) => (lo[i] + hi[i]) / 2);
  for (let pass = 0; pass < 2; pass++) r = r.map((_, i) => { let t = 0, c = 0; for (let j = Math.max(0, i - 3); j <= Math.min(n - 1, i + 3); j++) { t += r[j]; c++; } return t / c; });
  return r;
};
const profStats = (z, r) => { let tunnel = 0, viaduct = 0, up = 0, down = 0, steep = 0; for (let i = 1; i < z.length; i++) { const dz = r[i] - r[i - 1]; if (dz > 0) up += dz; else down -= dz; steep = Math.max(steep, Math.abs(dz) / (PROF_STEP * 1000)); if (z[i] - r[i] > TUNNEL_COVER) tunnel += PROF_STEP; if (r[i] - z[i] > VIADUCT_DROP) viaduct += PROF_STEP; } return { tunnel, viaduct, up, down, steep }; };
const whooshPts = samples(built, OFFICIAL_KM, kBuilt), altPts = ALTS.map(a => samples(a.extLine, a.extKm, a.extKm / a.drawn));
const elev = await elevations([...whooshPts, ...altPts.flat()]);
const whooshZ = elev.slice(0, whooshPts.length), whooshR = railLevel(whooshZ, PROF_STEP);
const at = (arr, km) => { const x = Math.max(0, Math.min(arr.length - 1, km / PROF_STEP)), i = Math.min(arr.length - 2, Math.floor(x)); return arr[i] + (x - i) * (arr[i + 1] - arr[i]); };
{ const q = profStats(whooshZ, whooshR); console.log("— elevation: built line", whooshPts.length, "samples, rail", whooshR[0].toFixed(0), "→", at(whooshR, OFFICIAL_KM).toFixed(0), "m, climbs", q.up.toFixed(0), "m, steepest", (q.steep * 1000).toFixed(1), "‰, in tunnel", q.tunnel, "km (the real line has 16.8 km)"); }
let off = whooshPts.length;
ALTS.forEach((a, n) => {
  const z = elev.slice(off, off + altPts[n].length); off += altPts[n].length;
  // rail level over the part of the built line that is used and the new line together, then tied to the built line's own level at the junction
  const lead = whooshZ.slice(0, Math.floor(a.fromPt.km / PROF_STEP) + 1), all = railLevel([...lead, ...z], PROF_STEP), r = all.slice(lead.length), gap = at(whooshR, a.fromPt.km) - r[0];
  for (let i = 0; i < r.length && i * PROF_STEP < 5; i++) r[i] += gap * (1 - i * PROF_STEP / 5);
  const q = profStats(z, r), route = routes.find(x => x.id === a.id);
  route.prof = { z: z.map(Math.round), r: r.map(r1) };
  console.log("  " + a.id.padEnd(9), z.length, "samples, highest ground", Math.max(...z).toFixed(0), "m, rail climbs", q.up.toFixed(0), "m and falls", q.down.toFixed(0), "m, steepest", (q.steep * 1000).toFixed(1), "‰; ground >" + TUNNEL_COVER + " m above rail on", q.tunnel, "km", a.pub ? "(published tunnels " + a.pub.tunnelKm + " km)" : "", "; >" + VIADUCT_DROP + " m below on", q.viaduct, "km");
});

// ---- land outline for the base map: Natural Earth 10m land, clipped to Java and simplified
const BB = [104.4, -9.4, 115.6, -5.0];
const clipRing = (ring) => {
  const edges = [[0, BB[0], 1], [0, BB[2], -1], [1, BB[1], 1], [1, BB[3], -1]];
  let pts = ring;
  for (const [ax, lim, sgn] of edges) {
    const inside = p => sgn * (p[ax] - lim) >= 0, out = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length], ia = inside(a), ib = inside(b);
      if (ia) out.push(a);
      if (ia !== ib) { const t = (lim - a[ax]) / (b[ax] - a[ax]); out.push([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]); }
    }
    pts = out; if (!pts.length) break;
  }
  return pts;
};
const land = [];
for (const f of JSON.parse(fs.readFileSync("data/ne_10m_land.geojson", "utf8")).features) {
  const polys = f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates;
  for (const poly of polys) {
    const ring = poly[0];
    if (!ring.some(p => p[0] > BB[0] && p[0] < BB[2] && p[1] > BB[1] && p[1] < BB[3])) continue;
    const c = clipRing(ring.slice(0, -1)); if (c.length < 4) continue;
    const sdone = simplify([...c, c[0]], 0.6); if (sdone.length < 4) continue;
    land.push(sdone.map(p => [+p[0].toFixed(3), +p[1].toFixed(3)]));
  }
}
console.log("land rings", land.length, "vertices", land.reduce((a, r) => a + r.length, 0));

const ROUTE = {
  builtKm: OFFICIAL_KM,
  whoosh: fmtLine(simp(withKm(built, kBuilt, 0), 0.04)),          // the whole built line, for the map
  refKm: builtStations.map(s => r1(s.km)),
  profStepKm: PROF_STEP, profMaxGrade: MAX_GRADE,                 // elevation profiles: sample spacing along the chainage, and the ruling gradient of the rail level
  whooshProf: { z: whooshZ.map(Math.round), r: whooshR.map(r1) }, // ground and rail level along the built line, from km 0                        // today's service, Halim – Karawang – Padalarang – Tegalluar: the fare is calibrated on it
  routes,
  land,
  airports: { CGK: { name: "Soekarno–Hatta (CGK)", lat: -6.12555556, lon: 106.65583333 }, HLP: { name: "Halim Perdanakusuma (HLP)", lat: -6.26638889, lon: 106.89111111 }, SUB: { name: "Juanda (SUB)", lat: -7.37972222, lon: 112.78694444 } },
};
const head = `// Generated by tools/build-route.mjs — do not edit by hand.
// Built line: © OpenStreetMap contributors (ODbL), stitched from railway=rail + highspeed=yes ways.
// Coastline: Natural Earth 10m land (public domain).
// Routes "south", "central", "north": the three alternatives of KCIC's pre-feasibility study (2024), drawn as smooth curves
// through the stations named on the study's map, chainage scaled to the published lengths.
// Routes "ncoast", "ccentral", "cnorth", "coast": the other ways of joining the corridors on that map, lengths estimated.
// Elevation: SRTM 30 m through OpenTopoData; prof.z = ground, prof.r = derived rail level, every profStepKm from where the route leaves the built line.
// line = [lon, lat, chainage km]; station km = chainage from Halim.
`;
fs.writeFileSync("route-data.js", head + "const ROUTE=" + JSON.stringify(ROUTE) + ";\n");
console.log("route-data.js", fs.statSync("route-data.js").size, "bytes");
