/**
 * sync.js — sincronización opcional del save con Google Drive (v0.20.0).
 *
 * Diseño (deliberadamente conservador):
 * - El save LOCAL sigue siendo la base: sin sesión, sin internet o sin
 *   sincronización, el juego funciona exactamente igual que siempre.
 * - La copia de Drive vive en la carpeta appData (oculta, privada, solo
 *   accesible para esta app con el permiso drive.appdata).
 * - Este módulo NUNCA escribe la clave del save: bajar una copia pasa por
 *   la función `applySave` inyectada (en la app: restoreBundle de
 *   src/storage.js, que valida antes de escribir y respalda el save actual).
 * - La metadata de sincronización vive en su PROPIA clave
 *   (odea2_sync_v1): hashes y marcas, nunca datos del juego.
 * - Regla de conflicto: si los dos lados cambiaron desde la última
 *   sincronización, gana la copia de Drive (es la que tiene reloj del
 *   servidor) y la copia local se preserva como archivo de conflicto.
 */
import {
  DRIVE_SCOPE,
  SYNC_FILE_NAME,
  SYNC_CONFLICT_FILE_NAME,
  SYNC_META_KEY,
  GIS_SCRIPT_URL,
  DRIVE_API_BASE,
  DRIVE_UPLOAD_BASE
} from "./sync-config.js";

export class SyncError extends Error {
  constructor(code, message) {
    super(message || code);
    this.name = "SyncError";
    this.code = code;
  }
}

/**
 * La ventana de Google puede no volver nunca dentro de una app instalada
 * (el popup se abre en otra pestaña y la respuesta se pierde). Sin un límite
 * de espera, la conexión quedaría en «Conectando...» para siempre: toda
 * espera de sesión pasa por aquí y vence con un error accionable.
 */
export function withTimeout(promise, ms, code, message) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new SyncError(code, message)), ms))
  ]);
}

export const SYNC_TIMEOUT_MESSAGE =
  "El inicio de sesión de Google no volvió. Si estás en la app instalada, abrí el juego en Chrome (el mismo enlace), conectá desde ahí y queda conectado también aquí.";

/** Hash FNV-1a (32 bits) — solo detección de cambios, no criptografía. */
export function hashText(text) {
  let hash = 0x811c9dc5;
  const s = String(text || "");
  for (let i = 0; i < s.length; i++) {
    hash ^= s.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

/**
 * Decisión pura de sincronización.
 * Entrada: qué hay en cada lado y qué cambió desde la última sincronización.
 * Salida: "push" | "pull" | "none" | "choice" | "conflict".
 */
export function decideSync({ hasLocal, hasCloud, localChanged, cloudChanged, bootstrapped }) {
  if (!hasLocal && !hasCloud) return "none";
  if (!hasLocal && hasCloud) return "pull";
  if (hasLocal && !hasCloud) return "push";
  if (!bootstrapped) return "choice";
  if (localChanged && cloudChanged) return "conflict";
  if (localChanged) return "push";
  if (cloudChanged) return "pull";
  return "none";
}

/* ------------------------------------------------------------------ */
/* Transporte real: Google Identity Services + Drive API v3            */
/* ------------------------------------------------------------------ */

function loadGisScript(doc) {
  if (typeof window !== "undefined" && window.google && window.google.accounts) {
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    const script = doc.createElement("script");
    script.src = GIS_SCRIPT_URL;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new SyncError("gis-load", "No se pudo cargar el inicio de sesión de Google."));
    doc.head.appendChild(script);
  });
}

export function createDriveTransport({ clientId, fetchImpl, doc, tokenTimeoutMs = 12000 } = {}) {
  const doFetch = fetchImpl || ((...args) => fetch(...args));
  const theDoc = doc || (typeof document !== "undefined" ? document : null);
  let tokenClient = null;
  /* El error_callback de GIS se registra UNA vez al crear el cliente: si
     quedara amarrado al reject de esa primera llamada, los errores de las
     llamadas siguientes caerían en una promesa ya cerrada y el pedido en
     curso no se resolvería NUNCA (envenenando pendingToken y trabando
     toda la sincronización de la sesión). Por eso el callback de error
     pasa por este handler mutable, que cada pedido reemplaza. */
  let tokenErrorHandler = null;
  let accessToken = "";
  let tokenExpiresAt = 0;
  let pendingToken = null;

  function requestToken({ interactive = false } = {}) {
    if (accessToken && Date.now() < tokenExpiresAt - 60000) {
      return Promise.resolve(accessToken);
    }
    if (pendingToken) return pendingToken;
    pendingToken = (async () => {
      try {
        if (!theDoc) throw new SyncError("no-dom", "Falta el documento para iniciar sesión.");
        await loadGisScript(theDoc);
        return await new Promise((resolve, reject) => {
          let settled = false;
          const finish = (fn, value) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            tokenErrorHandler = null;
            fn(value);
          };
          /* Si Google no responde (el popup de la app instalada que nunca
             vuelve), el pedido vence solo y pendingToken se libera: la
             sincronización puede reintentar en vez de quedar trabada. */
          const timer = setTimeout(() => {
            finish(reject, new SyncError("timeout", SYNC_TIMEOUT_MESSAGE));
          }, tokenTimeoutMs);
          if (!tokenClient) {
            tokenClient = window.google.accounts.oauth2.initTokenClient({
              client_id: clientId,
              scope: DRIVE_SCOPE,
              callback: () => {},
              error_callback: (err) => {
                if (tokenErrorHandler) tokenErrorHandler(err);
              }
            });
          }
          tokenErrorHandler = (err) => {
            finish(
              reject,
              new SyncError(
                "needs-interaction",
                `Google pidió interacción (${(err && err.type) || "error"}).`
              )
            );
          };
          tokenClient.callback = (response) => {
            if (response && response.access_token) {
              accessToken = response.access_token;
              tokenExpiresAt = Date.now() + Number(response.expires_in || 3600) * 1000;
              finish(resolve, accessToken);
            } else {
              finish(reject, new SyncError("needs-interaction", "Google no entregó un token de acceso."));
            }
          };
          /* La distinción que faltaba (pedido de José: «me sigue pidiendo
             iniciar sesión cada vez que entro»):
             - interactive=true SOLO cuando José toca Conectar/Reconectar:
               prompt "" deja que Google muestre su pantalla si hace falta.
             - Todo lo automático (al abrir la app, al volver a ella, al
               recuperar la red) va con prompt "none": Google entrega el
               token EN SILENCIO o falla sin mostrar NINGUNA pantalla. Si
               falla, el estado queda needsReconnect visible solo en el
               Menú, y el juego nunca le pide iniciar sesión al entrar. */
          tokenClient.requestAccessToken({ prompt: interactive ? "" : "none" });
        });
      } finally {
        pendingToken = null;
      }
    })();
    return pendingToken;
  }

  async function api(url, options = {}, { retry = true } = {}) {
    const token = await requestToken({});
    let response;
    try {
      response = await doFetch(url, {
        ...options,
        headers: { ...(options.headers || {}), Authorization: `Bearer ${token}` }
      });
    } catch (error) {
      throw new SyncError("offline", "Sin conexión con Google Drive.");
    }
    if (response.status === 401 && retry) {
      accessToken = "";
      tokenExpiresAt = 0;
      return api(url, options, { retry: false });
    }
    if (!response.ok) {
      throw new SyncError(`http-${response.status}`, `Google Drive respondió ${response.status}.`);
    }
    return response;
  }

  return {
    requestToken,
    async ensureSession() {
      await requestToken({});
    },
    async getUserEmail() {
      const response = await api("https://www.googleapis.com/oauth2/v3/userinfo");
      const data = await response.json();
      return (data && data.email) || "";
    },
    async findFile(name) {
      const q = encodeURIComponent(`name = '${name}' and trashed = false`);
      const response = await api(
        `${DRIVE_API_BASE}/files?spaces=appDataFolder&fields=files(id,name,modifiedTime)&q=${q}`
      );
      const data = await response.json();
      const files = (data && data.files) || [];
      return files.length ? { id: files[0].id, modifiedTime: files[0].modifiedTime || "" } : null;
    },
    async download(id) {
      const response = await api(`${DRIVE_API_BASE}/files/${id}?alt=media`);
      return response.text();
    },
    async upload(name, text, existingId) {
      if (existingId) {
        const response = await api(
          `${DRIVE_UPLOAD_BASE}/files/${existingId}?uploadType=media&fields=id,modifiedTime`,
          { method: "PATCH", headers: { "Content-Type": "application/json" }, body: text }
        );
        const data = await response.json();
        return { id: data.id || existingId, modifiedTime: data.modifiedTime || "" };
      }
      const boundary = `odea2sync${Date.now().toString(36)}`;
      const metadata = JSON.stringify({ name, parents: ["appDataFolder"] });
      const body =
        `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n` +
        `--${boundary}\r\nContent-Type: application/json\r\n\r\n${text}\r\n--${boundary}--`;
      const response = await api(`${DRIVE_UPLOAD_BASE}/files?uploadType=multipart&fields=id,modifiedTime`, {
        method: "POST",
        headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
        body
      });
      const data = await response.json();
      return { id: data.id || "", modifiedTime: data.modifiedTime || "" };
    },
    async revoke() {
      if (accessToken && typeof window !== "undefined" && window.google) {
        try {
          window.google.accounts.oauth2.revoke(accessToken, () => {});
        } catch (error) {
          /* la revocación es best-effort */
        }
      }
      accessToken = "";
      tokenExpiresAt = 0;
    }
  };
}

/* ------------------------------------------------------------------ */
/* Motor de sincronización (transporte inyectable, probado sin red)    */
/* ------------------------------------------------------------------ */

const FRESH_META = () => ({
  enabled: false,
  everConnected: false,
  email: "",
  fileId: "",
  conflictFileId: "",
  lastLocalHash: "",
  lastCloudModified: "",
  lastSyncAt: "",
  bootstrapped: false
});

export function createSyncEngine({ storage, readRawSave, applySave, transport, onState, onPulled, debounceMs = 2500, connectTimeoutMs = 25000, sessionTimeoutMs = 12000, retryDelayMs = 1500, nowIso } = {}) {
  const now = nowIso || (() => new Date().toISOString());
  let meta = FRESH_META();
  try {
    const rawMeta = storage.getItem(SYNC_META_KEY);
    if (rawMeta) meta = { ...FRESH_META(), ...JSON.parse(rawMeta) };
  } catch (error) {
    meta = FRESH_META();
  }

  let state = {
    status: transport ? (meta.enabled ? "ready" : "off") : "unconfigured",
    message: ""
  };
  let busy = false;
  let pendingReconcile = false;
  let pendingCloud = null;
  let pushTimer = null;

  function getState() {
    return {
      status: state.status,
      message: state.message,
      enabled: !!meta.enabled,
      email: meta.email || "",
      lastSyncAt: meta.lastSyncAt || "",
      configured: !!transport
    };
  }

  function setStatus(status, message = "") {
    state = { status, message };
    if (onState) onState(getState());
  }

  function saveMeta() {
    try {
      storage.setItem(SYNC_META_KEY, JSON.stringify(meta));
    } catch (error) {
      /* la metadata es auxiliar: si no se puede guardar, la sync se apaga sola */
    }
  }

  async function doPush(cloud) {
    const raw = readRawSave();
    if (!raw) return;
    const result = await transport.upload(SYNC_FILE_NAME, raw, meta.fileId || (cloud && cloud.id) || "");
    meta.fileId = result.id || meta.fileId;
    meta.lastCloudModified = result.modifiedTime || meta.lastCloudModified;
    meta.lastLocalHash = hashText(raw);
    meta.lastSyncAt = now();
    meta.bootstrapped = true;
    saveMeta();
  }

  async function doPull(cloud, { conflict = false } = {}) {
    const text = await transport.download(cloud.id);
    applySave(text); // valida y respalda el save actual antes de escribir
    const rawAfter = readRawSave();
    meta.fileId = cloud.id;
    meta.lastCloudModified = cloud.modifiedTime || "";
    meta.lastLocalHash = rawAfter ? hashText(rawAfter) : "";
    meta.lastSyncAt = now();
    meta.bootstrapped = true;
    saveMeta();
    if (onPulled) onPulled({ conflict });
    return conflict
      ? "Había cambios en los dos aparatos: se aplicó la copia de Drive y la de este aparato quedó guardada como copia de conflicto en Drive."
      : "Se bajó la copia más reciente de Drive.";
  }

  async function preserveLocalAsConflict() {
    const raw = readRawSave();
    if (!raw) return;
    let existingId = meta.conflictFileId || "";
    if (!existingId) {
      const found = await transport.findFile(SYNC_CONFLICT_FILE_NAME);
      existingId = (found && found.id) || "";
    }
    const result = await transport.upload(SYNC_CONFLICT_FILE_NAME, raw, existingId);
    meta.conflictFileId = result.id || existingId;
    saveMeta();
  }

  async function reconcile(reason) {
    if (!transport) {
      setStatus("unconfigured", "La sincronización no está configurada en esta versión.");
      return;
    }
    if (!meta.enabled) {
      setStatus("off");
      return;
    }
    if (busy) {
      pendingReconcile = true;
      return;
    }
    busy = true;
    setStatus("syncing", state.message);
    let message = "";
    try {
      await withTimeout(transport.ensureSession(), sessionTimeoutMs, "timeout", SYNC_TIMEOUT_MESSAGE);
      const cloud = await transport.findFile(SYNC_FILE_NAME);
      const raw = readRawSave();
      const hasLocal = !!raw;
      const hasCloud = !!cloud;
      const localChanged = meta.bootstrapped ? (hasLocal ? hashText(raw) : "") !== meta.lastLocalHash : false;
      const cloudChanged = meta.bootstrapped ? ((cloud && cloud.modifiedTime) || "") !== meta.lastCloudModified : false;
      const action = decideSync({
        hasLocal,
        hasCloud,
        localChanged,
        cloudChanged,
        bootstrapped: meta.bootstrapped
      });
      if (action === "choice") {
        pendingCloud = cloud;
        setStatus(
          "choice",
          "Este aparato y tu Drive tienen partidas distintas. Elegí cuál conservar; la otra queda guardada como copia de respaldo."
        );
        return;
      }
      if (action === "push") {
        await doPush(cloud);
        message = "Copia subida a Drive.";
      } else if (action === "pull") {
        message = await doPull(cloud);
      } else if (action === "conflict") {
        await preserveLocalAsConflict();
        message = await doPull(cloud, { conflict: true });
      } else {
        meta.lastSyncAt = now();
        /* Sin nada en ningún lado no hay elección pendiente: el primer save
           que aparezca se sube solo vía notifyChanged. */
        if (!hasLocal && !hasCloud) meta.bootstrapped = true;
        saveMeta();
      }
      setStatus("ready", message);
    } catch (error) {
      if (error && error.code === "needs-interaction") {
        setStatus("needsReconnect", "La sesión de Google venció. Tocá Reconectar para seguir sincronizando.");
      } else if (error && error.code === "timeout") {
        setStatus("needsReconnect", SYNC_TIMEOUT_MESSAGE);
      } else {
        setStatus("error", (error && error.message) || "La sincronización falló.");
      }
    } finally {
      busy = false;
      if (pendingReconcile) {
        pendingReconcile = false;
        reconcile("queued");
      }
    }
  }

  return {
    getState,
    async init() {
      if (!transport) {
        setStatus("unconfigured", "La sincronización no está configurada en esta versión.");
        return;
      }
      if (!meta.enabled) {
        setStatus("off");
        return;
      }
      await reconcile("boot");
      /* La renovación silenciosa al abrir puede fallar por algo pasajero
         (la sesión de Google aún cargando, red inestable): un segundo
         intento solo, sin pedirle nada a José, antes de rendirse. */
      if (state.status === "needsReconnect") {
        await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
        await reconcile("boot");
      }
    },
    async connect() {
      if (!transport) {
        setStatus("unconfigured", "La sincronización no está configurada en esta versión.");
        return;
      }
      setStatus("connecting", "Abriendo el inicio de sesión de Google…");
      try {
        await withTimeout(
          transport.requestToken({ interactive: true }),
          connectTimeoutMs,
          "timeout",
          SYNC_TIMEOUT_MESSAGE
        );
        meta.enabled = true;
        meta.everConnected = true;
        try {
          meta.email = (await transport.getUserEmail()) || meta.email;
        } catch (error) {
          /* el correo es solo para mostrar; no bloquea */
        }
        saveMeta();
      } catch (error) {
        setStatus("error", (error && error.message) || "No se pudo conectar con Google.");
        return;
      }
      await reconcile("connect");
    },
    async disconnect() {
      if (transport) {
        try {
          await transport.revoke();
        } catch (error) {
          /* best-effort */
        }
      }
      meta = FRESH_META();
      saveMeta();
      setStatus("off", "Sincronización desconectada. Tu partida local no se tocó.");
    },
    async syncNow() {
      await reconcile("manual");
    },
    async useCloud() {
      if (!pendingCloud) return;
      const cloud = pendingCloud;
      pendingCloud = null;
      busy = true;
      setStatus("syncing");
      try {
        const message = await doPull(cloud);
        setStatus("ready", message);
      } catch (error) {
        setStatus("error", (error && error.message) || "No se pudo bajar la copia de Drive.");
      } finally {
        busy = false;
      }
    },
    async useLocal() {
      const cloud = pendingCloud;
      pendingCloud = null;
      busy = true;
      setStatus("syncing");
      try {
        if (cloud) await preserveCloudAsConflict(cloud);
        await doPush(cloud);
        setStatus("ready", "Se subió la partida de este aparato a Drive.");
      } catch (error) {
        setStatus("error", (error && error.message) || "No se pudo subir la partida.");
      } finally {
        busy = false;
      }
    },
    notifyChanged() {
      if (!transport || !meta.enabled || !meta.bootstrapped) return;
      const raw = readRawSave();
      if (!raw) return;
      if (hashText(raw) === meta.lastLocalHash) return;
      if (pushTimer) clearTimeout(pushTimer);
      pushTimer = setTimeout(() => reconcile("change"), debounceMs);
    }
  };

  async function preserveCloudAsConflict(cloud) {
    try {
      const text = await transport.download(cloud.id);
      let existingId = meta.conflictFileId || "";
      if (!existingId) {
        const found = await transport.findFile(SYNC_CONFLICT_FILE_NAME);
        existingId = (found && found.id) || "";
      }
      const result = await transport.upload(SYNC_CONFLICT_FILE_NAME, text, existingId);
      meta.conflictFileId = result.id || existingId;
      saveMeta();
    } catch (error) {
      /* preservar es best-effort: no bloquea la elección del usuario */
    }
  }
}
