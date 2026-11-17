/**
 * check-write-path.mjs — cumplimiento de la ruta ÚNICA de escritura (Fase 3 §3.5).
 *
 * Contrato: NINGÚN módulo fuera de `src/storage.js` puede escribir (ni nombrar
 * como clave) el save `odea2_bundle_v1`. Hasta v0.24.0 esto se comprobaba con un
 * grep de UNA línea que se evadía con una constante, una concatenación o un
 * archivo `.mjs`. La v0.27.1 lo reemplaza por un análisis de tres pasadas:
 *
 *   1. `stripComments()` quita comentarios RESPETANDO cadenas y plantillas
 *      (si no, una URL o un `//` dentro de un texto rompería el análisis).
 *   2. Se busca el nombre de la clave por SUS COMPONENTES (`odea2_bundle`,
 *      `bundle_v1`), así `"odea2_" + "bundle_v1"` o una plantilla también
 *      cuentan. Solo dos archivos pueden nombrarla, y únicamente en su
 *      declaración: `src/shape.js` (identificador del FORMATO) y
 *      `js/storage-watch.js` (escucha el evento `storage`; no escribe).
 *   3. Se prohíben también las vías indirectas: `STORAGE_KEYS` y las llamadas a
 *      `saveOdea2()`/`backupBundle()` fuera del escritor, y `localStorage`
 *      directo fuera de `js/browser-storage.js`.
 *
 * Alcance: todos los `.js`/`.mjs` del repo (raíz, `js/` y `src/`), salteando
 * `tools/`, `tests/` y dependencias. Un archivo nuevo suelto en la raíz es
 * exactamente el caso que el grep viejo no veía.
 *
 * Se ejecuta con `npm run check:write-path`, desde `tests/fase3-write-path.test.js`
 * y como paso obligatorio de CI.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const SAVE_KEY = "odea2_bundle_v1";
/** La clave, partida: detecta también concatenaciones y plantillas. */
export const SAVE_KEY_PARTS = ["odea2_bundle", "bundle_v1"];
export const WRITER = "src/storage.js";
export const SCAN_EXTS = [".js", ".mjs"];
export const SKIP_DIRS = new Set(["tools", "tests", "node_modules"]);

/** Archivos que pueden nombrar la clave en UNA declaración concreta. */
const NAMED_ALLOWED = {
  "src/shape.js": /^\s*export\s+const\s+ODEA2_BUNDLE_FORMAT\s*=\s*["']/,
  "js/storage-watch.js": /^\s*export\s+const\s+SAVE_KEY\s*=\s*["']/
};

/** Único archivo que puede tocar `localStorage` (lo envuelve y lo prueba). */
const LOCAL_STORAGE_ALLOWED = new Set(["js/browser-storage.js"]);

const DANGEROUS_CALL = /\b(saveOdea2|backupBundle)\s*\(/;
const STORAGE_KEYS = /\bSTORAGE_KEYS\b/;
const LOCAL_STORAGE = /\blocalStorage\b/;

/**
 * Devuelve el código con los comentarios reemplazados por espacios (misma
 * cantidad de líneas, para conservar los números de línea).
 */
export function stripComments(source) {
  const text = String(source || "");
  let out = "";
  let quote = null;
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    const next = text[i + 1];
    if (quote) {
      out += c;
      if (c === "\\") {
        out += next ?? "";
        i += 2;
        continue;
      }
      if (c === quote) quote = null;
      i += 1;
      continue;
    }
    if (c === "/" && next === "/") {
      while (i < text.length && text[i] !== "\n") {
        out += " ";
        i += 1;
      }
      continue;
    }
    if (c === "/" && next === "*") {
      out += "  ";
      i += 2;
      while (i < text.length && !(text[i] === "*" && text[i + 1] === "/")) {
        out += text[i] === "\n" ? "\n" : " ";
        i += 1;
      }
      if (i < text.length) {
        out += "  ";
        i += 2;
      }
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      quote = c;
      out += c;
      i += 1;
      continue;
    }
    out += c;
    i += 1;
  }
  return out;
}

function walk(dir, root, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      walk(full, root, out);
      continue;
    }
    if (!entry.isFile()) continue;
    if (!SCAN_EXTS.includes(path.extname(entry.name))) continue;
    const rel = path.relative(root, full).split(path.sep).join("/");
    out.push({ full, rel });
  }
  return out;
}

/** Analiza un archivo y devuelve `[{ file, line, text, reason }]`. */
export function scanSource(rel, source) {
  const original = String(source || "").split(/\r?\n/);
  const code = stripComments(source).split(/\r?\n/);
  const violations = [];
  const allowedLine = NAMED_ALLOWED[rel];

  code.forEach((line, index) => {
    if (!line.trim()) return;
    const where = { file: rel, line: index + 1, text: (original[index] || "").trim() };
    const push = (reason) => violations.push({ ...where, reason });

    if (rel === WRITER) return;

    /* Nombra la clave del save (literal, plantilla o concatenación). */
    if (SAVE_KEY_PARTS.some((part) => line.includes(part))) {
      const isAllowedDeclaration = allowedLine ? allowedLine.test(line) : false;
      if (!isAllowedDeclaration) {
        push("nombra la clave del save fuera de src/storage.js (solo se admite como formato en src/shape.js y como SAVE_KEY en js/storage-watch.js)");
        return;
      }
    }

    if (STORAGE_KEYS.test(line)) {
      push("usa STORAGE_KEYS fuera de src/storage.js (las claves se piden al escritor)");
      return;
    }

    if (DANGEROUS_CALL.test(line)) {
      push("llama a la escritura del save fuera de src/storage.js");
      return;
    }

    if (LOCAL_STORAGE.test(line) && !LOCAL_STORAGE_ALLOWED.has(rel)) {
      push("usa localStorage directamente (debe pasar por js/browser-storage.js)");
    }
  });

  return violations;
}

/** Recorre el repo y devuelve todas las violaciones. */
export function scanWritePath(root) {
  const violations = [];
  for (const { full, rel } of walk(root, root)) {
    violations.push(...scanSource(rel, fs.readFileSync(full, "utf8")));
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
