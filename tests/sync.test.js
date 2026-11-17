/**
 * sync.test.js — sincronización con Google Drive (v0.20.0).
 *
 * Prueba la lógica pura (decideSync, hashText) y el motor completo con un
 * transporte falso en memoria: sin red, sin Google, sin tocar el save real.
 * El applySave falso simula restoreBundle: valida (rechaza "CORRUPT") y
 * deja una marca en el raw, como el restoredAt real.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { createMemoryStorage } from "../src/storage.js";
import { hashText, decideSync, createSyncEngine, SyncError } from "../js/sync.js";
import { SYNC_FILE_NAME, SYNC_CONFLICT_FILE_NAME, SYNC_META_KEY } from "../js/sync-config.js";

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function fakeTransport() {
  const files = new Map();
  let clock = 0;
  let ids = 0;
  const stamp = () => `2026-11-17T00:00:${String(++clock).padStart(2, "0")}.000Z`;
  return {
    files,
    async requestToken() {
      return "token-falso";
    },
    async ensureSession() {},
    async getUserEmail() {
      return "test@example.com";
    },
    async findFile(name) {
      const f = files.get(name);
      return f ? { id: f.id, modifiedTime: f.modifiedTime } : null;
    },
    async download(id) {
      for (const f of files.values()) if (f.id === id) return f.text;
      throw new Error("archivo no encontrado");
    },
    async upload(name, text, existingId) {
      const modifiedTime = stamp();
      const id = existingId || `id-${++ids}`;
      files.set(name, { id, text, modifiedTime });
      return { id, modifiedTime };
    },
    async revoke() {}
  };
}

function makeEngine({ localRaw = null, transport = fakeTransport(), engineOpts = {}, storage = createMemoryStorage() } = {}) {
  const holder = { raw: localRaw };
  const engine = createSyncEngine({
    storage,
    transport,
    readRawSave: () => holder.raw,
    applySave: (text) => {
      if (String(text).includes("CORRUPT")) throw new Error("copia inválida");
      holder.raw = `${text}|restaurado`;
    },
    debounceMs: 10,
    ...engineOpts
  });
  return { engine, holder, transport, storage };
}

test("sync: hashText es estable y detecta cambios", () => {
  assert.equal(hashText("abc"), hashText("abc"));
  assert.notEqual(hashText("abc"), hashText("abd"));
  assert.equal(hashText(""), hashText(null));
});

test("sync: decideSync cubre la matriz de casos", () => {
  const base = { hasLocal: true, hasCloud: true, localChanged: false, cloudChanged: false, bootstrapped: true };
  assert.equal(decideSync({ ...base, hasLocal: false, hasCloud: false }), "none");
  assert.equal(decideSync({ ...base, hasLocal: false }), "pull");
  assert.equal(decideSync({ ...base, hasCloud: false }), "push");
  assert.equal(decideSync({ ...base, bootstrapped: false }), "choice");
  assert.equal(decideSync({ ...base, localChanged: true, cloudChanged: true }), "conflict");
  assert.equal(decideSync({ ...base, localChanged: true }), "push");
  assert.equal(decideSync({ ...base, cloudChanged: true }), "pull");
  assert.equal(decideSync(base), "none");
});

test("sync: conectar con solo partida local la sube a Drive", async () => {
  const { engine, transport } = makeEngine({ localRaw: "SAVE-LOCAL" });
  await engine.connect();
  assert.equal(engine.getState().status, "ready");
  assert.equal(engine.getState().email, "test@example.com");
  assert.equal(transport.files.get(SYNC_FILE_NAME).text, "SAVE-LOCAL");
});

test("sync: conectar con solo copia en Drive la baja", async () => {
  const transport = fakeTransport();
  await transport.upload(SYNC_FILE_NAME, "SAVE-NUBE", "");
  const { engine, holder } = makeEngine({ localRaw: null, transport });
  await engine.connect();
  assert.equal(engine.getState().status, "ready");
  assert.ok(holder.raw.startsWith("SAVE-NUBE"));
});

test("sync: primer enlace con partidas distintas pide elección y useLocal preserva la de Drive", async () => {
  const transport = fakeTransport();
  await transport.upload(SYNC_FILE_NAME, "SAVE-NUBE", "");
  const { engine } = makeEngine({ localRaw: "SAVE-LOCAL", transport });
  await engine.connect();
  assert.equal(engine.getState().status, "choice");
  await engine.useLocal();
  assert.equal(engine.getState().status, "ready");
  assert.equal(transport.files.get(SYNC_FILE_NAME).text, "SAVE-LOCAL");
  assert.equal(transport.files.get(SYNC_CONFLICT_FILE_NAME).text, "SAVE-NUBE");
});

test("sync: elección useCloud aplica la copia de Drive", async () => {
  const transport = fakeTransport();
  await transport.upload(SYNC_FILE_NAME, "SAVE-NUBE", "");
  const { engine, holder } = makeEngine({ localRaw: "SAVE-LOCAL", transport });
  await engine.connect();
  assert.equal(engine.getState().status, "choice");
  await engine.useCloud();
  assert.equal(engine.getState().status, "ready");
  assert.ok(holder.raw.startsWith("SAVE-NUBE"));
});

test("sync: un cambio local se sube solo tras notifyChanged", async () => {
  const { engine, holder, transport } = makeEngine({ localRaw: "SAVE-1" });
  await engine.connect();
  holder.raw = "SAVE-2";
  engine.notifyChanged();
  await wait(80);
  assert.equal(transport.files.get(SYNC_FILE_NAME).text, "SAVE-2");
});

test("sync: un cambio externo en Drive se baja con syncNow", async () => {
  const { engine, holder, transport } = makeEngine({ localRaw: "SAVE-1" });
  await engine.connect();
  const meta = transport.files.get(SYNC_FILE_NAME);
  await transport.upload(SYNC_FILE_NAME, "SAVE-REMOTO", meta.id);
  await engine.syncNow();
  assert.ok(holder.raw.startsWith("SAVE-REMOTO"));
});

test("sync: conflicto (ambos cambiaron) — gana Drive y la local queda como copia de conflicto", async () => {
  const { engine, holder, transport } = makeEngine({ localRaw: "SAVE-1" });
  await engine.connect();
  holder.raw = "SAVE-LOCAL-NUEVO";
  const meta = transport.files.get(SYNC_FILE_NAME);
  await transport.upload(SYNC_FILE_NAME, "SAVE-REMOTO-NUEVO", meta.id);
  await engine.syncNow();
  assert.ok(holder.raw.startsWith("SAVE-REMOTO-NUEVO"));
  assert.equal(transport.files.get(SYNC_CONFLICT_FILE_NAME).text, "SAVE-LOCAL-NUEVO");
});

test("sync: una copia corrupta en Drive no toca la partida ni la metadata", async () => {
  const { engine, holder, transport, storage } = makeEngine({ localRaw: "SAVE-1" });
  await engine.connect();
  const metaAntes = storage.getItem(SYNC_META_KEY);
  const meta = transport.files.get(SYNC_FILE_NAME);
  await transport.upload(SYNC_FILE_NAME, "CORRUPT", meta.id);
  await engine.syncNow();
  assert.equal(engine.getState().status, "error");
  assert.equal(holder.raw, "SAVE-1");
  assert.equal(storage.getItem(SYNC_META_KEY), metaAntes);
});

test("sync: sesión vencida cae en needsReconnect sin romper nada", async () => {
  const transport = fakeTransport();
  const { engine } = makeEngine({ localRaw: "SAVE-1", transport });
  await engine.connect();
  transport.ensureSession = async () => {
    throw new SyncError("needs-interaction", "Google pidió interacción.");
  };
  await engine.syncNow();
  assert.equal(engine.getState().status, "needsReconnect");
  assert.equal(engine.getState().enabled, true);
});

test("sync: conectar sin nada en ningún lado deja el auto-envío listo para el primer save", async () => {
  const { engine, holder, transport } = makeEngine({ localRaw: null });
  await engine.connect();
  assert.equal(engine.getState().status, "ready");
  holder.raw = "SAVE-NUEVO";
  engine.notifyChanged();
  await wait(80);
  assert.equal(transport.files.get(SYNC_FILE_NAME).text, "SAVE-NUEVO");
});

test("sync: si la ventana de Google nunca vuelve, conectar vence con guía en vez de colgarse", async () => {
  const transport = fakeTransport();
  transport.requestToken = () => new Promise(() => {}); // la ventana jamás responde
  const { engine } = makeEngine({ localRaw: "SAVE-1", transport, engineOpts: { connectTimeoutMs: 40 } });
  await engine.connect();
  assert.equal(engine.getState().status, "error");
  assert.match(engine.getState().message, /Chrome/);
  assert.equal(engine.getState().enabled, false);
});

test("sync: una sesión silenciosa colgada vence en needsReconnect, no en syncing eterno", async () => {
  const transport = fakeTransport();
  const { engine } = makeEngine({ localRaw: "SAVE-1", transport, engineOpts: { sessionTimeoutMs: 40 } });
  await engine.connect();
  assert.equal(engine.getState().status, "ready");
  transport.ensureSession = () => new Promise(() => {});
  await engine.syncNow();
  assert.equal(engine.getState().status, "needsReconnect");
  assert.match(engine.getState().message, /Chrome/);
});

test("sync: al abrir hay UN solo intento silencioso; si falla, queda tranquilo y un syncNow posterior entra sin pedir nada", async () => {
  const shared = createMemoryStorage();
  const a = makeEngine({ localRaw: "SAVE-1", storage: shared });
  await a.engine.connect();
  assert.equal(a.engine.getState().status, "ready");
  /* Segundo aparato (o reapertura): la renovación silenciosa de arranque
     falla como si la sesión de Google aún no cargara. Desde v0.25.2 el
     arranque NO reintenta solo (José: «me lo hace dos veces»): un único
     intento y estado needsReconnect en silencio. La renovación llega
     después por la vía normal (volver a la app / syncNow) y entra sola. */
  const transport = fakeTransport();
  let intentos = 0;
  const ensureOk = transport.ensureSession;
  transport.ensureSession = async () => {
    intentos++;
    if (intentos === 1) {
      const error = new Error("sin sesión");
      error.code = "needs-interaction";
      throw error;
    }
    return ensureOk();
  };
  const b = makeEngine({ localRaw: "SAVE-1", transport, storage: shared });
  await b.engine.init();
  assert.equal(intentos, 1);
  assert.equal(b.engine.getState().status, "needsReconnect");
  await b.engine.syncNow();
  assert.equal(intentos, 2);
  assert.equal(b.engine.getState().status, "ready");
});

test("sync: desconectar limpia la metadata y no toca la partida", async () => {
  const { engine, holder, storage } = makeEngine({ localRaw: "SAVE-1" });
  await engine.connect();
  await engine.disconnect();
  assert.equal(engine.getState().status, "off");
  assert.equal(engine.getState().enabled, false);
  assert.equal(holder.raw, "SAVE-1");
  const meta = JSON.parse(storage.getItem(SYNC_META_KEY));
  assert.equal(meta.bootstrapped, false);
});
