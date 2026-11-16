// Stitch the OSM ways of the Jakarta–Bandung high-speed line into one polyline (Halim → Tegalluar).
// usage: node stitch-hsr.mjs <hsr_osm.json> <out.json>
import fs from "node:fs";
import { hav, lineLen } from "./geo.mjs";
const [, , inp, out] = process.argv;
const j = JSON.parse(fs.readFileSync(inp, "utf8"));
const ways = j.elements.filter(w => w.type === "way" && w.tags && w.tags.usage === "main" && !w.tags.service);
const key = p => p.lon.toFixed(7) + "," + p.lat.toFixed(7);
const adj = new Map(), pos = new Map();
const link = (a, b, d) => { (adj.get(a) ?? adj.set(a, []).get(a)).push([b, d]); };
for (const w of ways) for (let i = 0; i < w.geometry.length; i++) {
  const p = w.geometry[i], k = key(p); pos.set(k, [p.lon, p.lat]);
  if (i) { const q = w.geometry[i - 1], d = hav([q.lon, q.lat], [p.lon, p.lat]); link(key(q), k, d); link(k, key(q), d); }
}
// Terminals: westernmost node (Halim) and easternmost node (Tegalluar depot end is trimmed later by station projection).
let src = null, dst = null;
for (const [k, p] of pos) { if (!src || p[0] < pos.get(src)[0]) src = k; if (!dst || p[0] > pos.get(dst)[0]) dst = k; }
// Dijkstra with a simple binary heap.
const dist = new Map([[src, 0]]), prev = new Map(), heap = [[0, src]];
const push = x => { heap.push(x); let i = heap.length - 1; while (i) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break;[heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
const pop = () => { const t = heap[0], l = heap.pop(); if (heap.length) { heap[0] = l; let i = 0; for (;;) { let m = i; const a = 2 * i + 1, b = a + 1; if (a < heap.length && heap[a][0] < heap[m][0]) m = a; if (b < heap.length && heap[b][0] < heap[m][0]) m = b; if (m === i) break;[heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return t; };
while (heap.length) {
  const [d, u] = pop(); if (d > dist.get(u)) continue; if (u === dst) break;
  for (const [v, w] of adj.get(u) || []) { const nd = d + w; if (nd < (dist.get(v) ?? Infinity)) { dist.set(v, nd); prev.set(v, u); push([nd, v]); } }
}
if (!dist.has(dst)) { console.error("no connected path between terminals"); process.exit(1); }
const line = []; for (let k = dst; k; k = prev.get(k)) line.push(pos.get(k)); line.reverse();
console.log("nodes", pos.size, "path points", line.length, "length km", lineLen(line).toFixed(2));
fs.writeFileSync(out, JSON.stringify(line));
