#!/usr/bin/env node
/**
 * check-tests.mjs — guarda contra el "verde con 0 tests".
 *
 * `node --test` sale con código 0 cuando no encuentra archivos: si alguien
 * renombra `tests/` o rompe el patrón, CI pasaba sin ejecutar nada. Esta guarda
 * corre ANTES de la suite y falla si:
 *   - hay menos archivos de test que el mínimo esperado, o
 *   - algún archivo `*.test.js` no declara ni un solo `test(`.
 *
 * No ejecuta los tests (eso lo hace `node --test`), así que es barata y
 * multiplataforma (sin globs del shell).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const MIN_TEST_FILES = 20;

export function scanTests(root) {
  const dir = path.join(root, "tests");
  if (!fs.existsSync(dir)) return { files: [], empty: [], missingDir: true };
  const files = fs
    .readdirSync(dir)
    .filter((name) => name.endsWith(".test.js"))
    .sort();
  const empty = [];
  for (const name of files) {
    const source = fs.readFileSync(path.join(dir, name), "utf8");
    if (!/(^|\n)\s*test\s*\(/.test(source)) empty.push(name);
  }
  return { files, empty, missingDir: false };
}

export function checkTests(root, { min = MIN_TEST_FILES } = {}) {
  const { files, empty, missingDir } = scanTests(root);
  const problems = [];
  if (missingDir) problems.push("no existe la carpeta tests/");
  if (files.length < min) problems.push(`hay ${files.length} archivos de test (mínimo ${min})`);
  for (const name of empty) problems.push(`${name} no declara ningún test()`);
  return { ok: problems.length === 0, count: files.length, empty, problems };
}

function main() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const result = checkTests(root);
  if (result.ok) {
    console.log(`check:tests OK — ${result.count} archivos de test con contenido.`);
    return;
  }
  console.error("check:tests FALLÓ:");
  for (const problem of result.problems) console.error(`  ${problem}`);
  process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
