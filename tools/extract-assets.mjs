#!/usr/bin/env node
/**
 * extract-assets.mjs — extrae los catálogos que viven en los módulos de ODEA 1.
 *
 * `data/xp-catalog.json` cubre lo que estaba en odea.html/flujos_odea.js. Los
 * distritos que faltaban (Academia, Tesoro, Garaje, Jefe, Hub, Anomalías) tienen
 * su catálogo en `assets/odea-*.js`, que es otro archivo.
 *
 * Este script NO inventa contenido: si una declaración no está en la fuente,
 * falla con error. Si un id aparece duplicado, falla. La regla del proyecto es
 * que todo catálogo sale de estas fuentes o no existe.
 *
 * Uso:
 *   node tools/extract-assets.mjs <raíz-odea1> [salida.json]
 *
 * <raíz-odea1> debe contener odea.html y assets/odea-*.js del commit ebb0fce.
 *
 * Nota D5: odea-quiz.js y odea-quiz-bank.js NO se leen. El quiz es legado
 * archivado y se exhibe, nunca se extrae como contenido jugable.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import vm from "node:vm";

const [, , root, outPath = "data/xp-catalog-live.json"] = process.argv;
if (!root) {
  console.error("Uso: node tools/extract-assets.mjs <raíz-odea1> [salida.json]");
  process.exit(2);
}

function read(rel) {
  const abs = path.join(root, rel);
  if (!fs.existsSync(abs)) throw new Error(`Falta el archivo fuente: ${rel}`);
  return { text: fs.readFileSync(abs, "utf8"), sha256: sha256(fs.readFileSync(abs)) };
}

function sha256(buf) {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

/**
 * Devuelve el texto de la expresión de `const|let|var NAME = <expr>;`,
 * respetando strings, comentarios y anidamiento.
 */
function declarationExpr(src, name, origin) {
  const re = new RegExp(`\\b(?:const|let|var)\\s+${name}\\s*=`);
  const m = re.exec(src);
  if (!m) throw new Error(`No se encontró la declaración de ${name} en ${origin}`);

  let i = m.index + m[0].length;
  const start = i;
  let depth = 0;
  let quote = null;

  for (; i < src.length; i++) {
    const c = src[i];
    if (quote) {
      if (c === "\\") { i++; continue; }
      if (c === quote) quote = null;
      continue;
    }
    if (c === "/" && src[i + 1] === "/") {
      const nl = src.indexOf("\n", i);
      i = nl < 0 ? src.length : nl;
      continue;
    }
    if (c === "/" && src[i + 1] === "*") {
      const end = src.indexOf("*/", i + 2);
      i = end < 0 ? src.length : end + 1;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") { quote = c; continue; }
    if (c === "[" || c === "{" || c === "(") { depth++; continue; }
    if (c === "]" || c === "}" || c === ")") {
      if (depth === 0) break;
      depth--;
      if (depth === 0) { i++; break; }
    }
    /* Escalar simple (`var TOTAL = 29;`): termina en el punto y coma. */
    if (c === ";" && depth === 0) break;
  }
  return src.slice(start, i).trim();
}

function evalDecl(src, name, origin) {
  const expr = declarationExpr(src, name, origin);
  return vm.runInNewContext(`(${expr})`, Object.create(null), { timeout: 5000 });
}

function uniqueIds(list, where) {
  const seen = new Set();
  for (const item of list) {
    if (!item || !item.id) throw new Error(`${where}: entrada sin id`);
    if (seen.has(item.id)) throw new Error(`${where}: id duplicado "${item.id}"`);
    seen.add(item.id);
  }
  return list;
}

/* ============================== Academia ==================================
 * `RUTAS` es un array de rutas; cada ruta tiene `misiones`. Las misiones con
 * `meta: true` son pasos narrativos y NO cuentan para el total (ODEA 1 las
 * excluye de REAL_MISIONES). El total declarado es TOTAL = 29.
 */
function extractAcademia(file) {
  const { text, sha256: hash } = read("assets/odea-academia.js");
  const rutas = evalDecl(text, "RUTAS", file);
  if (!Array.isArray(rutas)) throw new Error("Academia: RUTAS no es un array");

  const declaredTotal = evalDecl(text, "TOTAL", file);

  const missions = [];
  for (const ruta of rutas) {
    for (const m of ruta.misiones || []) {
      if (m.meta) continue; // paso narrativo, no misión
      missions.push({
        id: m.id,
        nombre: m.nombre || null,
        detalle: m.detalle || null,
        ruta: ruta.id,
        paso: missions.length + 1
      });
    }
  }
  uniqueIds(missions, "Academia");

  /* La fuente declara TOTAL = 29, pero ese número es el DENOMINADOR del
     porcentaje, no la cantidad de misiones. ODEA 1 calcula:
     n = min(28, count); si n >= 28 → n = 29. O sea: 28 misiones reales y un
     estado final que vale por dos. La invariante correcta es TOTAL - 1. */
  if (missions.length !== declaredTotal - 1) {
    throw new Error(
      `Academia: TOTAL=${declaredTotal} implica ${declaredTotal - 1} misiones reales, ` +
        `pero se extrajeron ${missions.length}`
    );
  }

  return {
    source: "assets/odea-academia.js",
    sha256: hash,
    /** Denominador del porcentaje en ODEA 1 (28 misiones + estado final). */
    percentageTotal: declaredTotal,
    count: missions.length,
    routes: rutas.map((r) => ({ id: r.id, nombre: r.nombre, misiones: (r.misiones || []).length })),
    missions
  };
}

/* =============================== Tesoro ===================================
 * `SHOP_ITEMS` vive en odea.html: id, nombre, precio y efecto (power/slot).
 * Los objetos `grantOnly` NO se compran: se otorgan por completar el evento.
 */
function extractTesoro(file) {
  const { text, sha256: hash } = read("odea.html");
  const items = evalDecl(text, "SHOP_ITEMS", file);
  if (!Array.isArray(items)) throw new Error("Tesoro: SHOP_ITEMS no es un array");
  uniqueIds(items, "Tesoro");

  const normalized = items.map((it) => ({
    id: it.id,
    nombre: it.n || null,
    tier: it.tier || null,
    price: Number(it.price) || 0,
    slot: it.slot || null,
    power: Number(it.power) || 0,
    grantOnly: Boolean(it.grantOnly)
  }));

  const purchasable = normalized.filter((it) => !it.grantOnly);
  const granted = normalized.filter((it) => it.grantOnly);

  return {
    source: "odea.html · const SHOP_ITEMS",
    sha256: hash,
    count: normalized.length,
    purchasable: purchasable.length,
    grantedOnly: granted.length,
    items: normalized
  };
}

/* =============================== Garaje ===================================
 * `VEHICULOS` (2) + `MISIONES_BASE` (mantenimiento por vehículo, con `dias`).
 */
function extractGaraje() {
  const { text, sha256: hash } = read("assets/odea-garaje.js");
  const vehiculos = evalDecl(text, "VEHICULOS", "odea-garaje.js");
  const misiones = evalDecl(text, "MISIONES_BASE", "odea-garaje.js");
  uniqueIds(vehiculos, "Garaje/vehículos");
  uniqueIds(misiones, "Garaje/misiones");

  const known = new Set(vehiculos.map((v) => v.id));
  for (const m of misiones) {
    if (!known.has(m.vehiculo)) throw new Error(`Garaje: "${m.id}" apunta a un vehículo inexistente`);
  }

  return {
    source: "assets/odea-garaje.js",
    sha256: hash,
    vehicles: vehiculos.map((v) => ({ id: v.id, nombre: v.nombre, detalle: v.detalle })),
    count: misiones.length,
    missions: misiones.map((m) => ({
      id: m.id,
      nombre: m.nombre,
      vehiculo: m.vehiculo,
      dias: Number(m.dias) || 0
    }))
  };
}

/* ================================ Jefe ====================================
 * `BOSSES`: jefes del ciclo semanal.
 */
function extractJefe() {
  const { text, sha256: hash } = read("assets/odea-jefe.js");
  const bosses = evalDecl(text, "BOSSES", "odea-jefe.js");
  if (!Array.isArray(bosses) || !bosses.length) throw new Error("Jefe: BOSSES vacío");
  return {
    source: "assets/odea-jefe.js",
    sha256: hash,
    count: bosses.length,
    /* La fuente NO asigna id a los jefes: se identifican por posición y nombre.
       No se fabrica uno. */
    idNote: "sin id en la fuente; identificados por índice y nombre",
    bosses: bosses.map((b, index) => ({ index, nombre: b.nombre || null, titulo: b.titulo || null }))
  };
}

/* ============================== Anomalías =================================
 * `TRIVIA` (cartas del día), `MILESTONES` (hitos) y `TYPE_META` (tipos).
 * OJO: esto NO es el quiz legado de D5 —ese vive en odea-quiz.js, que no se
 * lee— sino el sistema propio del Rincón Anomalía.
 */
function extractAnomalias() {
  const { text, sha256: hash } = read("assets/odea-anomalias.js");
  const trivia = evalDecl(text, "TRIVIA", "odea-anomalias.js");
  const milestones = evalDecl(text, "MILESTONES", "odea-anomalias.js");
  if (!Array.isArray(trivia) || !trivia.length) throw new Error("Anomalías: TRIVIA vacío");

  return {
    source: "assets/odea-anomalias.js",
    sha256: hash,
    count: trivia.length,
    /* Igual que los jefes: la fuente no asigna id, se identifican por índice. */
    idNote: "sin id en la fuente; identificadas por índice",
    trivia: trivia.map((t, index) => ({
      index,
      q: t.q,
      opciones: Array.isArray(t.o) ? t.o : [],
      correcta: Number(t.c),
      explicacion: t.e || null
    })),
    milestones: Array.isArray(milestones) ? milestones.map((m) => ({ ...m })) : milestones
  };
}

/* ========================= Tesoro (módulo propio) =========================
 * `SHOP` es una tienda DISTINTA de `SHOP_ITEMS`: cosméticos del panel, no
 * equipamiento de combate. Las dos existen y conviene no confundirlas.
 */
function extractTesoroModule() {
  const { text, sha256: hash } = read("assets/odea-tesoro.js");
  const shop = evalDecl(text, "SHOP", "odea-tesoro.js");
  const precioEscudo = evalDecl(text, "PRECIO_ESCUDO", "odea-tesoro.js");
  const maxEscudos = evalDecl(text, "MAX_ESCUDOS", "odea-tesoro.js");
  const xpPorMoneda = evalDecl(text, "XP_POR_MONEDA", "odea-tesoro.js");
  uniqueIds(shop, "Tesoro/cosméticos");

  return {
    source: "assets/odea-tesoro.js",
    sha256: hash,
    count: shop.length,
    cosmetics: shop.map((s) => ({ id: s.id, nombre: s.nombre, precio: Number(s.precio) || 0, desc: s.desc })),
    rules: { precioEscudo, maxEscudos, xpPorMoneda }
  };
}

/* ================================ Salida ================================== */

const out = {
  meta: {
    source: "ODEA 1 (plan-analista-datos @ ebb0fce, v6.00)",
    generatedAt: new Date().toISOString(),
    note:
      "Catálogos extraídos de los módulos de assets/ y de odea.html. No son progreso. " +
      "El quiz (odea-quiz.js / odea-quiz-bank.js) queda excluido por D5 y no se lee."
  },
  academia: extractAcademia("assets/odea-academia.js"),
  tesoro: extractTesoro("odea.html"),
  tesoroModulo: extractTesoroModule(),
  garaje: extractGaraje(),
  jefe: extractJefe(),
  anomalias: extractAnomalias()
};

fs.mkdirSync(path.dirname(path.resolve(outPath)), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(out, null, 2) + "\n", "utf8");

console.log(`Catálogos escritos en ${outPath}`);
console.log(`  academia  = ${out.academia.count} misiones reales (denominador ${out.academia.percentageTotal})`);
console.log(`  tesoro    = ${out.tesoro.count} objetos (${out.tesoro.purchasable} comprables + ${out.tesoro.grantedOnly} otorgados)`);
console.log(`  tesoro mod= ${out.tesoroModulo.count} cosméticos`);
console.log(`  garaje    = ${out.garaje.vehicles.length} vehículos, ${out.garaje.count} misiones`);
console.log(`  jefe      = ${out.jefe.count} jefes`);
console.log(`  anomalías = ${out.anomalias.count} cartas`);
