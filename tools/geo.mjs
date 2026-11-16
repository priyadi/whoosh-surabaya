// Shared geometry helpers for the data-preparation scripts.
export const hav = (a, b) => {
  const R = 6371.0088, r = Math.PI / 180;
  const dl = (b[1] - a[1]) * r, dn = (b[0] - a[0]) * r;
  const h = Math.sin(dl / 2) ** 2 + Math.cos(a[1] * r) * Math.cos(b[1] * r) * Math.sin(dn / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};
export const lineLen = l => { let d = 0; for (let i = 1; i < l.length; i++) d += hav(l[i - 1], l[i]); return d; };

// Douglas–Peucker on [lon,lat] with a tolerance in km (equirectangular approximation, fine at this scale).
export function simplify(line, tolKm) {
  const k = Math.cos(7 * Math.PI / 180) * 111.32, ky = 110.57;
  const P = line.map(p => [p[0] * k, p[1] * ky]);
  const keep = new Uint8Array(line.length); keep[0] = keep[line.length - 1] = 1;
  const stack = [[0, line.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop(); let md = 0, mi = -1;
    const [ax, ay] = P[a], [bx, by] = P[b], dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1e-12;
    for (let i = a + 1; i < b; i++) {
      let t = ((P[i][0] - ax) * dx + (P[i][1] - ay) * dy) / L2; t = Math.max(0, Math.min(1, t));
      const d = Math.hypot(P[i][0] - ax - t * dx, P[i][1] - ay - t * dy);
      if (d > md) { md = d; mi = i; }
    }
    if (md > tolKm) { keep[mi] = 1; stack.push([a, mi], [mi, b]); }
  }
  return line.filter((_, i) => keep[i]);
}

// Chainage (km along line) of the point on the line nearest to p, plus the offset distance.
export function project(line, p) {
  let best = { d: Infinity, s: 0, pt: null }, s = 0;
  const k = Math.cos(p[1] * Math.PI / 180) * 111.32, ky = 110.57;
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1], b = line[i], seg = hav(a, b);
    const ax = (a[0] - p[0]) * k, ay = (a[1] - p[1]) * ky, bx = (b[0] - p[0]) * k, by = (b[1] - p[1]) * ky;
    const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1e-12;
    const t = Math.max(0, Math.min(1, -(ax * dx + ay * dy) / L2));
    const d = Math.hypot(ax + t * dx, ay + t * dy);
    if (d < best.d) best = { d, s: s + t * seg, pt: [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])] };
    s += seg;
  }
  return best;
}
