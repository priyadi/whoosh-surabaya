// Draw the social preview image (Open Graph / Twitter card), 1200 × 630, from the live page:
// the map geometry, the arrival times and the headline numbers are read from index.html at its defaults,
// so re-run this after changing the defaults or the route data.
// usage: node tools/social.mjs [outfile]      (default: social.png)
import { createRequire } from "node:module";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
const require = createRequire(path.join(execSync("npm root -g").toString().trim(), "x.js"));
const puppeteer = require("puppeteer");
const [, , outfile = "social.png"] = process.argv;
const W = 1200, H = 630;

const browser = await puppeteer.launch({ executablePath: "/usr/bin/google-chrome-stable", headless: "new", args: ["--no-sandbox", "--allow-file-access-from-files"] });
const page = await browser.newPage();
await page.setViewport({ width: 1500, height: 1000 });
await page.goto("file://" + path.resolve("index.html") + "?lang=en", { waitUntil: "load" });
await new Promise(r => setTimeout(r, 1000));

const d = await page.evaluate(() => {
  const svg = document.querySelector("#map svg"), q = (s, r = svg) => [...r.querySelectorAll(s)];
  const tile = key => {
    const t = [...document.querySelectorAll(".tile")].find(t => t.querySelector(".k").innerText.toUpperCase().includes(key));
    if (!t) throw new Error("tile not found: " + key);
    return { v: t.querySelector(".v").innerText.trim(), sub: t.querySelector(".sub").innerText };
  };
  return {
    vb: svg.getAttribute("viewBox").split(" ").map(Number),
    land: svg.querySelector(":scope > path").getAttribute("d"),
    others: q("[data-route] path:first-child").map(p => p.getAttribute("d")),
    ext: svg.querySelector(':scope > path[stroke="var(--s3)"]').getAttribute("d"),
    built: svg.querySelector(':scope > path[stroke="var(--s1)"][stroke-width="3.5"]').getAttribute("d"),
    flight: q(':scope > line[stroke="var(--s2)"]').map(l => ["x1", "y1", "x2", "y2"].map(a => +l.getAttribute(a)))[0],
    stations: q(":scope > g[data-tip]").filter(g => g.querySelectorAll("circle").length === 2).map(g => {
      const c = g.querySelectorAll("circle")[1], t = g.querySelector("text"), time = t && t.querySelector("tspan");
      return { x: +c.getAttribute("cx"), y: +c.getAttribute("cy"), served: c.getAttribute("r") === "6.5", blue: c.getAttribute("stroke") === "var(--s1)",
        name: t ? t.firstChild.textContent.trim() : "", time: time ? time.textContent.trim() : "" };
    }),
    train: tile("BY TRAIN"), build: tile("EXTENSION TO BUILD"),
  };
});

const km = d.train.sub.match(/([\d,.]+)\s*km/)[1], newKm = d.build.sub.match(/([\d,.]+)\s*km/)[1];
const S = W / d.vb[2], TY = 122;                       // the map fills the width; Java sits below the heading
const C = { bg: "#0e0f12", land: "#1b1e25", coast: "#3a3d47", text: "#f0efec", text2: "#c3c2b7", muted: "#8d8c84", rail: "#3987e5", ext: "#199e70", air: "#d95926" };
// the cities worth naming at this size, and where their label goes
const LABEL = { Jakarta: [12, -10, "start"], Bandung: [-13, 5, "end"], Tasikmalaya: [6, -14, "start"], Yogyakarta: [10, 21, "start"], Surakarta: [-6, -14, "end"], Surabaya: [0, -16, "end"] };
const esc = s => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");

let map = `<path d="${d.land}" fill="${C.land}" stroke="${C.coast}" stroke-width=".9" stroke-linejoin="round"/>`;
for (const o of d.others) map += `<path d="${o}" fill="none" stroke="#7d808c" stroke-width="1.3" stroke-dasharray="5 4" stroke-linejoin="round" opacity=".55"/>`;
map += `<line x1="${d.flight[0]}" y1="${d.flight[1]}" x2="${d.flight[2]}" y2="${d.flight[3]}" stroke="${C.air}" stroke-width="1.8" stroke-dasharray="7 6" opacity=".9"/>`;
map += `<path d="${d.ext}" fill="none" stroke="${C.ext}" stroke-width="4.2" stroke-linejoin="round" stroke-linecap="round"/><path d="${d.built}" fill="none" stroke="${C.rail}" stroke-width="4.2" stroke-linejoin="round" stroke-linecap="round"/>`;
for (const s of d.stations) if (!s.served) map += `<circle cx="${s.x}" cy="${s.y}" r="2.6" fill="${C.bg}" stroke="${C.ext}" stroke-width="1.3"/>`;
for (const s of d.stations) if (s.served) {
  map += `<circle cx="${s.x}" cy="${s.y}" r="6.2" fill="#fff" stroke="${s.blue ? C.rail : C.ext}" stroke-width="3"/>`;
  const L = LABEL[s.name]; if (!L) continue;
  map += `<text x="${s.x + L[0]}" y="${s.y + L[1]}" text-anchor="${L[2]}" font-size="16" font-weight="650" fill="${C.text}" stroke="${C.bg}" stroke-width="4" paint-order="stroke" stroke-linejoin="round">${esc(s.name)}${s.time ? ` <tspan font-weight="450" fill="${C.text2}">${s.time}</tspan>` : ""}</text>`;
}

const logo = readFileSync("whoosh-logo.svg", "utf8").replace(/<\?xml[^>]*>/, "").replace(/width="[\d.]+" height="[\d.]+"/, 'height="58"');
const stat = (v, k) => `<div><div class="v">${esc(v)}</div><div class="k">${esc(k)}</div></div>`;
const key = (mark, text) => `<span>${mark}${text}</span>`, dash = (c, da) => `<svg width="30" height="8"><line x1="1" y1="4" x2="29" y2="4" stroke="${c}" stroke-width="${da ? 2.4 : 4.5}" stroke-linecap="round" ${da ? `stroke-dasharray="${da}"` : ""}/></svg>`;

const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
  *{box-sizing:border-box;margin:0}
  body{width:${W}px;height:${H}px;overflow:hidden;position:relative;background:${C.bg};color:${C.text};font-family:"Inter",system-ui,sans-serif}
  .map{position:absolute;inset:0}
  .fade{position:absolute;inset:0 0 auto 0;height:190px;background:linear-gradient(${C.bg} 55%,transparent)}
  .head{position:absolute;left:56px;top:46px;right:56px}
  h1{display:flex;align-items:baseline;gap:18px;font-size:54px;font-weight:500;letter-spacing:-.02em;line-height:1}
  h1 svg{flex:0 0 auto;position:relative;top:3px}
  .tag{margin-top:20px;font-size:27px;color:${C.text2};letter-spacing:-.005em}
  .stats{position:absolute;left:56px;bottom:44px;display:flex;gap:44px}
  .v{font-size:45px;font-weight:650;letter-spacing:-.02em;line-height:1.05;font-variant-numeric:tabular-nums;white-space:nowrap}
  .k{margin-top:5px;font-size:17px;color:${C.text2};white-space:nowrap}
  .keys{position:absolute;right:56px;top:196px;display:flex;flex-direction:column;gap:7px;font-size:16px;color:${C.text2}}
  .keys span{display:flex;align-items:center;gap:10px}
</style></head><body>
  <svg class="map" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><g transform="translate(0 ${TY}) scale(${S})">${map}</g></svg>
  <div class="fade"></div>
  <div class="head"><h1>${logo}<span>to Surabaya</span></h1>
    <div class="tag">What if Indonesia’s high-speed railway ran on across Java?</div></div>
  <div class="stats">${stat(d.train.v, "Jakarta → Surabaya by train")}${stat(km + " km", newKm + " km of it new line")}${stat(d.build.v, "to build the extension")}</div>
  <div class="keys">${key(dash(C.rail), "built line")}${key(dash(C.ext), "proposed extension")}${key(dash("#7d808c", "5 4"), "other routes")}${key(dash(C.air, "7 6"), "flight")}</div>
</body></html>`;

const card = await browser.newPage();
await card.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
await card.setContent(html, { waitUntil: "load" });
await card.evaluate(() => document.fonts.ready);
await card.screenshot({ path: outfile, type: "png" });
await browser.close();
console.log(`${outfile}: ${d.train.v} · ${km} km · ${newKm} km new · ${d.build.v} · ${d.stations.filter(s => s.served).map(s => s.name + (s.time ? " " + s.time : "")).join(", ")}`);
