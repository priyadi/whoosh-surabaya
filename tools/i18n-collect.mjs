// Load the page in Indonesian mode, exercise it, and list every text that has no translation yet.
// usage: node tools/i18n-collect.mjs [out.json]
import { createRequire } from "node:module";
import { execSync } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
const require = createRequire(path.join(execSync("npm root -g").toString().trim(), "x.js"));
const puppeteer = require("puppeteer");
const browser = await puppeteer.launch({ executablePath: "/usr/bin/google-chrome-stable", headless: "new", args: ["--no-sandbox", "--allow-file-access-from-files"] });
const page = await browser.newPage();
await page.setViewport({ width: 1500, height: 1000 });
const errs = [];
page.on("pageerror", e => errs.push(e.message));
await page.goto("file://" + path.resolve("index.html") + "?lang=id", { waitUntil: "networkidle2" });
await new Promise(r => setTimeout(r, 800));
const keys = await page.evaluate(async () => {
  const tick = () => new Promise(r => setTimeout(r, 0));
  const tips = () => document.querySelectorAll("[data-tip]").forEach(e => { const d = document.createElement("div"); d.innerHTML = e.dataset.tip; const w = document.createTreeWalker(d, NodeFilter.SHOW_TEXT); while (w.nextNode()) I18N.tr(w.currentNode.nodeValue); });
  // every reference popup
  for (const id of Object.keys(REFS)) { openRefs(id); await tick(); }
  closeRefs();
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (const route of [...ROUTES.map(r => r.id).filter(id => id !== ROUTE_DEF), ROUTE_DEF]) {
    setRoute(route); await tick();
    // presets
    for (let i = 0; i < PRESETS.length; i++) { document.getElementById("preset").value = String(i); applyPreset(i); await tick(); tips(); }
    // random scenarios, to reach every verdict and wording variant
    for (let k = 0; k < (route === ROUTE_DEF ? 250 : 40); k++) {
      CTLS.forEach(c => { const el = document.getElementById("in_" + c.id); if (c.type === "toggle") el.checked = rnd() < 0.5; else { const r = rnd(); el.value = r < 0.15 ? c.min : r > 0.85 ? c.max : +c.min + (c.max - c.min) * rnd(); } });
      stops.clear(); OPT.forEach(o => { if (rnd() < 0.5) stops.add(o); });
      markCustom(); update(); await tick(); if (k % 10 === 0) tips();
    }
  }
  document.getElementById("copyNote").textContent = "copied"; await tick();
  document.getElementById("copyNote").textContent = "copy the address bar"; await tick();
  // speed-chart tooltip texts
  ["built Whoosh line", "rail 1 m", "ground 1 m", "gradient 1 ‰", "gradient -1 ‰"].forEach(x => I18N.tr(x));
  // drop texts that are only proper names (stations, city pairs), which stay as they are
  const names=[...ROUTES.flatMap(r=>[...r.stations.map(x=>x.name),...(r.kind==="kcic"?[r.name]:[]),"via "+r.via,...r.via.split(", ")]),...Object.values(SHORT),...PEERS.map(p=>p.n),"Tegalluar","Halim","Solo","Waru","HLP","CGK","SUB","OpenStreetMap","OSRM","Natural Earth","Jakarta–Bandung","Beijing–Shanghai","Jakarta–Surabaya"].sort((a,b)=>b.length-a.length);
  const bare=k=>{let t=k;for(const n of names)t=t.split(n).join("");return !/[A-Za-z]{2}/.test(t);};
  return [...I18N.missing].filter(k=>!bare(k));
});
await browser.close();
const out = process.argv[2];
if (out) fs.writeFileSync(out, JSON.stringify(keys, null, 1));
console.log(keys.length, "untranslated keys;", errs.length ? "ERRORS: " + errs.join(" | ") : "no page errors");
if (!out) console.log(keys.join("\n"));
