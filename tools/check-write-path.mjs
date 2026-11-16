/**
 * check-write-path.mjs — cumplimiento de la ruta ÚNICA de escritura (Fase 3 §3.5).
 *
 * Grep determinista, sin dependencias: nadie fuera de `src/storage.js` puede
 * tocar la clave del save. Se ejecuta con `npm run check:write-path` y también
 * desde `tests/fase3-write-path.test.js`.
 *
 * Reglas:
 *  1. Recorre todos los `.js` de `js/` y `src/`.
 *  2. Falla si fuera de `src/storage.js` se usa `STORAGE_KEYS.bundle`.
 *  3. Falla si fuera de `src/storage.js` el literal de la clave aparece junto a
 *     `localStorage`, `getItem`, `setItem` o `removeItem` (o `STORAGE_KEYS`).
 *  4. `src/shape.js` puede declarar el literal como constante de formato
 *     (`ODEA2_BUNDLE_FORMAT`), pero no usarlo como clave de storage.
 *  5. `js/browser-storage.js` solo toca la sonda `__odea2_probe__`.
 *  6. `js/storage-watch.js` puede nombrar el literal como `SAVE_KEY` para
 *     escuchar el evento `storage`; no puede escribir la clave.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const SAVE_KEY = "odea2_bundle_v1";
export const SAVE_KEY_LITERAL = `"${SAVE_KEY}"`;
export const SCAN_DIRS = ["js", "src"];
export const WRITER = "src/storage.js";

const DANGEROUS = /(?:\blocalStorage\s*[.[])|(?:\.(?:getItem|setItem|removeItem)\s*\()/;

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.isFile() && entry.name.endsWith(".js")) out.push(full);
  }
  return out;
}

function allowedLiteral(rel, line) {
  if (rel === "src/shape.js") return line.includes("ODEA2_BUNDLE_FORMAT");
  if (rel === "js/storage-watch.js") return line.includes("SAVE_KEY");
  return false;
}

export function scanWritePath(root) {
  const violations = [];

  for (const dir of SCAN_DIRS) {
    for (const full of walk(path.join(root, dir))) {
      const rel = path.relative(root, full).split(path.sep).join("/");
      if (rel === WRITER) continue;

      const lines = fs.readFileSync(full, "utf8").split(/\r?\n/);
      lines.forEach((line, index) => {
        const where = { file: rel, line: index + 1, text: line.trim() };

        if (/STORAGE_KEYS\.bundle/.test(line)) {
          violations.push({ ...where, reason: "usa STORAGE_KEYS.bundle fuera de src/storage.js" });
          return;
        }

        if (rel === "js/browser-storage.js" && line.includes(SAVE_KEY)) {
          violations.push({ ...where, reason: "browser-storage.js no puede tocar la clave del save" });
          return;
        }

        if (!line.includes(SAVE_KEY)) return;
        if (!DANGEROUS.test(line) && !line.includes("STORAGE_KEYS")) return;
        if (allowedLiteral(rel, line)) return;
        violations.push({ ...where, reason: "usa el literal del save como clave de storage" });
      });
    }
  }

  return violations;
}

function main() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const violations = scanWritePath(root);
  if (!violations.length) {
    console.log("check:write-path OK — solo src/storage.js toca la clave del save.");
    return;
  }
  console.error("check:write-path FALLÓ:");
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line} — ${v.reason}`);
    console.error(`    ${v.text}`);
  }
  process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main();
}
