# MIGRATION_SPEC — ODEA 1 (v5.99) → ODEA 2 (`odea2_` v1)

**Fase 0 · Costa Neón · rama `fase0-migracion-spec`**
Estado: **especificación cerrada y validada**. No incluye UI ni juego.

---

## 0. Resumen ejecutivo

ODEA 1 guarda el progreso en el `localStorage` del teléfono, no en un repo. El
usuario exporta un bundle `odea_bundle_v2` (formato v5.99) con:

- `save`: el `gameState` completo, **36 campos**.
- `keys`: **11 claves hermanas** de `localStorage` (`odea_*`).

ODEA 2 guarda desde el día uno con prefijo `odea2_` y schema versionado. La
migración es una **importación única**: lee el bundle v2 y lo convierte a un
bundle `odea2_bundle_v1`.

El XP de ODEA 1 es **derivado**: se recalcula desde las fuentes
(`recomputeState()`, v5.99). Por eso la migración preserva las **fuentes**, no
solo los totales. La paridad se verifica con un **oráculo** que replica la
derivación de v5.99 (`src/derive.js`) y un **checksum** contra
`xpBreakdown`/`totalXP` guardados.

### Resultado verificado

| Conjunto | totalXP | 10 componentes | campaignLevel | odeLevel | Monedas (earned/spent/balance) |
|---|---|---|---|---|---|
| Fixture sintético | 6.915 | idénticos | 3 | 13 | 141 / 100 / 41 |

> Todos los valores de ejemplo de este documento corresponden al **fixture
> sintético** (`fixtures/odea-progreso-sintetico.json`). El bundle real del
> usuario nunca se publica.

---

## 1. Decisiones cerradas de Fase 0

Estas cinco decisiones están **cerradas** y el código de validación las
implementa. No son propuestas: son contrato.

### D1 — Checksum: cuarentena con aviso y backup, con dos candados

La importación **nunca** escribe un save activo sin pasar dos candados, en este
orden:

| Candado | Qué verifica | Si falla |
|---|---|---|
| **1. Reconciliación de totales** | `totalXP`, los **10 componentes** de `xpBreakdown` y `shop.spent` recalculados desde las fuentes deben coincidir con los del bundle. | **ABORTA**. No se escribe nada como save activo. |
| **2. Checksum estructural** | Los 36 campos, las 11 claves y los 3 críticos (`eventRL`, `farm`, `canje`) están presentes. | **CUARENTENA**. Se escribe solo un preview; el usuario decide. |

- **En todos los casos** se guarda un **backup intacto del bundle original**
  antes de cualquier escritura (incluso si la importación termina abortada).
- En cuarentena se genera un **reporte de totales** (`totalXP`, cada componente
  de `xpBreakdown`, `shop.spent`) para que el usuario **acepte o aborte**
  explícitamente.
- Abortar una cuarentena descarta el preview; el backup del origen permanece.

Estados posibles: `active`, `quarantine`, `aborted`. **Solo `active` se puede
cargar o guardar como save.**

### D2 — Almacenamiento: bundle único con tres secciones internas

Un **único** bundle `odea2_bundle_v1` (clave `odea2_bundle_v1`), con secciones
internas separadas por dominio:

| Sección | Contenido | Por qué |
|---|---|---|
| `core` | Estado del núcleo (los 36 campos de `save`). | Separa el estado de juego. |
| `worlds` | 8 claves hermanas **activas**. | Se usan en ODEA 2. |
| `legacy` | 3 claves **archivadas** (`empleo`, `quiz`, `events`). | Lo legacy no contamina lo activo. |

Cada sección es autocontenida: una futura separación en claves por dominio
(`odea2_core_*`, `odea2_world_*`, `odea2_legacy_*`) **no requiere cambiar el
formato**, solo la capa de almacenamiento.

### D3 — `referenceDate` = `lastDailyDate` (efecto conocido, sin compensar)

Se prioriza la **continuidad de la racha y del ciclo diario**. La fecha de
referencia se fija en `lastDailyDate` (fallback: fecha de importación) y se usa
tanto para re-derivar como para cargar.

**Efecto conocido y aceptado:** el bonus semanal de sagas
(`sagaWeeklyDone()`) depende de la semana ISO. Si el save se importara
calculando con la semana actual en vez de `lastDailyDate`, el bonus caería y
`vida` bajaría 75 XP. Por eso se fija la fecha. Si aun así cambia (p. ej. un
bundle viejo cuya racha semanal ya había expirado), **se acepta el valor
recalculado: no hay compensaciones manuales**.

### D4 — Reimportación: rechazada por defecto

- Un **segundo import** sobre un save `odea2_` existente se **RECHAZA**
  (`ALREADY_IMPORTED`).
- Reimportar solo es posible con la acción explícita **«reset + reimportar»**,
  que **primero hace backup del save actual** y después importa.
- El save migrado guarda la **huella del bundle de origen**
  (`sourceFingerprint`): checksum `fnv1a64`, `appVersion`, `totalXP` y
  `lastDailyDate`. Si la huella coincide (`DUPLICATE_SOURCE`), el import se
  rechaza **incluso con reset**: reimportar el mismo bundle duplicaría créditos.
- Una cuarentena pendiente **no** bloquea un nuevo intento (todavía no es save).

### D5 — `odea_quiz_v1`: archivada indefinidamente

- Se archiva en `legacy.keys.quiz` con `lifecycle: "archived-legacy"`.
- **No se elimina** en v1 ni automáticamente en ninguna versión futura.
- Solo podría eliminarse con **decisión explícita del usuario** y verificando
  antes que **ya no alimenta ningún total**.
- Lo legacy **no se borra en silencio**: `reset + reimportar` tampoco la borra.

---

## 2. Principios innegociables

1. **Núcleo intacto**: misiones y lógica se trasladan; no se reinventan. Las
   misiones de ODEA 2 son las mismas de ODEA 1. Los «golpes» solo agrupan
   misiones existentes; eventos y contratos son modificadores.
2. **Capa visual barata**: el reskin neón/ciudad va por encima, sin tocar lógica.
3. **Sistemas nuevos caros**: solo en fases futuras y con aprobación explícita.

Esta fase **no** construye ciudad, Distrito IA, economía, reputación, secretos
ni endgame. Solo especifica y valida la migración de progreso.

---

## 3. Nombres y colisiones

| ODEA 1 | ODEA 2 v1 | Motivo |
|---|---|---|
| `save.rewards` | `core.gear` | En ODEA 1 **`rewards` es el arsenal/equipo**. El nombre `rewards` queda reservado en ODEA 2 para recompensas reales. |
| `save.canje` | `core.realRewards.canje` | Recompensas Reales. Evita reutilizar `rewards` y deja explícito el dominio. |
| `save.saveVersion` (=3) | `migratedFrom.saveVersion` | Es la versión del schema legacy, no la de ODEA 2. |
| `save.xpBreakdown`, `totalXP`, `campaignLevel`, `level`, `odeLevel` | `core.derived.*` | Son derivados. Se conservan como **snapshot/checksum**; ODEA 2 recalcula desde las fuentes. |
| `save.eventRL`, `save.farm` | `core.credits.eventRL` / `core.credits.farm` | Crédito permanente de sistemas retirados. Agrupados para que nunca se confundan con features vivas. |
| el objeto `save` completo | sección `core` | El bundle v1 **no tiene** `save` en la raíz: tiene `core` / `worlds` / `legacy`. |

---

## 4. Mapa campo por campo — 36/36 a `core`

Acciones: `mapped` (misma semántica, ubicación nueva), `renamed` (cambia el
nombre), `transformed` (cambia de forma/rol), `derived-snapshot` (derivado
guardado como checksum), `archived-legacy` (se preserva sin uso activo).
`CRÍTICO` = su pérdida ya costó progreso real (regresión corregida en v5.98).

| # | Campo ODEA 1 | Acción | Destino ODEA 2 v1 | Razón |
|---|---|---|---|---|
| 1 | `playerName` | mapped | `core.identity.playerName` | Identidad del jugador. |
| 2 | `completedMissions` | mapped | `core.progress.completedMissions` | Fuente de XP de campaña y de monedas (conteo). |
| 3 | `completedDaily` | mapped | `core.progress.completedDaily` | Fuente de XP diaria (× multiplicador de racha) y de monedas. |
| 4 | `completedWeekly` | mapped | `core.progress.completedWeekly` | Fuente de XP semanal y de monedas. |
| 5 | `completedJobs` | mapped | `core.progress.completedJobs` | Fuente de XP de noticias/empleo y de monedas. |
| 6 | `completedB2b` | mapped | `core.progress.completedB2b` | Crédito XP legacy del mundo B2B retirado. **No borrar**. |
| 7 | `completedPuente` | mapped | `core.progress.completedPuente` | Fuente de XP del Puente Global y de monedas. |
| 8 | `unlockedAch` | mapped | `core.progress.unlockedAch` | Fuente de XP de logros. |
| 9 | `startDate` | mapped | `core.identity.startDate` | Fecha de inicio del plan. |
| 10 | `lastDailyDate` | mapped | `core.identity.lastDailyDate` | Última misión diaria; **fija `referenceDate`**. |
| 11 | `streak` | mapped | `core.identity.streak` | Racha; multiplica el XP diario derivado. |
| 12 | `shieldWeek` | mapped | `core.identity.shieldWeek` | Semana ISO del escudo de racha. |
| 13 | `vida` | mapped | `core.vida` | Fuente de XP de vida (log, listas, bonus de equilibrio y sagas). |
| 14 | `capital` | mapped | `core.capital` | Fuente de XP de Capital/Inglés/IA y de monedas. |
| 15 | `gods` | mapped | `core.gods` | Fuente de XP de jefes y de monedas (50 por jefe). |
| 16 | `shop` | mapped | `core.shop` | `spent` es el libro de gastos; `owned`/`equipped` son equipo. |
| 17 | `sound` | mapped | `core.identity.sound` | Preferencia de sonido. |
| 18 | `reto` | mapped | `core.reto` | Reto diario. |
| 19 | `rewards` | **renamed** | `core.gear` | Arsenal/equipo. El nombre `rewards` se reserva para recompensas reales. |
| 20 | `planner` | mapped | `core.planner` | Plan personal (referencias `{f,id}`). |
| 21 | `diary` | mapped | `core.diary` | Fuente de XP del diario. |
| 22 | `activity` | mapped | `core.activity` | Actividad por fecha; historial de racha. |
| 23 | `freezers` | mapped | `core.identity.freezers` | Congeladores de racha (máx. 2). |
| 24 | `applications` | mapped | `core.progress.applications` | Fuentes de noticias que el jugador sigue. |
| 25 | `focus` | mapped | `core.focus` | Fuente de XP de enfoque (pomodoro). |
| 26 | `hunt` | mapped | `core.hunt` | La Cacería completa (22 subcampos). `hunt.log` es fuente de XP/monedas. |
| 27 | `saveVersion` | **transformed** | `migratedFrom.saveVersion` | Schema legacy; no se copia como schema de ODEA 2. |
| 28 | **`eventRL`** | mapped | `core.credits.eventRL` | **CRÍTICO.** Evento de entrevista retirado; su XP/monedas son crédito permanente. |
| 29 | **`farm`** | mapped | `core.credits.farm` | **CRÍTICO.** Quiz Farmeo retirado; su XP/monedas son crédito permanente. |
| 30 | **`canje`** | mapped | `core.realRewards.canje` | **CRÍTICO.** Recompensas Reales creadas/canjeadas por el usuario. |
| 31 | `xpBreakdown` | derived-snapshot | `core.derived.xpBreakdown` | Checksum de 10 componentes. ODEA 2 recalcula. |
| 32 | `totalXP` | derived-snapshot | `core.derived.totalXP` | Checksum de la suma. |
| 33 | `campaignLevel` | derived-snapshot | `core.derived.campaignLevel` | Nivel del plan (días completos + 1). |
| 34 | `level` | derived-snapshot | `core.derived.level` | Alias de compatibilidad de `campaignLevel`. |
| 35 | `odeLevel` | derived-snapshot | `core.derived.odeLevel` | Nivel global ODEA (escalera de 63). |
| 36 | `stats` | derived-snapshot | `core.stats` | `stats.domains` es derivado; se conserva como snapshot. |

> **Ningún campo puede desaparecer sin decisión.** Si un bundle trae campos
> extra, se preservan en `migration.unmapped.fields` (no se descartan).

---

## 5. Mapa clave por clave — 11/11 (`worlds` + `legacy`)

| # | Clave `localStorage` | Sección | Destino | Ciclo de vida | Razón |
|---|---|---|---|---|---|
| 1 | `odea_academia_v1` | `worlds` | `worlds.academia` | `active` | Academia; base del futuro Distrito IA (reskin). |
| 2 | `odea_jefe_v1` | `worlds` | `worlds.jefe` | `active` | Jefe semanal. |
| 3 | `odea_empleo_v2` | **`legacy`** | `legacy.keys.empleo` | `archived-legacy` | Marca escalar (=1) de migración ya consumida. |
| 4 | `odea_anomalia_v1` | `worlds` | `worlds.anomalia` | `active` | Anomalía diaria. |
| 5 | `odea_quiz_v1` | **`legacy`** | `legacy.keys.quiz` | `archived-legacy` | **LEGACY PERMANENTE.** Capa retirada de la UI en v5.99; no se elimina automáticamente nunca (D5). |
| 6 | `odea_tesoro_v1` | `worlds` | `worlds.tesoro` | `active` | Tesoro, rachas y sinergias. |
| 7 | `odea_sagas_v1` | `worlds` | `worlds.sagas` | `active` | **CRÍTICO para XP**: aporta a `vida` (kid/pow) y monedas. |
| 8 | `odea_events` | **`legacy`** | `legacy.keys.events` | `archived-log` | Log del bus (máx. 500). Auditoría, no estado. |
| 9 | `odea_garaje_v1` | `worlds` | `worlds.garaje` | `active` | Misiones de vehículo y km. |
| 10 | `odea_juice_v1` | `worlds` | `worlds.juice` | `active` | Preferencias de sonido/juice. |
| 11 | `odea_hub_v1` | `worlds` | `worlds.hub` | `active` | Recompensas pendientes de monedas. |

Cada entrada = `{ legacyKey, schemaVersion, lifecycle, reason, data }`.
Claves desconocidas se preservan en `migration.unmapped.keys`.

> `odea_sagas_v1` **no es opcional**: `vidaCompute()` le suma
> `sagaAreaXP("kid")` y `sagaAreaXP("pow")`, y `coinsEarned()` le suma
> `sagaCoinsEarned()`. Omitirla rompe la paridad de XP y monedas.

---

## 6. Estructura del bundle v1

```jsonc
{
  "_format": "odea2_bundle_v1",
  "schemaVersion": 1,
  "appVersion": "0.1.0-fase0",
  "migratedFrom":      { "format", "appVersion", "saveVersion", "migratedAt" },
  "sourceFingerprint": { "algorithm", "digest", "appVersion", "totalXP", "lastDailyDate" },
  "import":            { "state", "checksumOk", "reconciled", "report", "backup", … },
  "migration":         { "referenceDate", "decisions", "worlds", "unmapped", "importCheck" },
  "core":              { /* estado del núcleo */ },
  "worlds":            { /* 8 claves activas */ },
  "legacy":            { "keys": { /* 3 claves archivadas */ } }
}
```

Detalle completo en `SCHEMA_ODEA2_V1.md`.

---

## 7. Protocolo de importación

```
bundle odea_bundle_v2
   │
   ├─ 1. BACKUP intacto del origen            (siempre, antes de escribir)
   ├─ 2. Guardia de reimportación             (ALREADY_IMPORTED / DUPLICATE_SOURCE)
   ├─ 3. Migración pura → bundle v1 + reporte de totales
   │
   ├─ 4. Candado 1: reconciliación            ── falla ─→ ABORTED (no se escribe save)
   │
   └─ 5. Candado 2: checksum estructural      ── falla ─→ QUARANTINE (preview)
                                                              │
                                              ┌───────────────┴───────────────┐
                                              │                               │
                                        aceptar (explícito)             abortar
                                              │                               │
                                          ACTIVE                     se descarta el preview
```

- **`active`**: save utilizable. `loadOdea2` y `saveOdea2` lo exigen.
- **`quarantine`**: preview en `odea2_quarantine_v1`. No se puede cargar ni
  guardar como save. `acceptQuarantine()` lo pasa a `active` y registra
  `acceptedChecks`; **aceptar no repara**, deja constancia.
- **`aborted`**: no existe bundle guardado. El backup del origen sí queda.

### 7.1 Reporte de totales

En toda importación se genera:

```jsonc
{
  "totals": {
    "totalXP":     { "stored": 6915, "recomputed": 6915, "ok": true },
    "xpBreakdown": { "stored": { … }, "recomputed": { … }, "diffs": [], "ok": true },
    "shop":        { "spent": { "stored": 100, "recomputed": 100, "ok": true }, "coins": { … } }
  },
  "missing":    { "fields": [], "keys": [], "criticals": [] },
  "criticals":  { "eventRL": true, "farm": true, "canje": true }
}
```

### 7.2 Huella del origen

`sourceFingerprint = { algorithm: "fnv1a64", digest, appVersion, totalXP,
lastDailyDate }`. El digest es FNV-1a de 64 bits sobre el bundle canónico: **no
es criptográfico**, sirve para detectar el mismo bundle importado dos veces.
`appVersion`, `totalXP` y `lastDailyDate` permiten reconocerlo a ojo en el
reporte.

---

## 8. Derivación de XP (paridad exacta)

Réplica de `recomputeState()` v5.99:

```
career  = campaign + daily + weekly + jobs + b2b
          daily = round(Σ xp diarias completadas × streakMult(streak))
          b2b   = B2B_LEGACY_XP[completedB2b] + PUENTE_MISSIONS[completedPuente]
ach     = Σ xp de logros desbloqueados
vida    = vidaCompute().total
capital = Σ xp de capital.done + capital.eng + capital.ai
focus   = Σ focus.log[].xp
diary   = Σ diary.log[].xp
bosses  = Σ xp de core.gods (GOD + TITAN + VIDA bosses)
hunt    = Σ hunt.log[].xp
evento  = Σ eventRL.log[].xp        ← crédito permanente
farm    = farmCounted(farm.log) × 2  ← crédito permanente
totalXP = suma de los 10
```

`vidaCompute()` incluye:

- log `id|clave`: suma `VIDA_OBJ[id].xp` por categoría.
- hábitos `hab-*`: un día con ≥1 hábito de cada pilar (`cuerpo`, `mente`,
  `dinero`) suma `BALANCE_BONUS = 30`.
- listas `growth/kid/couple/pow/men/plan/orden`: suma `VIDA_OBJ`.
- `sagaAreaXP("kid")` y `sagaAreaXP("pow")` desde `worlds.sagas.data`.

`farm` (`FARM_XP_PER=2`, `FARM_PER_COIN=4`, `FARM_DAY_CAP=40`):

```
por día: min(Σ c del día, 40)
XP     = Σ min(día, 40) × 2
monedas= Σ floor(min(día, 40) / 4)
```

`campaignLevel = min(díasCompletos + 1, 57)`; `odeLevel` = nivel de la escalera
ODE (63 niveles, 120.000 XP máx.).

### 8.1 `referenceDate` (ver D3)

Prioridad: `options.referenceDate` → `core.identity.lastDailyDate` → fecha de
importación. La re-derivación y la carga usan **esa misma fecha**, de modo que
el resultado no cambia al pasar de semana. Efecto conocido: si se recalculara
con otra semana, el bonus semanal de sagas caería 75 XP; **se acepta el valor
recalculado, sin compensaciones**.

### 8.2 Catálogo estático

La paridad necesita los catálogos de juego de ODEA 1 (ids → XP). Se extraen con
`tools/extract-catalog.mjs` a `data/xp-catalog.json` (data de juego, **no**
progreso personal):

- campaña (74), diarias (168), semanales (8), empleo (30), B2B legacy, Puente.
- logros (58), capital/inglés/IA (101), vida (192), jefes (16), sagas (2),
  escalera ODE.

**El catálogo es obligatorio para importar**: sin él no se pueden reconciliar
los totales y la importación no es verificable (`NO_CATALOG`). En Fase 1 se
sustituye por el núcleo portado, con los mismos ids y XP.

---

## 9. Monedas (paridad exacta)

Réplica de `coinsEarned()` v5.99:

```
earned = |completedDaily| + |completedMissions| + |completedWeekly|
       + |completedJobs| + |completedB2b| + |completedPuente|
       + |vida.log| + |capital.done| + |capital.eng| + |capital.ai|
       + sagaCoinsEarned() + Σ hunt.log[].coins
       + Σ eventRL.log[].coins + farmCoinsEarned()
       + |gods| × 50

balance = max(0, earned − shop.spent)
```

`shop.spent` incluye compras de equipo, congeladores y **canjes de recompensas
reales**. Por eso `shop.spent` y `canje` se migran juntos.

---

## 10. Contrato de validación

`validateMigration(legacy, migrated, catalog, { referenceDate, requireBackup })`
devuelve `{ ok, state, accepted, checks, errors }` y **falla cerrado**.

| ID | Qué prueba |
|---|---|
| `FORMAT` | `_format === "odea2_bundle_v1"` y `schemaVersion === 1`. |
| `SECTIONS` | Existen `core` / `worlds` / `legacy` y **no** hay `save` en la raíz. |
| `FIELD_DECISIONS_COMPLETE` | 36/36 campos con decisión. |
| `FIELD_UNKNOWN_PRESERVED` | Campos extra preservados en `migration.unmapped.fields`. |
| `FIELD_VALUES_IDENTICAL` | Cada campo presente existe en `core.*` y es idéntico. |
| `KEY_DECISIONS_COMPLETE` | 11/11 claves con decisión. |
| `KEY_SECTION_ASSIGNMENT` | 8 activas en `worlds`, 3 archivadas en `legacy`. |
| `KEY_UNKNOWN_PRESERVED` | Claves extra preservadas. |
| `KEY_VALUES_IDENTICAL` | Cada clave mapeada es idéntica (y su `lifecycle`). |
| `CRITICAL_EVENTRL` / `CRITICAL_FARM` / `CRITICAL_CANJE` | Existen y sobreviven intactos. |
| `SHOP_SPENT` | `core.shop.spent` idéntico. |
| `XP_ORACLE_MATCHES_SOURCE` | El oráculo reproduce `xpBreakdown`/`totalXP` guardados. |
| `XP_COMPONENTS_IDENTICAL` | Los 10 componentes son idénticos antes/después. |
| `XP_TOTAL_IDENTICAL` | `totalXP` idéntico. |
| `XP_SNAPSHOT_PRESERVED` | El snapshot derivado se conserva tal cual. |
| `LEVELS_IDENTICAL` | `campaignLevel` y `odeLevel` recalculados coinciden. |
| `COINS_IDENTICAL` | `earned`, `spent` y `balance` idénticos. |
| `SOURCE_FINGERPRINT` | La huella registrada coincide con la del bundle de origen. |
| `IMPORT_STATE` | `state === "active"`, `reconciled === true` y todo check fallido está aceptado. |
| `BACKUP_RECORDED` | (si `requireBackup`) existe backup con clave y digest. |
| `NO_LOSS_PROJECTION` | La proyección legacy del bundle migrado es idéntica al original. |

**Carga (`loadOdea2`)**: exige `import.state === "active"`, recalcula el estado
derivado y, si no coincide con el snapshot, aborta con `XP_DRIFT`. Nunca
"corrige" totales en silencio.

---

## 11. Regresión que ya costó progreso (v5.98)

En ODEA 1, `eventRL`, `canje` y `farm` se guardaban pero **no se restauraban**
al cargar: cada recarga los vaciaba y se perdían XP, monedas y recompensas
reales. La migración convierte eso en tests obligatorios:

- **Sin `eventRL`** → falla `CRITICAL_EVENTRL`; como su XP no reconcilia, la
  importación **aborta**.
- **Sin `farm`** → falla `CRITICAL_FARM`; aborta por el mismo motivo.
- **Sin `canje`** → falla `CRITICAL_CANJE`. No afecta XP, así que los totales
  reconcilian: la importación va a **cuarentena**, no se pierde en silencio.

Estos casos están en `tests/migration.test.js` y **deben fallar** si el
validador deja de detectarlos.

---

## 12. Ida y vuelta y determinismo

- `migrateBundle(fixture, { migratedAt fijo })` es determinista: dos corridas
  producen objetos idénticos.
- Ciclo estable: `importar → cargar (recalcula) → guardar → cargar` deja el
  mismo estado (`core`, `worlds` y `legacy` idénticos).
- El bundle migrado no muta el original (todo se clona).
- La cuarentena no es un estado de juego: no se puede cargar ni guardar.

---

## 13. Legacy permanente

`legacy.keys.quiz` (y `empleo`, `events`) se archivan con su `data` intacta.

- **No se eliminan automáticamente** en ninguna versión (D5).
- `reset + reimportar` tampoco las borra: el bundle nuevo las trae del origen.
- Su eliminación futura requiere decisión explícita del usuario y verificar
  antes que no alimentan ningún total.

---

## 14. Manejo del archivo real

- El bundle real del usuario **no se copia, ni se commitea, ni se sube** a
  ningún repo. `.gitignore` bloquea `odea-progreso-*.json` y
  `*progreso-real*` (con excepción del fixture sintético).
- Con el fixture sintético se verifica estructura y se prueba el importador:
  36 campos, 11 claves, 8 + 3 secciones, XP 6.915 exacto, monedas 141/100/41,
  backup del origen idéntico.
- Lo que se commitea es `fixtures/odea-progreso-sintetico.json`: misma forma
  (36 + 11), valores falsos.

---

## 15. Criterios de aceptación de Fase 0

- [x] `MIGRATION_SPEC.md` con 36 campos + 11 claves, sección y razón por fila.
- [x] `SCHEMA_ODEA2_V1.md` con el schema borrador (`core`/`worlds`/`legacy`) y
      origen de cada campo.
- [x] Las cinco decisiones cerradas (D1–D5) documentadas e implementadas.
- [x] Fixture sintético con la forma exacta del bundle real.
- [x] Tests: no-pérdida, paridad de XP (10 componentes), `shop.spent`/`eventRL`/
      `farm`/`canje`, ida y vuelta, cuarentena, aborto, reimportación, huella y
      **tests negativos** de los tres críticos.
- [x] Validación local contra el bundle real: paridad exacta.
- [x] Sin UI, sin juego, sin misiones nuevas, sin deploy, sin merge a `main`.
