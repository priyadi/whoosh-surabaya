// Build route-data.js from the fetched geometry.
// usage: node tools/build-route.mjs   (run from the project root)
//
// Inputs (data/):
//   hsr_line.json  – built Jakarta–Bandung high-speed line, stitched from OpenStreetMap by stitch-hsr.mjs
//   osrm_ext.json  – OSRM driving route pinned to the Trans-Java toll roads, Cileunyi → Waru
// Output: route-data.js, defining ROUTE = { line:[[lon,lat,km],…], stations:[…], tolls:[…] }
import fs from "node:fs";
import { hav, lineLen, simplify, project } from "./geo.mjs";

const OFFICIAL_KM = 142.3; // published length of the built line, Halim → Tegalluar
const hsr = JSON.parse(fs.readFileSync("data/hsr_line.json", "utf8"));
const osrm = JSON.parse(fs.readFileSync("data/osrm_ext.json", "utf8")).routes[0];

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

// ---- extension: straight connector from Tegalluar station to the toll, then the toll corridor
const ext = [built[built.length - 1], ...osrm.geometry.coordinates];
const extLen = lineLen(ext);
console.log("extension", extLen.toFixed(2), "km (OSRM says", (osrm.distance / 1000).toFixed(2), "+ connector", hav(ext[0], ext[1]).toFixed(2), ")");

// Toll roads traversed, with chainage along the extension
const tolls = []; { let d = hav(ext[0], ext[1]);
  for (const leg of osrm.legs) for (const st of leg.steps) {
    const name = st.name.replace(/^Jalan Tol /, ""), last = tolls[tolls.length - 1];
    if (/^Jalan Tol /.test(st.name)) { if (last && last.name === name) last.to = d + st.distance / 1000; else tolls.push({ name, from: d, to: d + st.distance / 1000 }); }
    d += st.distance / 1000;
  } }

// ---- stations: existing ones at their real position; new ones at the point of the toll corridor nearest the city centre
const CITIES = [
  ["cirebon", "Cirebon", [108.5574, -6.7071]],
  ["tegal", "Tegal", [109.1418, -6.8674]],
  ["pekalongan", "Pekalongan", [109.66666667, -6.88333333]],
  ["semarang", "Semarang", [110.4225, -6.99]],
  ["surakarta", "Surakarta (Solo)", [110.81666667, -7.56666667]],
  ["madiun", "Madiun", [111.52305556, -7.63]],
  ["mojokerto", "Mojokerto", [112.4320, -7.4632]],
];
const r1 = x => +x.toFixed(1), r4 = x => +x.toFixed(4);
const stations = [
  { id: "jakarta", name: "Jakarta (Halim)", must: true, built: true, km: 0, pos: built[0] },
  { id: "karawang", name: "Karawang", must: false, built: true, km: pK.s * kBuilt, pos: pK.pt },
  { id: "padalarang", name: "Bandung (Padalarang)", must: true, built: true, km: pP.s * kBuilt, pos: pP.pt, off: pP.d },
  { id: "bandung", name: "Bandung (Tegalluar)", must: true, built: true, km: OFFICIAL_KM, pos: built[built.length - 1] },
];
for (const [id, name, c] of CITIES) {
  const p = project(ext, c);
  stations.push({ id, name, must: false, built: false, km: OFFICIAL_KM + p.s, pos: p.pt, off: p.d });
}
stations.push({ id: "surabaya", name: "Surabaya (Waru)", must: true, built: false, km: OFFICIAL_KM + extLen, pos: ext[ext.length - 1], off: hav(ext[ext.length - 1], [112.73777778, -7.24583333]) });
for (const s of stations) console.log(s.id.padEnd(11), s.km.toFixed(1).padStart(7), "km", s.off !== undefined ? "  " + s.off.toFixed(1) + " km from city centre" : "");

// ---- simplify, keeping true chainage on every retained vertex
const withKm = (line, k, s0) => { let s = 0; return line.map((p, i) => { if (i) s += hav(line[i - 1], p); return [p[0], p[1], s0 + s * k]; }); };
const simp = (line3, tol) => { const keep = new Set(simplify(line3.map(p => [p[0], p[1]]), tol).map(p => p[0] + "," + p[1])); return line3.filter(p => keep.has(p[0] + "," + p[1])); };
const A = simp(withKm(built, kBuilt, 0), 0.04), B = simp(withKm(ext, 1, OFFICIAL_KM), 0.07);
const line = [...A, ...B.slice(1)].map(p => [r4(p[0]), r4(p[1]), +p[2].toFixed(2)]);
console.log("vertices", A.length, "+", B.length, "; simplified length", lineLen(line).toFixed(1), "of", (OFFICIAL_KM + extLen).toFixed(1));

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
  builtKm: OFFICIAL_KM, extKm: +extLen.toFixed(2),
  line,
  stations: stations.map(s => ({ id: s.id, name: s.name, must: s.must, built: s.built, km: r1(s.km), lon: r4(s.pos[0]), lat: r4(s.pos[1]), ...(s.off !== undefined ? { off: r1(s.off) } : {}) })),
  tolls: tolls.map(t => ({ name: t.name, from: r1(OFFICIAL_KM + t.from), to: r1(OFFICIAL_KM + t.to) })),
  land,
  airports: { CGK: { name: "Soekarno–Hatta (CGK)", lat: -6.12555556, lon: 106.65583333 }, HLP: { name: "Halim Perdanakusuma (HLP)", lat: -6.26638889, lon: 106.89111111 }, SUB: { name: "Juanda (SUB)", lat: -7.37972222, lon: 112.78694444 } },
};
const head = `// Generated by tools/build-route.mjs — do not edit by hand.
// Built line: © OpenStreetMap contributors (ODbL), stitched from railway=rail + highspeed=yes ways.
// Coastline: Natural Earth 10m land (public domain).
// Extension: OSRM driving route over OpenStreetMap data, pinned to the Trans-Java toll roads.
// line = [lon, lat, chainage km]; station km = chainage from Halim.
`;
fs.writeFileSync("route-data.js", head + "const ROUTE=" + JSON.stringify(ROUTE) + ";\n");
console.log("route-data.js", fs.statSync("route-data.js").size, "bytes");
