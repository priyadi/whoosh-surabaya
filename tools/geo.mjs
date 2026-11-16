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

// Centripetal Catmull–Rom curve through the waypoints, sampled about every stepKm. `lead` sets the direction of departure.
export function spline(pts, lead, stepKm = 1) {
  const k = Math.cos(7.2 * Math.PI / 180) * 111.32, ky = 110.57;
  const P = pts.map(p => [p[0] * k, p[1] * ky]), n = P.length;
  const Q = [lead ? [lead[0] * k, lead[1] * ky] : [2 * P[0][0] - P[1][0], 2 * P[0][1] - P[1][1]], ...P, [2 * P[n - 1][0] - P[n - 2][0], 2 * P[n - 1][1] - P[n - 2][1]]];
  const out = [];
  for (let i = 1; i < Q.length - 2; i++) {
    const [p0, p1, p2, p3] = [Q[i - 1], Q[i], Q[i + 1], Q[i + 2]];
    const d = (a, b) => Math.sqrt(Math.hypot(b[0] - a[0], b[1] - a[1])) || 1e-6;
    const t0 = 0, t1 = t0 + d(p0, p1), t2 = t1 + d(p1, p2), t3 = t2 + d(p2, p3);
    const steps = Math.max(2, Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / stepKm));
    for (let j = i === 1 ? 0 : 1; j <= steps; j++) {
      const t = t1 + (t2 - t1) * j / steps;
      const L = (a, b, ta, tb) => [((tb - t) * a[0] + (t - ta) * b[0]) / (tb - ta), ((tb - t) * a[1] + (t - ta) * b[1]) / (tb - ta)];
      const A1 = L(p0, p1, t0, t1), A2 = L(p1, p2, t1, t2), A3 = L(p2, p3, t2, t3), B1 = L(A1, A2, t0, t2), B2 = L(A2, A3, t1, t3), c = L(B1, B2, t1, t2);
      out.push([c[0] / k, c[1] / ky]);
    }
  }
  return out;
}
