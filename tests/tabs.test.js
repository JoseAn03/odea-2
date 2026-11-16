/**
 * tabs.test.js — contrato de la navegación de cuatro destinos.
 *
 * Cubre el orden, la validación de ids y el destino al cerrar. La barra es
 * pura: no necesita DOM para probarse.
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_TAB,
  TABS,
  TAB_CHARACTER,
  TAB_CITY,
  TAB_MENU,
  TAB_TODAY,
  isTabId,
  resolveTab,
  shouldShowTabbar,
  tabAfterClose
} from "../js/tabs.js";

test("tabs: cuatro destinos en el orden de la guía", () => {
  assert.deepEqual(
    TABS.map((tab) => tab.id),
    [TAB_CITY, TAB_TODAY, TAB_CHARACTER, TAB_MENU]
  );
  assert.deepEqual(
    TABS.map((tab) => tab.label),
    ["Ciudad", "Hoy", "Personaje", "Menú"]
  );
});

test("tabs: ids y etiquetas únicos, y todo botón tiene pista accesible", () => {
  assert.equal(new Set(TABS.map((tab) => tab.id)).size, TABS.length, "ids únicos");
  assert.equal(new Set(TABS.map((tab) => tab.label)).size, TABS.length, "etiquetas únicas");
  for (const tab of TABS) {
    assert.ok(tab.hint && tab.hint.length > 0, `${tab.id} necesita una pista para lectores`);
    assert.ok(tab.icon, `${tab.id} necesita un icono`);
  }
});

test("tabs: solo se muestran con un save activo", () => {
  assert.equal(shouldShowTabbar({ hasSave: true }), true);
  assert.equal(shouldShowTabbar({ hasSave: false }), false);
  assert.equal(shouldShowTabbar({}), false);
  assert.equal(shouldShowTabbar(), false);
});

test("tabs: un id desconocido cae en Ciudad, nunca en una pantalla vacía", () => {
  assert.equal(DEFAULT_TAB, TAB_CITY);
  assert.equal(resolveTab(TAB_MENU), TAB_MENU);
  assert.equal(resolveTab("personaje"), TAB_CHARACTER);
  assert.equal(resolveTab("inexistente"), TAB_CITY);
  assert.equal(resolveTab(null), TAB_CITY);
  assert.equal(resolveTab(undefined), TAB_CITY);
  assert.equal(resolveTab(42), TAB_CITY);
});

test("tabs: isTabId solo acepta strings conocidos", () => {
  assert.equal(isTabId(TAB_TODAY), true);
  assert.equal(isTabId("HOY"), false, "distingue mayúsculas");
  assert.equal(isTabId(""), false);
  assert.equal(isTabId(null), false);
  assert.equal(isTabId({}), false);
});

test("tabs: cerrar una pantalla siempre vuelve a la ciudad", () => {
  assert.equal(tabAfterClose(), TAB_CITY);
});
