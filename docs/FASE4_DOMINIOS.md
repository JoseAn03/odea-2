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
| Sagas | Mirador | ⚠️ `sagas` (2) · `bosses` (16) | `worlds.sagas`, `worlds.jefe` | Medio | Ficha profunda pendiente: el XP es compartido por capítulo |
| Tesoro | El Mercado | ❌ | `worlds.tesoro` | **Alto** | No activar sin reglas de precio y tests de no duplicación |
| Academia | Distrito IA | ❌ | `worlds.academia.hechas` | — | **Bloqueado**: falta catálogo |
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

**Veredicto: ficha profunda pendiente.** El modelo de XP no encaja en el patrón
`id → xp` fijo.

| Campo | Valor |
|---|---|
| **Entradas** | `worlds.sagas.chapters`, `videos`, `weekly`; `worlds.jefe` (semanal), `worlds.jefe.victorias` |
| **Catálogo** | `sagas` (2 capítulos), `bosses` (16) |
| **Componente de XP** | `bosses`, y Sagas reparte XP por capítulo |
| **Frecuencia** | Semanal en jefes, por capítulo en sagas |
| **Moneda propia** | No |

**El problema:** `src/derive.js` calcula el XP de sagas con una **cuota por
capítulo** (`saga.split[cat]`), no como una cantidad fija por misión. Una
completación de saga no vale `mission.xp` sino `Math.round(ch.xp * share)`.
El `applyMutation` actual registra la completación y deja que `derive` recalcule,
lo cual **funcionaría**, pero la paridad exige reproducir el reparto exacto y
probarlo. Es un dominio de riesgo medio, no de mecánica trivial.

**Antes de activarlo** hay que responder: ¿qué id de misión se registra cuando se
completa un capítulo? ¿El capítulo, o cada hito interno? La guía prohíbe
inventar la respuesta.

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

**Veredicto: bloqueado. No es el candidato simple que parecía.**

| Campo | Valor |
|---|---|
| **Entradas** | `worlds.academia.data.hechas` (id → fecha), `rutasAvisadas` (array) |
| **Catálogo** | ❌ **Ninguno** |
| **Componente de XP** | ❌ Academia no aparece en `xpBreakdown` |
| **Moneda propia** | No |

**El hallazgo:** los ids del fixture (`ina-ia`, `li-vitrina`, `cv-final`) no
existen en `campaign`, `daily`, `weekly`, `jobs`, `b2b`, `puente` ni `vida`.
Tampoco hay un mapa `academia` en el catálogo.

**Salvedad honesta:** el fixture es **sintético**, así que sus ids no prueban
nada sobre los datos reales. Lo que sí es un hecho es que **el catálogo no tiene
un mapa de Academia**, y sin mapa no hay ids válidos.

**Lo que hay que verificar** contra `odea.html` de ODEA 1:
- ¿Las actividades de Academia son un reskin de los flujos de campaña (`fl*`)?
  El `MIGRATION_SPEC.md` la describe como *«reskin, sin tocar lógica»*.
- Si lo son, el catálogo es `campaign` (74) y el dominio se vuelve activable.
- Si tienen ids propios, hay que extraerlos y ampliar el catálogo.

**Hasta entonces:** solo lectura, mostrando el inventario real de lo hecho con
una explicación honesta. Nunca un contador falso ni misiones de relleno.

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
