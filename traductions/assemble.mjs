// Assemble src/i18n/<lang>.js : données (lots numérotés <lang>_data_*.txt) + interface (<lang>_ui.json, clé = phrase française)
import fs from "fs";
const [lang, out] = process.argv.slice(2);
const D = new URL(".", import.meta.url).pathname;   // ce dossier : traductions/
const fr = JSON.parse(fs.readFileSync(D + "data_fr.json", "utf8"));
const dict = {};
const tr = {};
for (const f of fs.readdirSync(D).filter((f) => f.startsWith(lang + "_data_") && f.endsWith(".txt")))
  for (const line of fs.readFileSync(D + f, "utf8").split("\n")) { if (!line.trim()) continue; const i = line.indexOf("\t"); tr[+line.slice(0, i)] = line.slice(i + 1); }
const missing = fr.map((_, i) => i).filter((i) => !(i in tr));
fr.forEach((s, i) => { if (tr[i] != null && tr[i] !== s) dict[s] = tr[i]; });
let ui = 0;
const uiFile = D + lang + "_ui.json";
if (fs.existsSync(uiFile)) for (const [k, v] of Object.entries(JSON.parse(fs.readFileSync(uiFile, "utf8")))) { if (v && v !== k) { dict[k] = v; ui++; } }
fs.writeFileSync(out, `// Traductions (${lang}) : « texte français » -> traduction. Fichier généré : données + interface.\nexport default ${JSON.stringify(dict, null, 1)};\n`);
console.log(lang, "données:", fr.length - missing.length, "/", fr.length, "manquantes:", missing.length, "| interface:", ui, "| entrées:", Object.keys(dict).length);
