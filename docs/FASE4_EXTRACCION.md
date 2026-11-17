# Extracción de catálogos ODEA 1 → ODEA 2

**Fuente:** `JoseAn03/plan-analista-datos` @ `ebb0fce` — *«v6.00 — EVENTO Decision Lab + set EXO//ORÁCULO (#36)»*, punta de `main`.
**Herramienta:** `tools/extract-assets.mjs` (nueva) y `tools/extract-catalog.mjs` (corregida).
**Artefacto:** `data/xp-catalog-live.json`, con hash SHA-256 de cada archivo fuente.

Cada sección valida contra la fuente y **falla con error** si una declaración no existe o si un id se repite. Nada se completa «a ojo».

> **Nota de estado (actualizada en v0.27.1).** Esta pasada se pidió como «spec + extracción, con el Hub sin implementar, versión `0.3.0-fase2` y 61 tests». El repositorio está bastante más adelante: **0.27.1-fase7**, **268 tests**, y Hub, Empleo, Vida, La Torre, Sagas, Academia, campañas, Tienda y Diarias ya jugables. Se hizo la extracción pedida; no se revirtió nada. Las decisiones R1–R7 se evalúan contra el código real, no contra el estado descrito.

---

## (a) Por distrito

| Distrito | Catálogo | Fuente | Estado |
|---|---|---|---|
| **Academia (IA)** | **28 misiones** en 6 rutas | `assets/odea-academia.js` · `RUTAS` | ✅ Extraído |
| **Tesoro (Mercado)** | **25 objetos** (20 comprables + 5 otorgados) | `odea.html` · `SHOP_ITEMS` | ✅ Extraído |
| **Tesoro (cosméticos)** | **4 objetos** | `assets/odea-tesoro.js` · `SHOP` | ✅ Extraído |
| **Garaje** | **2 vehículos · 13 misiones** | `assets/odea-garaje.js` · `VEHICULOS`, `MISIONES_BASE` | ✅ Extraído |
| **Jefe (semanal)** | **4 jefes** | `assets/odea-jefe.js` · `BOSSES` | ⚠️ Sin ids en la fuente |
| **Anomalía** | **8 cartas** + 3 hitos | `assets/odea-anomalias.js` · `TRIVIA`, `MILESTONES` | ⚠️ Sin ids en la fuente |
| **Hub** | — | `assets/odea-hub.js` | Sin catálogo propio: sus misiones ya vienen de `daily`/`weekly` |
| **Juice** | — | `assets/odea-juice.js` | Sin catálogo: solo preferencias de sonido |
| **Quiz** | — | `odea-quiz*.js` | ⛔ Excluido por D5, no se lee |

### Academia: 28, no 29

La fuente declara `TOTAL = 29`, pero ese número es el **denominador del porcentaje**, no la cantidad de misiones. ODEA 1 calcula:

```js
n = Math.min(28, count(hechas));
if (n >= 28) n = 29;
acPct = Math.round((n / 29) * 100);
```

Hay **28 misiones reales** y una entrada con `meta: true` que es un paso narrativo. Llegar a 28 misiones equivale al 100%.

### Academia no otorga XP

Las misiones de Academia solo tienen `id`, `nombre`, `detalle`, `ruta` y `paso`. **No hay campo de XP**, y por eso tampoco existe un componente `academia` en `xpBreakdown`. Es una lista de acciones reales de carrera, no una fuente de puntos.

### Ids verificados

Academia, 28 ids únicos, sin duplicados:

```
arranque (5): efset-examen, efset-linkedin, ina-ia, ssms-instalar, ssms-puente
google (7):   g-curso2, g-curso3, g-curso5, g-curso6, g-curso7, g-capstone, g-advanced
microsoft (6), ia (4), demanda (3), vitrina (4)  → en el JSON completo
```

---

## (b) Tesoro: objetos, precios y efectos

Fuente exacta: **`odea.html` · `const SHOP_ITEMS`**. El efecto es `power` por slot.

| id | Objeto | Precio | Slot | Poder |
|---|---|---:|---|---:|
| `sw_wood` | Espada de Madera | 20 | mano | 50 |
| `sw_stone` | Espada de Piedra | 70 | mano | 150 |
| `sw_iron` | Espada de Hierro | 150 | mano | 400 |
| `sw_gold` | Espada de Oro | 320 | mano | 800 |
| `sw_diamond` | Espada de Diamante | 650 | mano | 1500 |
| `ax_wood` | Hacha de Madera | 25 | mano | 60 |
| `ax_iron` | Hacha de Hierro | 160 | mano | 420 |
| `ax_diamond` | Hacha de Diamante | 680 | mano | 1600 |
| `pk_wood` | Pico de Madera | 18 | mano | 40 |
| `pk_iron` | Pico de Hierro | 140 | mano | 380 |
| `pk_diamond` | Pico de Diamante | 600 | mano | 1400 |
| `sh_wood` | Escudo de Madera | 30 | escudo | 70 |
| `sh_iron` | Escudo de Hierro | 180 | escudo | 450 |
| `sh_diamond` | Escudo de Diamante | 700 | escudo | 1700 |
| `hl_iron` | Casco de Hierro | 130 | cabeza | 300 |
| `hl_diamond` | Casco de Diamante | 550 | cabeza | 1200 |
| `ch_iron` | Pechera de Hierro | 200 | torso | 500 |
| `ch_diamond` | Pechera de Diamante | 750 | torso | 1800 |
| `bt_iron` | Botas de Hierro | 120 | pies | 280 |
| `bt_diamond` | Botas de Diamante | 500 | pies | 1100 |
| `xo_costillar` | Exo-armazón «COSTILLAR NEÓN» | — (otorgado) | torso | 1900 |
| `xo_visor` | Visor «ORÁCULO» | — (otorgado) | cabeza | 1300 |
| `xo_brazo` | Servobrazo «PRECISIÓN» | — (otorgado) | mano | 1700 |
| `xo_pistones` | Pistones «SOBRECARGA» | — (otorgado) | pies | 1200 |
| `xo_nucleo` | Núcleo «DECISIÓN» | — (otorgado) | escudo | 1800 |

**Tienda distinta** — fuente `assets/odea-tesoro.js` · `const SHOP`:

| id | Objeto | Precio |
|---|---|---:|
| `titulo` | Título: «el Imparable» | 15 |
| `marco` | Marco dorado | 25 |
| `tema-aurora` | Tema Aurora boreal | 40 |
| `tema-synthwave` | Tema Atardecer synthwave | 40 |

Reglas del módulo: `PRECIO_ESCUDO = 20`, `MAX_ESCUDOS = 2`, `XP_POR_MONEDA = 10`.

**Las dos tiendas coexisten en la fuente** y una no reemplaza a la otra.

---

## (c) Cobertura de la matriz T01–T24

Con la suite actual (**268 tests**), cruzada con la matriz de la guía:

| Estado | Casos |
|---|---|
| ✅ Cubiertos | **T01–T15, T18–T22, T24** (21 casos) |
| ⚠️ Parcial | **T17** actualización pendiente: hay tests unitarios del watcher, no end-to-end |
| ❌ Sin cobertura | **T16** offline real · **T23** teclado/lector/zoom |

**Resultado: 21/24 completos, 22/24 contando T17 como parcial.**

Los tres faltantes comparten una causa: son pruebas de **navegador o dispositivo**, y la suite corre en Node sin DOM. T24 se cubrió en Node con 14.700 ocurrencias sintéticas (`tests/t24-historial-grande.test.js`).

---

## (d) Sección aditiva y firma de la mutación

- **Sección aditiva:** `play` en `odea2_bundle_v1`. Nombre sin cambios.
- **Ruta única:** `applyGameplayMutation(storage, catalog, mutation, opts)` en `src/storage.js`.
- **Variante con exclusión:** `applyGameplayMutationLocked(...)`, que envuelve la anterior en un Web Lock de origen.
- **Clave de idempotencia:** `occurrenceKey(missionId, cls, dateKey)` → `id` · `id@YYYY-MM-DD` · `id@YYYY-Www`.
- **Registro persistido:** `{ missionId, system, date, at, period? }`.

### Desviación real respecto de R1

**R1 pide que cada registro guarde la recompensa tomada del catálogo al escribir**, para que un cambio futuro del catálogo no reescriba el historial.

**El código actual no lo hace:** el registro no guarda XP ni monedas, y `derive` recalcula desde el catálogo vigente. Consecuencia: **si el catálogo cambia, el historial viejo cambia con él**.

Es el único punto de R1/R2 que no está cumplido. Corregirlo toca el schema del bundle, así que es una decisión, no un ajuste.

R2 sí está implementado (CAS + releer antes de escribir + resultado `CONCURRENT_CHANGE`), con Web Locks como capa adicional, tal como se pidió.

---

## (e) Preguntas abiertas reales

Solo estas cuatro no se responden ni con el código ni con las decisiones aprobadas:

1. **¿Cuál de las dos tiendas expone El Mercado?** Equipamiento (`SHOP_ITEMS`, 25 objetos con `power`) o cosméticos (`SHOP`, 4 con `desc`), o las dos como secciones. La fuente las mantiene separadas y la guía habla de «Tesoro y tienda» en singular.
2. **¿Se implementa la instantánea de recompensa de R1?** Implica cambiar la forma del registro y el schema. Hoy no está.
3. **Jefes y cartas de Anomalía no tienen id en la fuente.** ¿Se aceptan ids posicionales (`jefe-0`, `carta-0`), sabiendo que se rompen si el contenido se reordena, o se consideran no jugables sin id estable?
4. **¿Academia se activa como checklist sin XP?** La fuente no asigna puntos a sus 28 misiones. Se puede jugar (marcar hechas) pero no mueve ningún componente de XP.

---

## Hallazgos colaterales

- **`tools/extract-catalog.mjs` mentía sobre su procedencia:** tenía `appVersion: "5.99"` hardcodeado. Un catálogo regenerado desde v6.00 seguía declarándose 5.99. **Corregido**: ahora lee `APP_VERSION` de `odea.html`. El `data/xp-catalog.json` entregado declara `5.99` porque se generó desde esa fuente: es correcto, no un residuo.
- **El catálogo no era reproducible con el extractor (corregido en v0.27.1).** `extract-catalog.mjs` solo emite las secciones que lee de `odea.html`/`flujos_odea.js`: al reescribir el archivo borraba `academia` (29), `shop` (25) y `cosmetics` (4), que vinieron de `extract-assets.mjs` y se fusionaron a mano — dejando el juego sin rutas de Academia ni precios de la Mochila. Desde v0.27.1 el extractor **fusiona con la copia anterior**, conserva esas tres secciones, lo declara en `meta.preservedSections` y avisa (exit 3) si faltan. `tests/extractor.test.js` lo fija. Sobre «idéntico»: el contenido extraído coincide, pero `meta.generatedAt`, `meta.sourceFiles` y las secciones preservadas cambian en cada regeneración, así que el archivo **no** es byte-reproducible.
- **`assets/` no está en `Downloads`.** Las fuentes se obtuvieron del commit `ebb0fce` del repositorio, no de archivos locales.
