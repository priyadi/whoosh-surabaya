// Verify every Wikipedia title referenced in app.js exists (following redirects), and probe the other URLs.
import fs from "node:fs";
const src = fs.readFileSync("app.js", "utf8");
const titles = [...new Set([...src.matchAll(/W_\+"([^"]+)"/g)].map(m => decodeURIComponent(m[1])))];
const missing = [];
for (let i = 0; i < titles.length; i += 40) {
  const batch = titles.slice(i, i + 40);
  const u = "https://en.wikipedia.org/w/api.php?action=query&format=json&redirects=1&titles=" + encodeURIComponent(batch.join("|"));
  const j = await (await fetch(u, { headers: { "User-Agent": "link-checker/1.0" } })).json();
  const norm = Object.fromEntries((j.query.normalized || []).map(n => [n.from, n.to]));
  const red = Object.fromEntries((j.query.redirects || []).map(n => [n.from, n.to]));
  const pages = Object.values(j.query.pages);
  for (const t of batch) { const a = norm[t] || t, b = red[a] || a; const p = pages.find(p => p.title === b); if (!p || p.missing !== undefined) missing.push(t); else if (red[a]) console.log("redirect:", t, "→", b); }
}
console.log(titles.length, "Wikipedia titles; missing:", missing.length ? missing : "none");
const others = [...new Set([...src.matchAll(/"(https?:\/\/[^"]+)"/g)].map(m => m[1]).filter(u => !u.includes("wikipedia.org/wiki/")))];
for (const u of others) { try { const r = await fetch(u, { method: "GET", redirect: "follow", headers: { "User-Agent": "Mozilla/5.0 link-checker" }, signal: AbortSignal.timeout(20000) }); console.log(r.status, u); } catch (e) { console.log("ERR", e.cause?.code || e.name, u); } }
