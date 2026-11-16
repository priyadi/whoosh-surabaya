// Merge translation batches into lang-id.js and validate placeholders.
// usage: node tools/i18n-merge.mjs <batch.json>...   (each: {"english key": "terjemahan"}; later files win)
import fs from "node:fs";
const cur = (() => { try { const s = fs.readFileSync("lang-id.js", "utf8"); return JSON.parse(s.slice(s.indexOf("{"), s.lastIndexOf("}") + 1)); } catch { return {}; } })();
for (const f of process.argv.slice(2)) Object.assign(cur, JSON.parse(fs.readFileSync(f, "utf8")));
let bad = 0;
for (const [k, v] of Object.entries(cur)) {
  const a = (k.match(/#/g) || []).length, b = (v.match(/#\d?/g) || []).length, idx = (v.match(/#\d/g) || []).length;
  if (a !== b || (idx && idx !== b)) { bad++; console.log("PLACEHOLDERS", JSON.stringify(k), "→", JSON.stringify(v)); }
}
const keys = Object.keys(cur).sort((a, b) => a.localeCompare(b));
fs.writeFileSync("lang-id.js", "// Indonesian translations for i18n.js. Keys are the English texts with numbers replaced by #.\n// Edit by hand or regenerate with tools/i18n-collect.mjs + tools/i18n-merge.mjs.\nwindow.I18N_ID=" + JSON.stringify(Object.fromEntries(keys.map(k => [k, cur[k]])), null, 0).replace(/","/g, '",\n"') + ";\n");
console.log(keys.length, "entries;", bad, "placeholder problems");
