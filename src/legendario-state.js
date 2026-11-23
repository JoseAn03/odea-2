/**
 * legendario-state.js — SET LEGENDARIO (v0.49.0, Dinámicas de Enganche
 * Fase 5): el premio con peso de fin de evento, espejo del
 * EXO//ORÁCULO de ODEA 1. Un set cosmético que NO se puede comprar —
 * solo se gana completando la campaña de su evento.
 *
 *   play.legendario = {
 *     version: 1,
 *     grants: { "whatsapp": { date, at, items: [los 5 ids del set] } }
 *   }
 *
 * REGLAS (diseño §6):
 *   - Mecanismo GENÉRICO por campaña (`LEGENDARY_SETS`): esta fase
 *     define solo `whatsapp` → EXO//AUTÓMATA. El EXO//ORÁCULO de
 *     Decision Lab (`eventos`) queda anotado como futuro, FUERA de
 *     alcance: no se porta acá.
 *   - El reclamo es la mutación `legendario.claim { campaignId }` por
 *     la puerta única: el reducer verifica con `campaignView` que la
 *     campaña está completa (done === total), que existe set para
 *     esa campaña y que no hay grant previo. Al reclamar, las 5
 *     piezas entran en `play.tienda.owned` y el ATUENDO se equipa al
 *     instante (la ceremonia se ve al salir a la ciudad).
 *   - FAIL-CLOSED por dependencia: si la campaña aún no existe en
 *     CAMPAIGNS, `campaignView` devuelve null y el reclamo es
 *     imposible — el set nunca se otorga «a mano». (Al construir esta
 *     fase, 2026-11-23, `whatsapp` aún no existía: Operación
 *     Confirmación entra el 2026-11-24 y su llegada activa el reclamo
 *     sin fricción, porque la validación va contra el id.)
 *   - Refuerzo cruzado fail-closed: todo ítem `grantOnly` en
 *     `play.tienda.owned` EXIGE su grant en `play.legendario.grants`;
 *     sin grant, el save es inválido (`legendarioProblems`).
 *   - Derivación: NINGUNA. El set es cosmético puro (₡0, 0 XP): el
 *     oráculo no se toca y la paridad de totales es estructural.
 *   - Defaults/migración: sección ausente = sin grants; nadie pierde
 *     ni gana nada. Respaldo: grant + owned viajan juntos en el
 *     bundle — restaurar un respaldo anterior al reclamo restaura
 *     también la ausencia del set, coherente: es el mismo save.
 */
import { CAMPAIGNS } from "./campaigns.js";
import { campaignView } from "./campaign-state.js";
import { SHOP_ITEMS, shopItem } from "./shop.js";

export const LEGENDARIO_VERSION = 1;

/**
 * Los sets legendarios por campaña. Cada entrada: el nombre del set,
 * el nombre visible de su evento y las piezas (ids de SHOP_ITEMS, en
 * el orden de la vitrina: atuendo, vehículo, reliquias).
 */
export const LEGENDARY_SETS = Object.freeze({
  whatsapp: Object.freeze({
    name: "EXO//AUTÓMATA",
    campaignName: "Operación Confirmación",
    items: Object.freeze([
      "exo-automata",
      "mensajero-gt",
      "nucleo-automata",
      "sello-confirmacion",
      "antena-dorada"
    ])
  })
  /* Futuro (fuera de alcance de v0.49.0): portar el EXO//ORÁCULO de
     ODEA 1 para la campaña `eventos` (Decision Lab) cuando José lo
     pida — el mecanismo ya es genérico: bastará su entrada acá y
     sus 5 piezas grantOnly en SHOP_ITEMS. */
});

export function legendarySetFor(campaignId) {
  return LEGENDARY_SETS[campaignId] || null;
}

const plain = (v) => !!v && typeof v === "object" && !Array.isArray(v);

function isValidDateKey(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

function isValidTs(value) {
  return typeof value === "string" && value.length > 0 && Number.isFinite(Date.parse(value));
}

function grantRecordOk(record, set) {
  return plain(record) &&
    isValidDateKey(record.date) &&
    isValidTs(record.at) &&
    Array.isArray(record.items) &&
    record.items.length === set.items.length &&
    record.items.every((id, i) => id === set.items[i]);
}

/* ------------------------------ estado ------------------------------ */

export function legendarioStateOf(bundle) {
  const raw = plain(bundle?.play?.legendario) ? bundle.play.legendario : {};
  const grants = {};
  if (plain(raw.grants)) {
    for (const [campaignId, record] of Object.entries(raw.grants)) {
      const set = legendarySetFor(campaignId);
      if (!set || !grantRecordOk(record, set)) continue;
      grants[campaignId] = { date: record.date, at: record.at, items: [...set.items] };
    }
  }
  return { version: LEGENDARIO_VERSION, grants };
}

/**
 * Vista de un set para las UIs (panel de la campaña y Vitrina
 * Legendaria de la Colección): null si la campaña no tiene set.
 * `complete` sale de `campaignView` — sin campaña en CAMPAIGNS es
 * false siempre (fail-closed) y `canClaim` jamás se enciende.
 */
export function legendarioView(bundle, campaignId) {
  const set = legendarySetFor(campaignId);
  if (!set) return null;
  const state = legendarioStateOf(bundle);
  const grant = state.grants[campaignId] || null;
  const view = campaignView(bundle, campaignId);
  const complete = !!view && view.total > 0 && view.done === view.total;
  const owned = new Set(
    Array.isArray(bundle?.play?.tienda?.owned) ? bundle.play.tienda.owned.map(String) : []
  );
  return {
    campaignId,
    name: set.name,
    campaignName: set.campaignName,
    campaignExists: Boolean(CAMPAIGNS[campaignId]),
    complete,
    done: view ? view.done : 0,
    total: view ? view.total : 0,
    claimed: grant !== null,
    grant,
    canClaim: complete && grant === null,
    pieces: set.items.map((id) => {
      const item = shopItem(id);
      return { item, owned: id === "clasico" ? true : owned.has(id) || grant !== null };
    })
  };
}

/** Todos los sets definidos, con su vista (para la Colección). */
export function legendarioViews(bundle) {
  return Object.keys(LEGENDARY_SETS).map((id) => legendarioView(bundle, id)).filter(Boolean);
}

/* ----------------------------- validación ---------------------------- */

export function legendarioProblems(bundle) {
  const problems = [];
  const raw = bundle?.play?.legendario;
  if (raw != null) {
    if (!plain(raw)) {
      problems.push("play.legendario debe ser un objeto");
    } else {
      if (raw.version !== LEGENDARIO_VERSION) {
        problems.push(`play.legendario.version debe ser ${LEGENDARIO_VERSION}`);
      }
      if (!plain(raw.grants)) {
        problems.push("play.legendario.grants debe ser un mapa de grants por campaña");
      } else {
        for (const [campaignId, record] of Object.entries(raw.grants)) {
          const set = legendarySetFor(campaignId);
          if (!set) {
            problems.push(`play.legendario.grants.${campaignId}: campaña sin set legendario definido`);
            continue;
          }
          if (!grantRecordOk(record, set)) {
            problems.push(`play.legendario.grants.${campaignId}: registro inválido (date/at válidos e items exactos del set)`);
          }
        }
      }
    }
  }

  /* Refuerzo cruzado (§6.3): ninguna pieza grantOnly puede estar en
     `play.tienda.owned` sin el grant que la otorgó. Ni por bug ni
     por edición manual del save: sin grant, el save es inválido. */
  const grants = plain(raw) && plain(raw.grants) ? raw.grants : {};
  const grantedItems = new Set();
  for (const [campaignId, record] of Object.entries(grants)) {
    const set = legendarySetFor(campaignId);
    if (set && grantRecordOk(record, set)) {
      for (const id of set.items) grantedItems.add(id);
    }
  }
  const owned = Array.isArray(bundle?.play?.tienda?.owned) ? bundle.play.tienda.owned : [];
  for (const item of SHOP_ITEMS) {
    if (item.grantOnly && owned.includes(item.id) && !grantedItems.has(item.id)) {
      problems.push(`tienda.owned: la pieza legendaria ${item.id} exige su grant en play.legendario.grants`);
    }
  }
  return problems;
}

/* ----------------------------- mutaciones ---------------------------- */

function ensureState(draft) {
  if (!plain(draft.play)) draft.play = {};
  if (!plain(draft.play.legendario)) {
    draft.play.legendario = { version: LEGENDARIO_VERSION, grants: {} };
  }
  const state = draft.play.legendario;
  if (!plain(state.grants)) state.grants = {};
  return state;
}

function ensureTienda(draft) {
  if (!plain(draft.play.tienda)) {
    draft.play.tienda = { owned: [], outfit: "clasico", vehicle: null, spent: 0 };
  }
  if (!Array.isArray(draft.play.tienda.owned)) draft.play.tienda.owned = [];
  return draft.play.tienda;
}

/**
 * Mutación del Set Legendario:
 *   legendario.claim { campaignId } — el reclamo desde la vitrina
 *     del panel de la campaña. El reducer revalida TODO sobre el
 *     borrador (nunca confía en la UI): set definido para la
 *     campaña, sin grant previo y campaña completa según
 *     `campaignView` (done === total). Sin campaña en CAMPAIGNS,
 *     campaignView es null → NO_CAMPAIGN: fail-closed.
 * Al reclamar: las 5 piezas entran en `play.tienda.owned` y el
 * atuendo del set se equipa al instante.
 */
export function applyLegendarioMutation(draft, mutation, { at, date } = {}) {
  const no = (reason) => ({ changed: false, duplicate: false, reason, paths: [] });
  const dup = () => ({ changed: false, duplicate: true, reason: "DUPLICATE", paths: [] });
  if (mutation.type !== "legendario.claim") return no("UNKNOWN_MUTATION");
  if (legendarioProblems(draft).length) return no("SCHEMA_INVALID");

  const set = legendarySetFor(mutation.campaignId);
  if (!set) return no("NO_SET");
  if (legendarioStateOf(draft).grants[mutation.campaignId]) return dup();

  const view = campaignView(draft, mutation.campaignId);
  if (!view) return no("NO_CAMPAIGN");
  if (!(view.total > 0 && view.done === view.total)) return no("NOT_COMPLETE");

  const ts = isValidTs(at) ? at : new Date().toISOString();
  const today = isValidDateKey(date) ? date : ts.slice(0, 10);

  const state = ensureState(draft);
  state.grants[mutation.campaignId] = { date: today, at: ts, items: [...set.items] };

  const tienda = ensureTienda(draft);
  for (const id of set.items) {
    if (!tienda.owned.includes(id)) tienda.owned.push(id);
  }
  const outfit = set.items.map((id) => shopItem(id)).find((item) => item && item.kind === "outfit");
  const paths = [
    `play.legendario.grants.${mutation.campaignId}`,
    "play.tienda.owned"
  ];
  if (outfit) {
    tienda.outfit = outfit.id;
    paths.push("play.tienda.outfit");
  }
  return { changed: true, duplicate: false, reason: null, paths };
}
