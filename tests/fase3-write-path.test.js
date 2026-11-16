/**
 * fase3-write-path.test.js — §3.5: nadie fuera de src/storage.js escribe el save.
 *
 * Usa el mismo grep determinista que `npm run check:write-path`.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { scanWritePath } from "../tools/check-write-path.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");

test("write-path: js/ y src/ no tocan la clave del save fuera de src/storage.js", () => {
  assert.deepEqual(scanWritePath(root), []);
});

test("write-path: detecta un módulo que escribe la clave del save", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "odea-writepath-"));
  try {
    fs.mkdirSync(path.join(tmp, "js"));
    fs.mkdirSync(path.join(tmp, "src"));
    fs.writeFileSync(path.join(tmp, "src", "storage.js"), "// writer autorizado\n");
    fs.writeFileSync(
      path.join(tmp, "js", "malo.js"),
      'localStorage.setItem("odea2_bundle_v1", "x");\n'
    );

    const violations = scanWritePath(tmp);
    assert.equal(violations.length, 1);
    assert.equal(violations[0].file, "js/malo.js");
    assert.match(violations[0].reason, /clave de storage/);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
