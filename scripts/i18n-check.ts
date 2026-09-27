/* Checks the translations.
   npx tsx --tsconfig tsconfig.json scripts/i18n-check.ts [--suspects]
   1. every t("…") string used in src/ has an English and a French translation;
   2. every translation keeps the same {variables} as the Portuguese;
   3. with --suspects: Portuguese-looking text in .tsx/.ts files that is NOT wrapped in t(). */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { DICT } from "../src/i18n";

const ROOT = join(__dirname, "..", "src");
const files: string[] = [];
const walk = (d: string) => {
  for (const f of readdirSync(d)) {
    const p = join(d, f);
    if (statSync(p).isDirectory()) { if (f !== "i18n") walk(p); }
    else if (/\.(tsx?|mts)$/.test(f) && !f.endsWith(".d.ts") && !p.endsWith("lib/i18n.ts")) files.push(p);
  }
};
walk(ROOT);

// t("...") with a plain double-quoted literal (escaped quotes allowed)
const T_RE = /\b[tL]\(\s*"((?:[^"\\]|\\.)*)"/g;
const unq = (s: string) => JSON.parse(`"${s}"`) as string;
const used = new Map<string, string[]>();
let badCalls = 0;
for (const f of files) {
  const src = readFileSync(f, "utf8");
  for (const m of src.matchAll(T_RE)) {
    const k = unq(m[1]);
    used.set(k, [...(used.get(k) ?? []), f.replace(ROOT, "src")]);
  }
  // t(`…`) or t(variable) can't be checked
  for (const m of src.matchAll(/\bt\(\s*(`|'|[a-zA-Z_])/g)) {
    const line = src.slice(0, m.index).split("\n").length;
    const around = src.slice(m.index!, m.index! + 60).split("\n")[0];
    if (/^t\(\s*[a-zA-Z_]/.test(around) && /t\(\s*(k|key|label|s|str|msg|text|x)\b/.test(around)) continue; // dynamic, deliberate
    console.log(`NOT A LITERAL  ${f.replace(ROOT, "src")}:${line}  ${around}`);
    badCalls++;
  }
}

const vars = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(",");
let missing = 0, mismatch = 0;
for (const [k, where] of used) {
  for (const lang of ["en", "fr"] as const) {
    const v = DICT[lang][k];
    if (v === undefined) { missing++; console.log(`MISSING ${lang}  "${k}"  (${where[0]})`); }
    else if (vars(v) !== vars(k)) { mismatch++; console.log(`VARS ${lang}  "${k}" → "${v}"`); }
  }
}
const unusedEn = Object.keys(DICT.en).filter((k) => !used.has(k)).length;

if (process.argv.includes("--suspects")) {
  // JSX text or string literals that look Portuguese and are not inside t(…)
  const PT = /[ãõçáéíóúâêôà]|\b(não|sem|com|para|jogo|jogos|treino|jogador|equipa|guardar|apagar|cancelar|editar|novo|nova|adicionar|próximo|época|período)\b/i;
  let n = 0;
  for (const f of files) {
    if (/i18n\.ts$/.test(f)) continue;
    const lines = readFileSync(f, "utf8").split("\n");
    lines.forEach((ln, i) => {
      if (/^\s*(\/\/|\*|\/\*)/.test(ln) || /console\.|import |t\("/.test(ln) && !/>[^<{]*[a-zA-Zà-ú]{3,}[^<{]*</.test(ln.replace(/\{t\("(?:[^"\\]|\\.)*"[^}]*\)\}/g, ""))) return;
      const stripped = ln.replace(/\bt\(\s*"(?:[^"\\]|\\.)*"(?:\s*,[^)]*)?\)/g, "").replace(/\/\/.*$/, "");
      const jsx = [...stripped.matchAll(/>([^<>{}]*[A-Za-zÀ-ú]{2,}[^<>{}]*)</g)].map((m) => m[1].trim()).filter(Boolean);
      const lits = [...stripped.matchAll(/"([^"\\]*(?:\\.[^"\\]*)*)"|`([^`$]*)`/g)].map((m) => (m[1] ?? m[2] ?? "").trim())
        .filter((s) => s.length > 2 && / /.test(s) && PT.test(s) && !/^[a-z-]+( [a-z-:/[\]0-9.]+)+$/.test(s));
      const hits = [...jsx.filter((s) => PT.test(s) || /[A-Za-zÀ-ú]{4,}/.test(s)), ...lits];
      if (hits.length) { n++; console.log(`SUSPECT ${f.replace(ROOT, "src")}:${i + 1}  ${hits.join(" | ").slice(0, 140)}`); }
    });
  }
  console.log(`\n${n} suspect lines`);
}

console.log(`\n${used.size} strings used · ${missing} missing · ${mismatch} variable mismatches · ${badCalls} non-literal t() calls · ${unusedEn} unused translations`);
process.exit(missing || mismatch ? 1 : 0);
