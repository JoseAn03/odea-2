> **Estado (2026-11-16):** las preguntas abiertas de estas fichas quedaron **resueltas** por las
decisiones C1-C4 del orquestador, incorporadas en [docs/FASE3_SPEC.md](FASE3_SPEC.md) §8.3 y §9.
Este documento queda como inventario tecnico; ante cualquier discrepancia, manda la spec.

# FASE 4 — Fichas de dominio (Entrega F)

Documento de trabajo para activar los seis distritos que siguen en solo lectura.
Cada ficha sigue el formato que pide la guía (pág. 28): **reglas heredadas,
entradas, salidas, moneda o recurso propio, reversibilidad, fixtures y
proyecciones**, más el estado del catálogo, que es el que decide si el dominio
es activable o no.

> **Regla de oro:** un dominio sin catálogo **no se inventa**. Si un id de
> misión no resuelve contra `data/xp-catalog.json`, `missionOf` devuelve `null`
> y la escritura se rechaza con `UNKNOWN_MISSION`. Eso es correcto: preferimos
> un distrito bloqueado a uno con misiones inventadas.

---

## Resumen

| Dominio | Distrito | Catálogo | Datos heredados | Riesgo | Veredicto |
|---|---|---|---|---|---|
| **Capital** | La Torre | ✅ `capital.done` (40) · `capital.eng` (30) · `capital.ai` (31) | `core.capital.done/eng/ai` | **Bajo** | **Activable ya** |
| Sagas | Mirador | ✅ `sagas` (12 capítulos) · `bosses` (16) | `worlds.sagas`, `core.gods` | Medio | **Implementado** (capítulos y jefes) |
| Tesoro | El Mercado | ❌ misiones | `worlds.tesoro` | **Alto** | El Mercado sigue sin misiones; la **Tienda** vive aparte en `play.tienda` (v0.23.0) |
| Academia | Distrito IA | ✅ `academia` (29: 28 reales + `meta-final`) | `worlds.academia.hechas` | Bajo | **Implementado** (v0.18.0): jugable, 0 XP por completación, sinergia del Tesoro |
| Garaje | El Garaje | ❌ | `worlds.garaje` | — | **Bloqueado**: falta catálogo |
| Anomalía | Rincón Anomalía | ❌ | `worlds.anomalia` | — | **Bloqueado**: el quiz es archivo, no progreso |

---

## 1. Capital — La Torre

**Veredicto: IMPLEMENTADO** (`0.8.0-fase3`). Tenía catálogo completo y ningún
componente económico, y se resolvió con el patrón de Empleo.

| Campo | Valor |
|---|---|
| **Entradas** | `core.capital.done[]`, `core.capital.eng[]`, `core.capital.ai[]` (arrays de ids completados) |
| **Catálogo** | `capital.done` (40), `capital.eng` (30), `capital.ai` (31) → **101 misiones** |
| **Salidas** | Registro de completación en `play.completions` con `system: "capital"` |
| **Componente de XP** | `capital` |
| **Frecuencia** | Todas de una sola vez (sin `kind` → clase `one`) |
| **Moneda propia** | No. Solo XP. |
| **Reversibilidad** | No hace falta: una completación única no se deshace |
| **Fixture** | El existente ya trae `capital` con XP migrado |
| **Proyecciones** | `xpBreakdown.capital` y el total deben cuadrar tras cada escritura |

**Verificado contra el fixture:** los arrays ya usan **ids del catálogo**
(`done: ["ca1_1","ca1_3"]`, `eng: ["en1_1"]`, `ai: ["ia1_2"]`) y el XP migrado de
`capital` es 630. No hace falta traducir ids: la paridad es comprobable
directamente, que es exactamente lo que faltaba en Academia.

**Trabajo requerido**

1. Añadir `capital` a `SYSTEM_MAPS` y `PHASE3_SYSTEMS` (`src/catalog.js`). ✅
2. Sub-mapas anidados: `capital.done`, `capital.eng`, `capital.ai`. ✅
3. Enseñar Capital a `mergePlaySources` y `sourcesFromMigrated` para que las
   completaciones nuevas sumen XP **sin duplicar** lo migrado (`union`). ✅
4. Grupo de UI por submódulo: Ahorro, Inglés, IA. ✅
5. Tests de paridad: 101 misiones, ninguna duplicada, idempotencia `one` y
   no doble conteo del XP migrado. ✅

**Hallazgo colateral (corregido):** al implementarlo apareció que Empleo, Hub y
Vida ofrecían como pendientes misiones que ODEA 1 **ya tenía completas**. El XP
nunca se duplicaba —`derive` deduplica— pero la UI mentía y se ensuciaba
`play.completions` con registros inútiles. Se añadió `migratedKeys()` en
`src/gameplay.js`, que traduce el progreso heredado al mismo espacio de claves
de ocurrencia y hace que la UI y la mutación lo traten como duplicado.

**Riesgo:** bajo. No toca saldo ni precios.

---

## 2. Sagas — Mirador de Sagas

**Veredicto: IMPLEMENTADO** (`0.10.0-fase3`) para capítulos y jefes. La mecánica
**semanal** (saga de la semana y jefe semanal) sigue de solo lectura.

| Campo | Valor |
|---|---|
| **Entradas** | `worlds.sagas.chapters` (id → fecha), `worlds.sagas.weekly`; `core.gods` (id → `true`) |
| **Catálogo** | `sagas` (2 sagas · 12 capítulos) + `bosses` (16) → **28 misiones** |
| **Componente de XP** | `bosses` para jefes; los capítulos reparten entre `kid` y `pow` |
| **Frecuencia** | Todas de una sola vez en este alcance |
| **Moneda propia** | No |
| **Reversibilidad** | No hace falta |

**La particularidad:** una sola misión puede mover **dos** componentes de XP.
Un capítulo de la saga `video` vale 200 XP y se reparte `kid` 0.6 / `pow` 0.4
según el `split` de su saga. `derive` ya lo calculaba; lo que faltaba era que
una completación nueva agregara el capítulo a `sources.sagas.chapters`.

**Cómo se resolvió:** Sagas no es un mapa plano, así que `sagasEntries()`
normaliza capítulos y jefes a la misma forma que el resto (`id`, `map`, `xp`,
`cls`). `mergePlaySources` enruta por catálogo: si el id está en `bosses` va a
`gods`, si no, a capítulos. La UI agrupa en Video · Roblox · Jefes.

**Fuera de alcance a propósito:** `worlds.sagas.weekly` y `worlds.jefe` son
mecánicas semanales con sus propios premios y rachas. Se muestran como están y
no se escriben; activarlas requiere su propia decisión.

---

## 3. Tesoro — El Mercado

**Veredicto: no activar.** Es el dominio de mayor riesgo de todo el proyecto.

| Campo | Valor |
|---|---|
| **Entradas** | `worlds.tesoro`: `monedas`, `escudos`, `propios`, `reclamos`, `sinergias`, `racha` |
| **Catálogo** | ❌ Ninguno |
| **Moneda propia** | **Sí**: monedas, escudos y canjes |
| **Reversibilidad** | Compras y equipamientos; el saldo es derivado y nunca se edita |

La guía es explícita (pág. 12): *«Comprar: producto existente, precio aprobado,
saldo suficiente y escritura única»* y (pág. 14) *«los sistemas económicos
merecen revisión especial»*. Sin catálogo de productos y precios heredados, no
hay paridad posible: cualquier precio sería inventado.

**Requisito previo:** extraer del origen los productos, precios y efectos, y
escribir tests de **no duplicación** y de **no doble cargo** antes de tocar la UI.

---

## 4. Academia — Distrito IA

**Veredicto (actualizado en v0.27.1): implementado y jugable.** El catálogo se
extrajo de `assets/odea-academia.js` y vive en `data/xp-catalog.json`; la ficha
de abajo se conserva como registro de lo que se verificó **antes** de tenerlo.

| Campo | Valor |
|---|---|
| **Entradas** | `worlds.academia.data.hechas` (id → fecha), `rutasAvisadas` (array) |
| **Catálogo** | ✅ `academia`: 29 entradas (28 reales + `meta-final`, que no se completa) |
| **Componente de XP** | ❌ Academia no aparece en `xpBreakdown`: su XP es 0 por diseño |
| **Denominador real** | **29** (regla de ODEA 1, verificada) |
| **Moneda propia** | Sí, en el libro del Tesoro: +3 por misión (tope 3/día) y +15 al cerrar una ruta |

### Lo que se verificó contra `odea.html`

1. **El catálogo del repo está en sync.** Se re-ejecutó
   `tools/extract-catalog.mjs` contra `odea.html` + `flujos_odea.js`
   (v5.99) y el resultado es **idéntico** a `data/xp-catalog.json` salvo la
   marca de tiempo y los hashes de `meta`. No hay misiones perdidas en los
   mapas existentes.

2. **Academia no está en `odea.html`.** Se carga desde un asset externo:
   `assets/odea-academia.js` y `assets/odea-academia.css`. Los ids y el XP de
   cada actividad viven ahí, y ese archivo **no forma parte del export**.

3. **El denominador sí está en `odea.html`.** ODEA 1 calcula el avance así:
   ```js
   n = Math.min(28, count(hechas));
   if (n >= 28) n = 29;
   acPct = Math.round((n / 29) * 100);
   ```

### Lo que se implementó (v0.18.0-fase4)

- El catálogo `academia` con sus **29 entradas** (28 reales + `meta-final`) y sus
  rutas; `missionOf` ya resuelve cada id.
- `academiaProgress()` en `src/derive.js` reproduce **exactamente** la regla de
  ODEA 1 (`n = min(28, count); si n ≥ 28 → 29; pct = round(n/29*100)`), así que
  el panel muestra `N de 29` con el denominador real del juego.
- La completación **no paga XP** (Academia no aporta a `xpBreakdown`): paga
  **sinergia del Tesoro** (+3 con tope diario de 3, +15 al cerrar una ruta),
  guardada como delta en `play.academia` porque `worlds` es inmutable.
- `tests/academia-jugable.test.js` (9) y `tests/academia.test.js` (7) lo cubren.

### Lo que sigue bloqueado

Nada de Academia. **Garaje** y **Anomalía** sí: sus catálogos
(`assets/odea-garaje.js`, `assets/odea-anomalias.js`) están extraídos en
`data/xp-catalog-live.json` pero **no** en el catálogo que juega la app, y
Anomalía no tiene ids estables en la fuente (se identifican por índice).

---

## 5. Garaje — El Garaje

**Veredicto: bloqueado.** Misma situación que Academia.

| Campo | Valor |
|---|---|
| **Entradas** | `worlds.garaje`: `km`, `misiones`, `accesorios` |
| **Catálogo** | ❌ Ninguno |
| **Moneda propia** | No, pero `accesorios` puede implicar compras |

**Requisito previo:** definir si las misiones del Garaje tienen ids propios o
reutilizan `jobs`/`campaign`. Sin eso, no hay catálogo.

---

## 6. Anomalía — Rincón Anomalía

**Veredicto: bloqueado por diseño.**

| Campo | Valor |
|---|---|
| **Entradas** | `worlds.anomalia`: `ultimaCarta`, `tipo`, `progreso`, `reclamada`, `fragmentos`, `pulsoHasta` |
| **Catálogo** | ❌ Ninguno |
| **Legacy** | `odea_quiz_v1` **archivado**, no es progreso activo |

El quiz se conserva como archivo —la guía exige que el crédito permanente
sobreviva— pero **no cuenta como progreso activo** y no se reabre. La Anomalía
tiene reglas y recursos propios que no deben confundirse con el saldo general
(pág. 5).

**Requisito previo:** definir el recurso propio de la Anomalía y si sus
fragmentos son cosméticos o económicos. Si son económicos, hereda el riesgo de
Tesoro.

---

## Orden recomendado

1. **Capital / La Torre** — único con catálogo completo y riesgo bajo. Es el
   siguiente que se implementa.
2. **Sagas / Mirador** — ficha profunda por el XP compartido por capítulo.
3. **Tesoro / Mercado** — revisión económica completa antes de cualquier código.
4. **Academia, Garaje, Anomalía** — bloqueados por catálogo. Requieren una
   verificación contra el fuente de ODEA 1 antes de poder planificarse.

> **Corrección respecto a la recomendación inicial:** propuse empezar por
> Distrito IA por ser *«solo lectura por catálogo»*. La lectura del catálogo
> muestra lo contrario: IA **no tiene** catálogo y no es activable. El candidato
> real es Capital.
>
> **Actualización con el fuente de ODEA 1:** Capital quedó implementado, y de
> Academia se recuperó lo que sí estaba en el fuente —su denominador real de
> 29— así que su avance ya es fiel. Lo que falta para jugarla es
> `assets/odea-academia.js`, un archivo aparte que el export no incluye.
