// Ground elevation for a list of points, from SRTM 30 m through the public OpenTopoData API.
// Answers are cached in data/elevation.json, so a rebuild only fetches points it has not seen.
import fs from "node:fs";
const FILE = "data/elevation.json", API = "https://api.opentopodata.org/v1/srtm30m?locations=", BATCH = 100;
const key = p => p[0].toFixed(4) + "," + p[1].toFixed(4);
const sleep = ms => new Promise(r => setTimeout(r, ms));
export async function elevations(points) {            // [[lon, lat], …] → metres above sea level
  const cache = fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE, "utf8")) : {};
  const need = [...new Set(points.map(key))].filter(k => !(k in cache));
  if (need.length) console.log("elevation: fetching", need.length, "points in", Math.ceil(need.length / BATCH), "requests");
  for (let i = 0; i < need.length; i += BATCH) {
    const batch = need.slice(i, i + BATCH), url = API + batch.map(k => k.split(",").reverse().join(",")).join("|");
    for (let attempt = 1; ; attempt++) {
      const r = await fetch(url, { headers: { "User-Agent": "elevation-fetch/1.0" } }).catch(() => null);
      const j = r && r.ok ? await r.json().catch(() => null) : null;
      if (j && j.status === "OK" && j.results.length === batch.length) { j.results.forEach((x, n) => { cache[batch[n]] = x.elevation ?? 0; }); break; }
      if (attempt >= 5) { fs.writeFileSync(FILE, JSON.stringify(cache)); throw new Error("elevation: request failed after 5 attempts (HTTP " + (r ? r.status : "no response") + "); what was fetched is saved, run again to continue"); }
      await sleep(3000 * attempt);
    }
    if (i % (BATCH * 10) === 0) fs.writeFileSync(FILE, JSON.stringify(cache));
    await sleep(1100);                                 // the API allows one request per second
  }
  if (need.length) fs.writeFileSync(FILE, JSON.stringify(cache));
  return points.map(p => cache[key(p)]);
}
