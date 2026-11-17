/**
 * fase3-write-path.test.js — §3.5: nadie fuera de src/storage.js escribe el save.
 *
 * La v0.24.0 probaba el grep con UN caso (el que su propio regex ya manejaba).
 * Desde v0.27.1 se prueba el contrato de verdad: las diez formas de evadir el
 * gate viejo (constante, concatenación, plantilla, `.mjs` suelto en la raíz,
 * destructuring de STORAGE_KEYS, `localStorage` directo, llamada al escritor)
 * tienen que fallar, y las declaraciones legítimas tienen que pasar.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { scanSource, scanWritePath, stripComments } from "../tools/check-write-path.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");

/** Crea un repo mínimo en un directorio temporal y lo analiza. */
function scanTree(files) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "odea-writepath-"));
  try {
    fs.mkdirSync(path.join(tmp, "src"), { recursive: true });
    fs.writeFileSync(path.join(tmp, "src", "storage.js"), "// escritor autorizado\n", "utf8");
    for (const [rel, content] of Object.entries(files)) {
      const full = path.join(tmp, rel);
      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, content, "utf8");
    }
    return scanWritePath(tmp);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

/* ------------------------------ el repo real ------------------------------ */

test("write-path: el repo real no tiene ninguna violación", () => {
  assert.deepEqual(scanWritePath(root), []);
});

/* --------------------- las diez evasiones del gate viejo -------------------- */

test("write-path: detecta el literal en localStorage (caso original)", () => {
  const v = scanTree({ "js/malo.js": 'localStorage.setItem("odea2_bundle_v1", "x");\n' });
  assert.equal(v.length, 1);
  assert.equal(v[0].file, "js/malo.js");
  assert.match(v[0].reason, /clave del save/);
});

test("write-path: detecta la clave escondida en una constante", () => {
  const v = scanTree({
    "js/malo.js": 'const K = "odea2_bundle_v1";\nstorage.setItem(K, "x");\n'
  });
  assert.equal(v.length, 1, "la constante debe delatarse aunque la escritura no la nombre");
  assert.equal(v[0].line, 1);
});

test("write-path: detecta la clave concatenada", () => {
  const v = scanTree({ "js/malo.js": 'const K = "odea2_" + "bundle_v1";\n' });
  assert.equal(v.length, 1);
});

test("write-path: detecta la clave en una plantilla", () => {
  const v = scanTree({ "js/malo.js": "const K = `bundle_v1`;\n" });
  assert.equal(v.length, 1);
});

test("write-path: detecta STORAGE_KEYS indexado", () => {
  const v = scanTree({ "js/malo.js": 'storage.setItem(STORAGE_KEYS["bundle"], "x");\n' });
  assert.equal(v.length, 1);
  assert.match(v[0].reason, /STORAGE_KEYS/);
});

test("write-path: detecta el destructuring de STORAGE_KEYS", () => {
  const v = scanTree({ "js/malo.js": "const { bundle } = STORAGE_KEYS;\n" });
  assert.equal(v.length, 1);
  assert.match(v[0].reason, /STORAGE_KEYS/);
});

test("write-path: detecta un .js suelto en la raíz (fuera de js/ y src/)", () => {
  const v = scanTree({ "app.js": 'const K = "odea2_bundle_v1";\n' });
  assert.equal(v.length, 1);
  assert.equal(v[0].file, "app.js");
});

test("write-path: detecta un .mjs suelto en la raíz", () => {
  const v = scanTree({ "worker.mjs": 'const K = "bundle_v1";\n' });
  assert.equal(v.length, 1);
  assert.equal(v[0].file, "worker.mjs");
});

test("write-path: detecta una llamada al escritor fuera de storage.js", () => {
  const v = scanTree({
    "js/atajo.js": 'import { saveOdea2 } from "../src/storage.js";\nsaveOdea2(storage, bundle);\n'
  });
  assert.equal(v.length, 1);
  assert.match(v[0].reason, /escritura del save/);
});

test("write-path: detecta localStorage directo fuera del adaptador", () => {
  const v = scanTree({ "js/roto.js": 'globalThis.localStorage.getItem("x");\n' });
  assert.equal(v.length, 1);
  assert.match(v[0].reason, /localStorage/);
});

test("write-path: detecta la clave en un comentario NO (los comentarios no escriben)", () => {
  const v = scanTree({ "js/limpio.js": '// localStorage.setItem("odea2_bundle_v1", "x")\nconst a = 1;\n' });
  assert.deepEqual(v, []);
});

/* ------------------------- lo que sí debe estar permitido ------------------ */

test("write-path: la declaración del formato y la escucha del save son legítimas", () => {
  const v = scanTree({
    "src/shape.js": 'export const ODEA2_BUNDLE_FORMAT = "odea2_bundle_v1";\n',
    "js/storage-watch.js": 'export const SAVE_KEY = "odea2_bundle_v1";\n',
    "js/importer.js":
      'import { ODEA2_BUNDLE_FORMAT } from "../src/shape.js";\n' +
      "export const FORMATS = { ODEA2: ODEA2_BUNDLE_FORMAT };\n"
  });
  assert.deepEqual(v, []);
});

test("write-path: el adaptador del navegador puede envolver localStorage", () => {
  const v = scanTree({
    "js/browser-storage.js": "window.localStorage.setItem(probe, \"1\");\nreturn window.localStorage;\n"
  });
  assert.deepEqual(v, []);
});

/* ------------------------------ el analizador ------------------------------ */

test("write-path: stripComments respeta cadenas con // y conserva las líneas", () => {
  const src = 'const url = "https://x/y"; // comentario\nconst b = 2;\n/* bloque\nx */\n';
  const out = stripComments(src);
  assert.equal(out.split("\n").length, src.split("\n").length, "conserva los números de línea");
  assert.match(out, /"https:\/\/x\/y"/, "no toca las cadenas");
  assert.ok(!out.includes("comentario"));
  assert.ok(!out.includes("bloque"));
});

test("write-path: scanSource informa la línea y el texto original", () => {
  const v = scanSource("js/x.js", 'const a = 1;\nconst K = "odea2_bundle_v1";\n');
  assert.equal(v.length, 1);
  assert.equal(v[0].line, 2);
  assert.match(v[0].text, /odea2_bundle_v1/);
});
