import fs from "node:fs";
import path from "node:path";

function flatten(obj, prefix = "", out = new Set()) {
  for (const [key, value] of Object.entries(obj)) {
    const next = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === "object" && !Array.isArray(value)) flatten(value, next, out);
    else out.add(next);
  }
  return out;
}

function keysOf(file) {
  return flatten(JSON.parse(fs.readFileSync(file, "utf8")));
}

function walk(dir, acc = []) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) walk(full, acc);
    else if (/\.(ts|tsx)$/.test(name)) acc.push(full);
  }
  return acc;
}

const en = keysOf("client/src/i18n/locales/en.json");
const uz = keysOf("client/src/i18n/locales/uz.json");
const ru = keysOf("client/src/i18n/locales/ru.json");
const used = new Set();
for (const file of walk("client/src")) {
  const text = fs.readFileSync(file, "utf8");
  for (const match of text.matchAll(/\bt\(\s*['"`]([^'"`]+)['"`]/g)) {
    if (!match[1].includes("${")) used.add(match[1]);
  }
}

const report = {
  missingUz: [...en].filter((key) => !uz.has(key)),
  missingRu: [...en].filter((key) => !ru.has(key)),
  extraUz: [...uz].filter((key) => !en.has(key)),
  extraRu: [...ru].filter((key) => !en.has(key)),
  missingUsed: [...used].filter((key) => !en.has(key)),
};
console.log(JSON.stringify(report, null, 2));
if (report.missingUz.length || report.missingRu.length || report.missingUsed.length) process.exitCode = 1;
