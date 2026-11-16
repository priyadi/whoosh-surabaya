// Load the page in headless Chrome, report console errors, dump key outputs, take screenshots.
// usage: node tools/shot.mjs [query-string] [outfile-prefix] [width]
import { createRequire } from "node:module";
import { execSync } from "node:child_process";
import path from "node:path";
const require = createRequire(path.join(execSync("npm root -g").toString().trim(), "x.js"));
const puppeteer = require("puppeteer");
const [, , qs = "", prefix = "/tmp/whoosh-shot", width = "1500"] = process.argv;
const browser = await puppeteer.launch({ executablePath: "/usr/bin/google-chrome-stable", headless: "new", args: ["--no-sandbox", "--allow-file-access-from-files"] });
const page = await browser.newPage();
await page.setViewport({ width: +width, height: 1000 });
const errs = [];
page.on("console", m => { if (m.type() === "error" || m.type() === "warning") errs.push(m.type() + ": " + m.text()); });
page.on("pageerror", e => errs.push("pageerror: " + e.message));
await page.goto("file://" + path.resolve("index.html") + (qs ? "?" + qs : ""), { waitUntil: "networkidle2", timeout: 60000 });
await new Promise(r => setTimeout(r, 1500));
const out = await page.evaluate(() => ({
  overall: document.getElementById("overall").innerText,
  verdicts: [...document.querySelectorAll(".vcard")].map(v => v.innerText.replace(/\n+/g, " | ")),
  tiles: [...document.querySelectorAll(".tile")].map(v => v.innerText.replace(/\n+/g, " | ")),
  cards: [...document.querySelectorAll("#cards .card")].map(c => c.innerText),
  url: location.search, leaflet: !!window.L,
}));
console.log(JSON.stringify(out, null, 1).replace(/\\n/g, "\n   ").replace(/\\t/g, "  →  "));
console.log("ERRORS:", errs.length ? errs.join("\n") : "none");
// full-page screenshot of the main column: expand the scroll containers first
await page.addStyleTag({ content: "body{height:auto!important;overflow:visible!important;display:block!important} aside,main{overflow:visible!important} .layout{height:auto!important}" });
await new Promise(r => setTimeout(r, 800));
await page.screenshot({ path: prefix + "-full.png", fullPage: true });
await browser.close();
