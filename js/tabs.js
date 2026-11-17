/**
 * tabs.js — contrato de la navegación principal.
 *
 * Cuatro destinos permanentes (guía maestra, pág. 8): Ciudad, Hoy, Mochila y
 * Menú. Módulo PURO: no toca DOM ni el save, así que se prueba en Node como el
 * resto de la lógica.
 *
 * Regla de alcance: la barra solo existe con un save activo. Sin save, la
 * pantalla de importación de la Fase 1 sigue siendo la única entrada y este
 * módulo no cambia ese flujo.
 */

export const TAB_CITY = "ciudad";
export const TAB_TODAY = "hoy";
export const TAB_MOCHILA = "mochila";
export const TAB_MENU = "menu";

/** Orden fijo de la barra. `hint` alimenta el aria-label de cada botón. */
export const TABS = [
  { id: TAB_CITY, label: "Ciudad", icon: "◉", hint: "Mapa de Costa Neón y distritos" },
  { id: TAB_TODAY, label: "Hoy", icon: "◆", hint: "Ruta del día en el Hub" },
  { id: TAB_MOCHILA, label: "Mochila", icon: "🎒", hint: "Nivel, XP, inventario y recursos" },
  { id: TAB_MENU, label: "Menú", icon: "⋯", hint: "Respaldo, importar y versión" }
];

export const DEFAULT_TAB = TAB_CITY;

const IDS = TABS.map((tab) => tab.id);

/** ¿Es un id de pestaña conocido? */
export function isTabId(value) {
  return typeof value === "string" && IDS.includes(value);
}

/** Normaliza cualquier entrada a un id válido (desconocido → Ciudad). */
export function resolveTab(value) {
  return isTabId(value) ? value : DEFAULT_TAB;
}

/** La barra solo se muestra cuando hay un save activo. */
export function shouldShowTabbar({ hasSave } = {}) {
  return Boolean(hasSave);
}

/**
 * Destino que corresponde al cerrar una pantalla superpuesta.
 *
 * Cerrar la hoja del distrito o una pantalla de pestaña siempre devuelve a la
 * ciudad: la guía exige que al cerrar el detalle se vuelva al contexto
 * anterior y que la ciudad sea siempre el hogar.
 */
export function tabAfterClose() {
  return TAB_CITY;
}
