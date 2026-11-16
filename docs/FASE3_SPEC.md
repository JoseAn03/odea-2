# FASE3_SPEC — Fase 3: misiones jugables sobre la ciudad

**Estado:** revisión del orquestador **aprobada con precisiones** (2026-11-15) e
**implementación del Hub mergeada y publicada** (PRs #5 y #4 → `fase2-ciudad` →
`main`, 2026-11-16).
**Base:** rama `main` (`0.3.0-fase2`), publicada en GitHub Pages.
**Alcance de este documento:** contrato de datos, API de escritura, ruta del día
y cámara. El Hub ya implementa este contrato; Empleo y Vida lo reutilizan en la
Fase 4. Sin cambios de `APP_VERSION`, `schemaVersion` ni caché del SW.

Las decisiones F3-1, F3-2 y F3-3 ya están registradas en `RISK_LIST.md` §3.2.
Este documento las desarrolla; no las reabre. Las seis decisiones de §8 fueron
aprobadas el 2026-11-15 con las precisiones que se indican en cada sección.

---

## 1. Resumen de decisiones

| # | Punto | Decisión | Anclaje |
|---|---|---|---|
| 1 | Registro de completaciones | Sección **raíz aditiva `play`** con `version`, `completions` y `checkins`. Clave de idempotencia = `occurrenceKey` (`missionId` para únicas, `missionId@fecha` para diarias, `missionId@semanaISO` para semanales). | `src/shape.js:28` (`BUNDLE_SECTIONS` no se toca), `src/validate.js:58-68`, `src/derive.js:76-102` |
| 2 | Escritura | **Una sola** función de gameplay: `applyGameplayMutation(storage, catalog, mutation, opts)`. Backup → copia → validación fail-closed → escritura → re-lectura → resultado tipado. | `src/storage.js:80-86`, `:262-281`, `:283-287` |
| 3 | Ruta del día | **3 misiones** del catálogo `daily`, elegidas por la fecha: día de catálogo `(díasDesdeÉpoca mod 56) + 1`; se filtran las ya completadas. La ruta no se guarda. | `data/xp-catalog.json` (`daily`: 168 ids, 56 días × 3 slots) |
| 4 | Cámara | Snapshot **en memoria de sesión** (`{x, y, zoom}`) al abrir la hoja; restauración exacta al cerrarla. Nunca dentro del bundle ni en una clave UI persistente. | `js/app.js:112-145`, `js/city/engine.js:119-127`, `js/city/camera.js:51-59` |
| 5 | Racha | **Siempre derivada** de las fechas de actividad (`core.activity` migrada + `play`), con la racha migrada como línea base. Nunca un contador almacenado. | `src/derive.js:37-44`, `:249`, `src/derive.js:76-102` |
| 6 | Catálogo | `validateCatalog` **rechaza ids duplicados** (falla rápido). La clave de idempotencia no lleva prefijo de sistema; `system` es solo trazabilidad. | `data/xp-catalog.json` (623 ids, 0 colisiones), `src/derive.js:27` (clave semanal) |

Las seis preguntas de §8 quedaron **aprobadas por el orquestador el 2026-11-15**,
cuatro con precisiones que ya están incorporadas en §2.3.1, §2.4, §2.5, §2.7 y
§3.2. Este documento es la versión aprobada; la implementación del Hub no arranca
hasta la aprobación final del documento completo.

**Correcciones al prompt, verificadas contra el código:**

- `daily` tiene **168 misiones** (no es un dato aproximado): 56 días × 3 slots
  (`A/B/C`), cada id aparece una sola vez y pertenece a un único `day`
  (`1..56`). Ver §4.2.
- Las misiones `daily` **no son repetibles**: un mismo id no puede completarse
  en dos fechas distintas. La repetición real existe en `vida` (`kind: daily` y
  `kind: weekly`), no en `catalog.daily`. Ver §2.3.
- El catálogo no tiene colisiones de id entre mapas: **623 ids, 0 repetidos**
  (`campaign`, `daily`, `weekly`, `jobs`, `b2b`, `puente`, `vida`,
  `capital.done/eng/ai`).

---

## 2. Punto 1 — Registro aditivo de completaciones

### 2.1 Decisión

Se añade una sección **raíz** opcional:

```jsonc
"play": {
  "version": 1,
  "completions": {},
  "checkins": {}
}
```

No se usa `core` ni `worlds` porque esas dos secciones son propiedad de la
migración y el validador exige que sus valores sigan siendo idénticos al bundle
de ODEA 1 (`FIELD_VALUES_IDENTICAL` en `src/validate.js:107-115`;
`KEY_VALUES_IDENTICAL` en `src/validate.js:151-165`). Escribir gameplay ahí
rompería la paridad o mezclaría procedencia. Una sección raíz nueva no altera la
forma migrada (36 campos + 11 claves) y `validateMigration` la ignora: solo
comprueba que existan `core`, `worlds` y `legacy` y que no haya `save` en la raíz
(`src/validate.js:58-68`).

`BUNDLE_SECTIONS` **no** se amplía (`src/shape.js:28`). Si se agregara `play`
allí, `validateMigration` exigiría la sección en bundles viejos y rompería la
compatibilidad. Se exporta una constante separada:

```js
// src/shape.js (fase de implementación)
export const PLAY_SECTION = "play";
export const PLAY_VERSION = 1;
```

`schemaVersion` sigue en **1**: es un cambio aditivo, y la regla del repo dice
que los aditivos se documentan sin subir versión (`RISK_LIST.md` §4.1;
`SCHEMA_ODEA2_V1.md` §9). `appVersion` sigue en `0.3.0-fase2` en esta tarea.

### 2.2 Diff de schema

Bundle migrado **sin** `play` (válido, no se re-migra):

```jsonc
{
  "_format": "odea2_bundle_v1",
  "schemaVersion": 1,
  "appVersion": "0.3.0-fase2",
  "migratedFrom": { "format": "odea_bundle_v2", "appVersion": "5.99", "saveVersion": 3, "migratedAt": "." },
  "sourceFingerprint": { "algorithm": "fnv1a64", "digest": ".", "appVersion": "5.99", "totalXP": 6915, "lastDailyDate": "2026-11-10" },
  "migration": { "referenceDate": "2026-11-10", "decisions": [], "worlds": {}, "unmapped": { "fields": {}, "keys": {} } },
  "core": { /* 36 campos migrados */ },
  "worlds": { /* 8 claves activas */ },
  "legacy": { "keys": { /* 3 claves archivadas */ } }
}
```

Primera escritura de gameplay (la sección se inicializa perezosamente):

```jsonc
"play": {
  "version": 1,
  "completions": {
    "48A": {
      "missionId": "48A",
      "system": "hub",
      "date": "2026-11-10",
      "at": "2026-11-10T15:04:05.000Z"
    },
    "hab-gym@2026-11-11": {
      "missionId": "hab-gym",
      "system": "vida",
      "period": "2026-11-11",
      "date": "2026-11-11",
      "at": "2026-11-11T07:02:00.000Z"
    }
  },
  "checkins": {
    "2026-11-11": { "at": "2026-11-11T07:00:00.000Z" }
  }
}
```

| Campo | Tipo | Regla |
|---|---|---|
| `play.version` | number | `1`. Si falta o no es 1, la escritura se rechaza. |
| `play.completions` | object | Mapa `occurrenceKey → registro`. Sin duplicados por clave (el objeto ya lo garantiza). |
| `completions[k].missionId` | string | Id del catálogo. Debe existir en el mapa del sistema. |
| `completions[k].system` | string | `hub` \| `empleo` \| `vida` en Fase 3. |
| `completions[k].date` | string | Día local de la escritura, `YYYY-MM-DD`. |
| `completions[k].at` | string | Instante ISO 8601 UTC. |
| `completions[k].period` | string? | Solo si la misión es repetible: fecha local o semana ISO. |
| `play.checkins.<date>` | object | Un registro por día local: `{ at }`. Sin contador de racha (la racha se deriva, §2.7). |

**No se guarda XP ni monedas** en la completación: se derivan del catálogo en
cada lectura. Guardar el monto permitiría que el registro y la derivación
divergieran. **Tampoco se guarda la racha**: es una función pura de las fechas
(§2.7).

### 2.3 Clases de idempotencia

Definición:

```js
occurrenceKey =
  misión única      → missionId
  misión diaria     → `${missionId}@${date}`        // date = YYYY-MM-DD local
  misión semanal    → `${missionId}@${isoWeekKey(date)}` // reutiliza derive.js:27
```

Clasificación real del catálogo:

| Clase | Fuente | Cantidad | Clave | Por qué |
|---|---|---|---|---|
| Única | `campaign` | 74 | `missionId` | Cada id es una misión de campaña irrepetible. |
| Única | `daily` | 168 | `missionId` | 56 días × 3 slots; el id codifica día y slot. Ver corrección §3.1. |
| Única | `weekly` | 8 | `missionId` | Ocho misiones semanales fijas. |
| Única | `jobs` | 30 | `missionId` | Empleo: trabajos completados. |
| Única | `b2b` | 18 | `missionId` | Empleo: B2B. |
| Única | `puente` | 32 | `missionId` | Empleo: Puente. |
| Única | `vida` con `kind: "one"` | 83 | `missionId` | `vidaCompute` no las agrupa por clave (`src/derive.js:159-164`). |
| Diaria | `vida` con `kind: "daily"` | 49 | `missionId@date` | 12 `hab-*` + 37 (`kd-*`, `reto*`, …). `vidaCompute` cuenta cada entrada `id|clave` y agrupa hábitos por clave para el bonus de equilibrio (`src/derive.js:138-157`). |
| Semanal | `vida` con `kind: "weekly"` | 60 | `missionId@isoWeek` | Se repiten cada semana; la clave evita duplicar dentro de la misma semana. |

Total: 623 ids en catálogo; 413 únicos, 49 diarios y 60 semanales.

**Regla de oro:** si una misión no es de `vida`, su clave es el `missionId`.
Hoy ningún mapa fuera de `vida` tiene misiones repetibles.

**Check-in:** su clave es la fecha local (`play.checkins[YYYY-MM-DD]`). El día de
`core.identity.lastDailyDate` (2026-11-10 en el fixture) **ya está contado** en la
racha migrada, así que un check-in en esa fecha es `duplicate`; el primero que
suma es el día siguiente (§2.7).

### 2.3.1 Unicidad del catálogo (decisión cerrada, 2026-11-15)

Regla primaria: **el validador del catálogo rechaza ids de misión duplicados**.
`validateCatalog(catalog)` (nuevo, módulo `src/catalog.js`) recorre todos los
mapas (`campaign`, `daily`, `weekly`, `jobs`, `b2b`, `puente`, `vida`,
`capital.done/eng/ai`) y, si un id aparece dos veces, devuelve
`{ ok: false, code: "DUPLICATE_MISSION_ID", duplicates: [{ id, maps: [...] }] }`.
Se llama al arrancar y al entrar en `applyGameplayMutation`; un catálogo inválido
aborta la escritura con `BAD_CATALOG`. Falla rápido, con test propio.

Consecuencias:

- La `occurrenceKey` **no cambia**: `missionId` (únicas),
  `missionId@date` (diarias), `missionId@isoWeekKey(date)` (semanales).
- `completions[k].system` se conserva **solo como trazabilidad**; no forma parte
  de la clave. Dos sistemas con el mismo id serían un error de catálogo, no algo
  que la clave deba esconder.
- No se agregan prefijos de sistema silenciosos. Si un catálogo futuro necesitara
  repetir ids entre sistemas de forma legítima, será una **decisión nueva** del
  orquestador en ese momento.
- Verificación de hoy: **623 ids, 0 colisiones** (`campaign` 74, `daily` 168,
  `weekly` 8, `jobs` 30, `b2b` 18, `puente` 32, `vida` 192, `capital.done` 40,
  `capital.eng` 30, `capital.ai` 31).

### 2.4 Integración con la derivación

`derive()` **no se modifica**. El único cambio es en la normalización de
fuentes: `sourcesFromMigrated` (`src/derive.js:76-102`) fusiona `play` con las
fuentes migradas.

| Sistema | Destino de la fusión | Regla |
|---|---|---|
| `hub` | `progress.completedDaily` | Unión por id, sin duplicar. Alimenta XP diaria × racha (`derive.js:245-249`), monedas (`:280-289`) y `fullDaysCount` (`:210-221`). |
| `empleo` | `progress.completedJobs` | Unión por id. Alimenta `career` (`:251`) y monedas (`:281-282`). |
| `vida` | `vida.log` | Se agrega la cadena `${missionId}|${period || "once"}`. Dedupe por cadena exacta. Alimenta `vidaCompute` (`:130-171`) y monedas por longitud del log (`:283`). |

Consecuencias, todas derivadas y ninguna escrita a mano:

- **XP**: `career` y `vida` se recalculan con `derive()`; el snapshot
  `core.derived` se reescribe desde el resultado en cada mutación.
- **Monedas**: cada entrada nueva y única suma 1 moneda ganada, igual que una
  completación migrada (`derive.js:280-291`).
- **Campaña**: completar los 3 ids de un día hace que `fullDaysCount` cuente ese
  día y suba `campaignLevel` (`derive.js:210-221`, `:272-273`).
- **Arranque**: `loadOdea2` compara el snapshot guardado con la re-derivación y
  falla cerrado con `XP_DRIFT` si alguien editó `play` sin refrescar
  `core.derived` (`src/storage.js:230-248`).

La fusión **no toca** los arrays migrados: se leen, se unen en memoria y se
deriva. `core.progress.*`, `core.vida.*`, `worlds` y `legacy` quedan intactos.

**Ninguna fuente migrada se reescribe.** El gameplay solo escribe `play` y el
snapshot `core.derived` (que es caché derivada, verificada al cargar). En
particular, `core.identity.streak` y `core.identity.lastDailyDate` **no** se
tocan: la racha se deriva de las fechas y se expone en `core.derived`
(§2.7). `migration.referenceDate` sigue congelada (`src/storage.js:229`) y
`derive()` sigue usando el multiplicador de `src/derive.js:249` con el valor
derivado.

### 2.5 Impacto en `shape.js` y `validate.js`

- `shape.js`: solo constantes nuevas (`PLAY_SECTION`, `PLAY_VERSION`). No se
  toca `BUNDLE_SECTIONS`, `SAVE_FIELDS` ni `SIBLING_KEYS`.
- `validate.js`: `validateMigration` **no cambia** (misma firma, mismos `check`
  ids, mismo orden). `validatePlayState(draft, catalog, { previous })` corre
  **solo** en la ruta de escritura de gameplay y **no es un fork**: se compone de
  la validación base existente más una capa aditiva.

  **Composición exacta (sin duplicar comprobaciones):**

  1. **Base estructural compartida** — `validateBundleBase(draft, catalog)`,
     extraída de los checks 0 (`FORMAT` + `SECTIONS`) y 8 (`IMPORT_STATE`) de
     `validateMigration` (`src/validate.js:51-68`, `:265-281`). Es una extracción
     mecánica: `validateMigration` la llama en su lugar y sigue devolviendo los
     mismos checks con los mismos ids y mensajes. Un solo origen para la forma del
     bundle; los dos validadores no pueden desincronizarse.
  2. **Validación runtime existente del save ODEA 2** — `loadOdea2(draft, catalog)`
     (`src/storage.js:217-248`), que ya exige `_format`, `import.state ===
     "active"` y re-derivación sin `XP_DRIFT`. No se reimplementa el drift.
  3. **Capa aditiva** (`validatePlaySection(draft, catalog)`), solo sobre `play`:
     1. `play.version === 1` y `completions`/`checkins` son objetos planos.
     2. Cada registro tiene `missionId`, `system`, `date` y `at` válidos.
     3. `missionId` existe en el mapa del catálogo del sistema.
     4. `occurrenceKey` coincide con la clase calculada (única/diaria/semanal).
     5. No hay dos registros con el mismo `missionId` y la misma `period`.
     6. `core.derived` coincide con la re-derivación, incluidos `streak` y
        `streakDate` (§2.7).
  4. **Parte migrada intacta** — `migratedUnchanged(draft, previous)`: compara
     `core` (salvo `core.derived`), `worlds` y `legacy` contra el bundle persistido
     anterior. Es la única comprobación específica de gameplay que no existe en la
     base, porque `validateMigration` la hace contra el bundle de ODEA 1 y ese
     bundle no está disponible en una escritura.

  Los checks de paridad con el origen (`FIELD_VALUES_IDENTICAL`,
  `KEY_VALUES_IDENTICAL`, `NO_LOSS_PROJECTION`, `SOURCE_FINGERPRINT`) siguen
  siendo **exclusivos de `validateMigration`**: sin el bundle de ODEA 1 no se
  pueden evaluar, y `validatePlayState` no los finge.
- `core.derived` gana dos campos derivados: `streak` y `streakDate`. Los escribe
  el mismo refresco que ya escribe `xpBreakdown`/`totalXP` (`src/storage.js:250-257`),
  de modo que `loadOdea2` y toda mutación producen exactamente la misma forma. No
  es un contador de juego: es caché verificada en cada escritura y recalculada al
  cargar.
- Un bundle **sin** `play` sigue siendo válido: la fusión no aporta nada y los
  61 tests actuales no cambian.

### 2.6 Casos borde

| Caso | Comportamiento |
|---|---|
| Bundle migrado sin `play` | Válido. La sección se crea en la primera escritura. |
| `play` presente y vacío | Sin efecto en la derivación. |
| Completar dos veces la misma clave | `status: "duplicate"`, sin backup ni escritura. |
| `missionId` desconocido | `rejected` con `UNKNOWN_MISSION`; el save no cambia. |
| Sistema fuera de Fase 3 | `rejected` con `OUT_OF_SCOPE`. |
| Catálogo con ids duplicados | `validateCatalog` falla cerrado (`BAD_CATALOG` + `DUPLICATE_MISSION_ID`); no se escribe. |
| Primer día de juego en ODEA 2 sin hueco | La racha derivada **conserva** la base migrada (8 en el fixture); ver §2.7. |
| Primer día de juego con hueco real | La racha derivada reinicia a 1 (hueco > 1 día contra `lastDailyDate`). |
| Check-in el mismo día | `status: "duplicate"`; la racha no cambia (se deriva de fechas, no de contadores). |
| Bundle en cuarentena | `rejected` con `SAVE_NOT_ACTIVE`; la cuarentena no es save. |
| `play` corrupto detectado al arrancar | `loadOdea2` falla cerrado con `XP_DRIFT`. |

### 2.7 Racha derivada de las fechas (precisión aprobada, 2026-11-15)

**La racha nunca se guarda como contador.** Se calcula con una función pura,
`deriveStreak(bundle) → { streak, streakDate, baseline, baselineDate, days }`,
en `src/derive.js` junto a `streakMult` (`src/derive.js:37-44`). El código actual
no tiene ninguna lógica de racha: `STREAK_MIN_MISSIONS` (`src/derive.js:24`) está
declarada y **no se usa**. Lo único existente es el multiplicador.

Se usa en dos lugares y en ningún otro:

1. `sourcesFromMigrated` (`src/derive.js:76-102`) pone el valor derivado en
   `sources.identity.streak` **en memoria**. `derive()` y `streakMult` no se
   tocan: la XP diaria se multiplica con la racha real
   (`src/derive.js:245-249`).
2. El snapshot `core.derived.streak` / `core.derived.streakDate`, que es lo que
   muestra la UI. `core.identity.streak` queda como **valor migrado inmutable**
   (fixture: 8) y no se reescribe nunca.

**Fechas que cuentan como actividad** (unión, ordenadas):

| Fuente | Regla |
|---|---|
| `core.activity` migrada | Clave `YYYY-MM-DD` con `by.daily >= 1`. Fixture: `2026-11-05`, `2026-11-10`. |
| `play.completions` con `system: "hub"` | Su campo `date`. |
| `play.checkins` | Su clave `YYYY-MM-DD`. |

**Línea base de arranque** (decisión D3, `MIGRATION_SPEC.md` §D3):

- `baseline = core.identity.streak` (fixture: **8**).
- `baselineDate = core.identity.lastDailyDate` (fixture: **2026-11-10**), que es
  igual a `migration.referenceDate`.

**Algoritmo determinista:**

0. Si `play` no tiene completaciones de Hub ni check-ins → `streak = baseline`,
   `streakDate = baselineDate` (guarda de compatibilidad).
1. Construir `days` = fechas activas ordenadas.
2. `posteriores` = días estrictamente mayores que `baselineDate`.
3. Si `posteriores` está vacío → `streak = baseline` y `streakDate =
   baselineDate` (abrir la app no cambia nada, y el check-in del mismo día es
   `duplicate`).
4. Agrupar `posteriores` en cadenas de días consecutivos y tomar la **última**
   cadena, la que termina en `streakDate`.
5. Si esa última cadena empieza el día siguiente a `baselineDate` →
   `streak = baseline + longitud_de_la_cadena` (viene encadenada desde la base).
6. Si no → `streak = longitud_de_la_cadena` (hubo un hueco real: la racha se
   reinicia y cuenta solo la cadena nueva).
7. `streakDate` = máximo de `days`, o `baselineDate` si no hay posteriores.

**Regla de arranque (explícita):** el primer día de juego en ODEA 2 **no puede
reiniciar la racha migrada** salvo que exista un hueco real de fechas contra
`baselineDate`. Ejemplos con el fixture:

| Actividad en ODEA 2 | Racha derivada |
|---|---|
| Ninguna | **8** |
| `2026-11-10` (mismo día) | **8** (ya contado en la base; check-in `duplicate`) |
| `2026-11-11` | **9** |
| `2026-11-11` y `2026-11-12` | **10** |
| `2026-11-12` (sin el 11) | **1** (hueco real de un día) |
| `2026-11-20` | **1** |

**Compatibilidad con Fase 2 y con la migración:** si no hay actividad de Hub ni
check-ins en `play`, `deriveStreak` devuelve **la base sin más**
(`core.identity.streak`) y no mira fechas posteriores de `core.activity`. Es una
guarda explícita, no una consecuencia: así `validateMigration` (que llama a
`sourcesFromMigrated` sobre bundles sin `play`) y los 61 tests existentes derivan
exactamente igual, sin `XP_DRIFT` ni cambios de totales.

Los `freezers` y `shieldWeek` migrados **no se consumen** en Fase 3: quedan como
fuente intacta. Consumirlos sería una decisión nueva.

Consecuencia esperada y aceptada: como `streak` multiplica la XP diaria
(`src/derive.js:249`), una racha derivada más alta puede subir la XP diaria ya
existente, exactamente como en ODEA 1.

---

## 3. Punto 2 — Función única de mutación

### 3.1 Firma exacta

```js
// src/storage.js
export function applyGameplayMutation(storage, catalog, mutation, opts = {}) {
  // opts: { at?: string, date?: string }
  // returns: GameplayResult
}
```

```ts
type GameplayMutation =
  | { type: "mission.complete"; system: "hub" | "empleo" | "vida"; missionId: string; date?: string }
  | { type: "hub.checkin"; date?: string };

type GameplayResult = {
  status: "applied" | "duplicate" | "rejected";
  bundle: object;                 // aplicado: nuevo save; duplicate/rejected: save actual intacto
  backup: { key: string; digest: string; createdAt: string; kind: "save" } | null;
  changed: string[];              // rutas tocadas; [] en duplicate/rejected
  error: { code: string; message: string; detail?: object } | null;
};
```

- `storage` y `catalog` faltantes son error de programador: `TypeError`.
- `opts.at` (ISO) y `opts.date` (`YYYY-MM-DD`) existen para tests
  deterministas. En producción se calculan una sola vez al entrar:
  `at = new Date().toISOString()` y `date = localDateKey(new Date())`
  (componentes locales, **no** `toISOString().slice(0,10)`, para no cruzar de día
  por UTC).
- La mutación es un **descriptor puro**. El reducer vive en un módulo nuevo,
  `src/gameplay.js`, sin acceso a storage ni a DOM:
  `applyMutation(draft, mutation, catalog, { at, date }) →
  { changed: boolean, paths: string[], reason?: string }`. Si la mutación trae
  `date`, gana sobre `opts.date`; si ninguna lo trae, se usa el día local.

### 3.2 Flujo obligatorio, paso a paso

0. **Validar el catálogo** con `validateCatalog(catalog)` (§2.3.1). Si hay ids
   duplicados → `BAD_CATALOG`, sin leer ni escribir nada.
1. **Leer** `rawBefore = storage.getItem(STORAGE_KEYS.bundle)`
   (`STORAGE_KEYS.bundle` = `odea2_bundle_v1`, `src/storage.js:25-29`).
2. **Parsear y exigir save activo** (`import.state === "active"`). Si no hay
   save → `NO_SAVE`; si es cuarentena → `SAVE_NOT_ACTIVE`
   (`src/storage.js:265-272`).
3. **Cortocircuito de idempotencia**: calcular la `occurrenceKey` (o la fecha del
   check-in) y consultar `play.completions`/`play.checkins` **antes de cualquier
   backup**. Si ya existe → `status: "duplicate"`, sin backup, sin copia y sin
   escritura.
4. **Backup del save actual**: `backupBundle(bundle, storage, { at, kind: "save" })`
   (`src/storage.js:80-86`), que rota a los últimos 3
   (`SAVE_BACKUP_RETENTION`, `src/storage.js:49`, `:56-70`). Los backups
   `kind: "source"` de la migración no se tocan. Dos condiciones fijas:
   - **(a) Contenido exacto:** el backup es el bundle persistido actual, previo a
     la mutación, **byte a byte**. Se verifica leyendo la clave recién creada y
     comparando con `rawBefore` (`storage.getItem(backupKey) === rawBefore`). Si no
     coincide → `BACKUP_MISMATCH` y **no se escribe**.
   - **(b) Fail-closed del backup:** si `backupBundle` lanza o no deja una clave
     legible → `BACKUP_FAILED` y **no se escribe**. La mutación no procede sin
     respaldo verificado.
5. **Copiar**: `draft = JSON.parse(JSON.stringify(bundle))`. La mutación nunca
   toca el objeto leído.
6. **Aplicar** `applyMutation(draft, mutation, catalog, { at, date })`:
   inicializa `play` si falta, valida la existencia de la misión y su clase,
   registra la completación o el check-in, y devuelve `changed`.
7. **Refrescar el snapshot derivado**: recalcular con
   `derive(sourcesFromMigrated(draft), catalog, draft.migration.referenceDate)`
   y escribir `draft.core.derived` con la misma forma que
   `src/storage.js:250-257`, más `streak` y `streakDate` (§2.7). No se edita
   ningún total a mano.
8. **Validar fail-closed** con `validatePlayState(draft, catalog, { previous: bundle })`
   (§2.5: base compartida + `loadOdea2` + capa aditiva). Si falla: descartar
   `draft`, devolver `rejected` con `SCHEMA_INVALID`, `DERIVE_DRIFT` o
   `IMMUTABLE_CHANGED`, y **no escribir**. El backup del paso 4 ya existe y es el
   save anterior exacto; el save persistido no cambió.
9. **Verificar concurrencia (CAS)**: releer
   `rawNow = storage.getItem(STORAGE_KEYS.bundle)` y comparar con `rawBefore`.
   Si difiere, otra pestaña escribió entre medio →
   `rejected` con `CONCURRENT_CHANGE`, sin escritura. El listener de Fase 2
   (`js/storage-watch.js`) refresca la UI con el estado remoto.
10. **Escribir** `storage.setItem(STORAGE_KEYS.bundle, JSON.stringify(draft))`.
11. **Releer y verificar**: `rawAfter = storage.getItem(...)`. Si
    `rawAfter === serialized`, OK. Si no, parsear y comparar con `deepEqual`
    (`src/shape.js:120-122`); si tampoco coincide →
    `WRITE_VERIFY_FAILED` y **rollback** con
    `storage.setItem(STORAGE_KEYS.bundle, rawBefore)`.
12. **Devolver** `status: "applied"` con `bundle: draft`, `backup` y `changed`.

**Orden del backup (aprobado por el orquestador, 2026-11-15):** el respaldo se
crea después de validar la copia y antes de tocar la clave persistida. La copia
del paso 5 es solo memoria; el save todavía no se mutó. Así una escritura inválida
no rota los 3 backups con copias idénticas del mismo save. El requisito «backup
antes de cada mutación» se cumple sobre la mutación **persistida**, que es la única
que puede dañar el progreso. Condiciones fijas: (a) el respaldo es el bundle
persistido actual exacto, verificado byte a byte contra `rawBefore`; (b) si el
backup falla, la escritura no procede (`BACKUP_FAILED`/`BACKUP_MISMATCH`).

### 3.3 Errores tipados

| Código | Cuándo | ¿Escribe? |
|---|---|---|
| `NO_SAVE` | No hay `odea2_bundle_v1`. | No |
| `SAVE_NOT_ACTIVE` | El save está en cuarentena/abortado. | No |
| `BAD_BUNDLE` | Formato o `schemaVersion` inválidos. | No |
| `UNKNOWN_MUTATION` | `type` no reconocido. | No |
| `UNKNOWN_MISSION` | `missionId` no existe en el mapa del sistema. | No |
| `OUT_OF_SCOPE` | Sistema fuera de `hub`/`empleo`/`vida`. | No |
| `BAD_DATE` | `at`/`date` inválidos o inconsistentes. | No |
| `BAD_CATALOG` | `validateCatalog` encontró ids duplicados (`DUPLICATE_MISSION_ID`). | No |
| `BACKUP_FAILED` | El backup no se pudo crear o no quedó legible. | No |
| `BACKUP_MISMATCH` | El backup no coincide byte a byte con el save previo. | No |
| `SCHEMA_INVALID` | `play` o el bundle no pasan `validatePlayState`. | No |
| `DERIVE_DRIFT` | La re-derivación no coincide con el snapshot refrescado. | No |
| `IMMUTABLE_CHANGED` | La mutación tocó `core` (salvo `derived`), `worlds` o `legacy`. | No |
| `CONCURRENT_CHANGE` | Otra pestaña escribió entre la lectura y el CAS. | No |
| `QUOTA_EXCEEDED` | `localStorage` lanza por cuota. | No (se verifica) |
| `WRITE_VERIFY_FAILED` | La re-lectura no coincide con lo escrito. | Rollback |

`QUOTA_EXCEEDED`: se captura el error del `setItem` (nombre
`QuotaExceededError`, códigos 22/1014 en navegadores viejos), se relee la clave
y, si por alguna razón cambió, se hace el mismo rollback del paso 11. Se
devuelve `rejected`; la UI muestra el aviso y el save anterior queda intacto.

### 3.4 Multi-pestaña sin locks

No se usan locks. La escritura es síncrona dentro de un turno de JS, así que dos
pestañas no pueden intercalarse **dentro** de una misma pestaña. El único riesgo
es que otra pestaña escriba entre la lectura (paso 1) y el CAS (paso 9). La regla
es **compare-and-swap sobre el string crudo**:

- Si `rawNow !== rawBefore` → `CONCURRENT_CHANGE`, no se escribe y la UI se
  refresca con el save remoto.
- Si coincide → se escribe; la otra pestaña recibirá el evento `storage` y el
  listener de Fase 2 hará `refresh()` (`js/storage-watch.js`).
- No se agregan bloqueos distribuidos ni `BroadcastChannel`.

### 3.5 Cumplimiento verificable: nadie más escribe el save

Test nuevo (fase de implementación), `tests/fase3-write-path.test.js`:

1. Recorre `js/**/*.js` y `src/**/*.js`.
2. Falla si algún archivo **fuera de `src/storage.js`** usa
   `STORAGE_KEYS.bundle` o accede a `localStorage` con el literal
   `"odea2_bundle_v1"`.
3. Falla si algún archivo fuera de `src/storage.js` llama a
   `setItem`/`removeItem` con la clave del save.
4. `src/shape.js` puede contener el literal `"odea2_bundle_v1"` como constante
   de formato (`ODEA2_BUNDLE_FORMAT`), pero no puede usarlo como clave de
   storage.
5. `js/browser-storage.js` solo puede tocar la sonda `__odea2_probe__`, nunca
   la clave del save.

Se puede exponer como script `npm run check:write-path` y ejecutarse en CI junto
a `npm test`. Es un grep determinista, sin dependencias.

---

## 4. Punto 3 — La «ruta del día» del Hub

### 4.1 Regla cerrada y determinista

```js
// fecha local del dispositivo
const dayKey = localDateKey(now);                     // "YYYY-MM-DD"
const epochDay = Math.floor(Date.UTC(y, m - 1, d) / 86400000);
const catalogDay = (epochDay % 56) + 1;               // 1..56, sin depender de la hora
const route = Object.entries(catalog.daily)
  .filter(([, m]) => m.day === catalogDay)
  .sort(([a], [b]) => a.localeCompare(b))             // A, B, C
  .map(([id]) => id)
  .filter((id) => !isCompleted(id));                  // play + completedDaily migrado
```

- **Tamaño:** 3 misiones (el catálogo tiene exactamente 3 por día). Si el pool
  elegible tuviera menos, la ruta usa `min(3, disponibles)`.
- **Rotación:** el índice avanza un día de catálogo por día calendario; recorre
  los 56 días (168 misiones) antes de repetir cualquier día. No se repite una
  misión ya completada: el filtro la excluye en la siguiente vuelta.
- **Persistencia:** **ninguna**. La ruta se deriva de la fecha y del catálogo.
  Lo único que se guarda son las completaciones (`play.completions`).
- **Mismo día, misma ruta:** sí, para cualquier save; no depende del progreso.
- **Agotamiento:** cuando las 168 misiones están completadas, la ruta queda
  vacía y el Hub muestra «Programa diario completo». No se reciclan misiones.

### 4.2 Por qué esta regla

El catálogo no es un pool plano de misiones diarias: es un programa de **56
días × 3 slots** (`data/xp-catalog.json`; verificado: 168 ids, `day` 1..56,
`slot` A/B/C, 56 de cada slot). Usar el día de calendario como índice respeta
esa estructura, da una ruta estable por día y garantiza que las 168 misiones se
vean una vez antes de ciclar. `fullDaysCount` ya cuenta un día completo cuando
están sus 3 ids (`src/derive.js:210-221`), así que la ruta y el nivel de campaña
hablan el mismo idioma.

**Sin compuerta secuencial (decisión aprobada, 2026-11-15).** La ruta no exige
haber completado el día anterior. Es la misma semántica de ODEA 1: el nivel se
deriva del **conteo** de días completos (`fullDaysCount`), no de una secuencia
obligada. Completar el día 48 sin el 3 suma, y el salto visible es correcto. No se
agrega ninguna condición de progreso al cálculo de la ruta.

### 4.3 Ejemplo trabajado (fixture, 2026-11-10)

- `2026-11-10` → epoch day `20767`; `20767 mod 56 = 47` → día de catálogo **48**.
- Ruta: **`48A`, `48B`, `48C`** (60 + 140 + 50 = **250 XP base**).
- El fixture tiene `streak = 8` → `streakMult(8) = 1.25`
  (`src/derive.js:37-44`), así que la XP diaria derivada de esa ruta es
  `round(250 × 1.25) = 313` si es el único delta diario.
- El fixture ya completó `1A..2C`, no `48A..48C`: la ruta aparece completa.
- Check-in del `2026-11-10`: **duplicado** (el fixture ya tiene
  `lastDailyDate = 2026-11-10`). El primero real es el `2026-11-11` →
  `streak = 9`.

### 4.4 Casos borde

| Caso | Comportamiento |
|---|---|
| Día de catálogo ya completado | Ruta vacía ese día; el Hub muestra «Ruta de hoy completada». No se rellena con otro día. |
| Misión completada desde la migración | Se filtra; no se vuelve a ofrecer ni se duplica. |
| Después de 56 días | El día se repite, pero solo aparecen las misiones pendientes de ese trío. |
| Las 168 completadas | Ruta vacía y «Programa diario completo». |
| Reloj del dispositivo cambiado | Puede mostrar otro día; la idempotencia por `missionId` impide doble crédito. Es un juego local, sin hora de servidor. |

---

## 5. Punto 4 — Cámara: guardar y restaurar

### 5.1 Máquina de estados

```
ciudad ──tap/chip──▶ hoja (cámara enfocada) ──expandir──▶ misiones
  ▲                        │                                │
  └──── cerrar hoja ◀──────┴──────── cerrar misiones ◀──────┘
        (restaura vista)          (no toca la cámara)
```

- **Abrir hoja** (`openDistrict`, `js/app.js:112-136`): si no había hoja
  abierta, capturar `{ x, y, zoom }` **antes** de `city.focusDistrict(id)`
  (`js/city/engine.js:119-127`). Si ya había hoja, **no** se sobrescribe el
  snapshot: cambiar de distrito mantiene la vista original de la sesión.
- **Expandir a misiones:** no toca la cámara. La ciudad queda visible y atenuada
  detrás (clase de body + backdrop existente, sin reemplazar el canvas).
- **Cerrar misiones:** vuelve a la hoja; cámara intacta.
- **Cerrar hoja** (`closeSheet`, `js/app.js:138-145`): restaurar el snapshot con
  `city.setView(view, { instant: true })`, limpiar la selección y descartar el
  snapshot.
- **Centrar en el mapa** (acción de la hoja): puede mover la cámara, pero el
  snapshot de sesión no cambia; al cerrar se vuelve a la vista previa a la
  apertura.

### 5.2 Dónde vive el estado

**En memoria de sesión**, en `js/app.js` (módulo), no en el bundle y no en una
clave UI persistente:

```js
let mapViewSession = null; // { view: { x, y, zoom }, districtId: string }
```

Justificación:

- El estado de cámara no es progreso. No puede viajar en `odea2_bundle_v1` ni
  ser validado por `src/validate.js`.
- Persistirlo en `localStorage` (`odea2_ui_v1`) crearía una segunda ruta de
  escritura, sincronización multi-pestaña y un modo de fallo nuevo, a cambio de
  nada: al recargar, la vista por defecto es igual de válida.
- Su pérdida (recarga, cierre de pestaña) es inofensiva por diseño.

### 5.3 API de cámara

Se agregan dos métodos a `createCityView` (`js/city/engine.js`), sin exponer
`camera.state` mutable:

```js
getView() {
  return { x: camera.state.x, y: camera.state.y, zoom: camera.state.zoom };
}

setView(view, { instant = true } = {}) {
  camera.jumpTo(view.x, view.y, view.zoom);
  if (instant) camera.update(10);
  drawNow();
}
```

`camera.jumpTo` ya fija `state` y `target` y aplica los límites de
`clampPosition` (`js/city/camera.js:24-36`, `:51-59`). Como el snapshot se tomó
de un estado ya limitado, la restauración es exacta.

### 5.4 Recarga con una hoja abierta

**Decisión:** al recargar se vuelve a la **vista por defecto** (monumento),
sin hoja y sin selección.

Motivos: la hoja no se restaura tampoco; restaurar solo la cámara dejaría un
estado a medias; y la vista por defecto es la que ya inicializa
`engine.resize()` (`js/city/engine.js:45-48`). No se persiste nada.

### 5.5 Casos borde

| Caso | Comportamiento |
|---|---|
| Cambiar de distrito con la hoja abierta | Se conserva el snapshot original; al cerrar se vuelve a la vista previa a la primera apertura. |
| «Centrar en el mapa» | Mueve la cámara; el snapshot no cambia. |
| Redimensionar/rotar con la hoja abierta | `setView` re-aplica los límites al viewport nuevo; se restaura lo más cercano posible. |
| Otra pestaña escribe el save | El listener de Fase 2 cierra la hoja → se restaura la vista y luego se refresca el estado. |
| Recarga | Vista por defecto, sin hoja. |
| Pérdida del snapshot | La ciudad sigue funcionando; solo se pierde la restauración exacta. |

---

## 6. Plan de tests de la fase de implementación

Todos son nuevos; no se modifican expectativas de Fase 0/1/2. Los tests **1–20**
son el mínimo aprobado por el orquestador; **21–25** cubren las precisiones de su
revisión del 2026-11-15 y también son obligatorios.

1. **`play` perezoso** — un bundle migrado sin `play` es válido; la primera
   escritura crea `play.version = 1` sin re-migrar.
2. **Forma migrada intacta** — tras una completación, `core` (salvo
   `core.derived`), `worlds` y `legacy` quedan byte a byte iguales al bundle
   anterior. `core.identity.streak` y `core.identity.lastDailyDate` conservan el
   valor migrado.
3. **Ida y vuelta Hub** — completar `48A` guarda, relee y la derivación coincide
   con `core.derived`; `totalXP` sube lo que dicta `derive()`.
4. **Idempotencia** — la segunda completación de `48A` devuelve `duplicate`, no
   crea backup, no cambia bytes y no suma XP ni monedas.
5. **Vida diaria** — `hab-gym` el mismo día es `duplicate`; al día siguiente se
   aplica como nueva ocurrencia.
6. **Vida única/semanal** — una misión `kind: "one"` es única para siempre; una
   `kind: "weekly"` se repite solo al cambiar de semana ISO.
7. **Check-in** — mismo día es `duplicate`; día siguiente sube la racha derivada;
   un hueco la reinicia a 1; `core.identity.streak`/`lastDailyDate` **no** cambian
   y `core.derived.streak` sí.
8. **Misión desconocida** — `UNKNOWN_MISSION`, save byte a byte idéntico, sin
   backup nuevo.
9. **Fail-closed de schema** — un `play` inyectado inválido devuelve
   `SCHEMA_INVALID` y no escribe.
10. **Fail-closed de derivación** — un `draft` con `core.derived` inconsistente
    devuelve `DERIVE_DRIFT` y no escribe.
11. **Arranque tras escribir** — `loadOdea2` no reporta `XP_DRIFT` después de
    una mutación válida.
12. **Edición manual** — si se altera `play` sin refrescar `core.derived`,
    `loadOdea2` falla cerrado con `XP_DRIFT`.
13. **Rotación de backups** — cuatro escrituras dejan 3 backups `kind: "save"`
    y ningún backup `kind: "source"` se borra.
14. **Re-lectura distinta** — un storage simulado que devuelve otro valor tras
    `setItem` produce `WRITE_VERIFY_FAILED` y rollback al `rawBefore`.
15. **Cuota** — un `setItem` que lanza `QuotaExceededError` produce
    `QUOTA_EXCEEDED`, save intacto.
16. **Concurrencia** — una escritura externa entre lectura y CAS produce
    `CONCURRENT_CHANGE`; la escritura externa se conserva.
17. **Ruta determinista** — misma fecha = mismos ids; `2026-11-10` →
    `48A/48B/48C`; completadas se filtran; día 57 vuelve al 1; todo completado
    deja la ruta vacía.
18. **Cámara** — `getView` → `focusDistrict` → `setView` restaura exactamente;
    cerrar la hoja restaura; cambiar de distrito conserva el snapshot original;
    recargar usa la vista por defecto.
19. **Ruta única de escritura** — el grep de §3.5 falla si otro módulo toca la
    clave del save.
20. **Sin regresiones** — los 61 tests existentes siguen verdes sin cambios.
21. **Racha de arranque** — con el fixture (`streak` 8, `lastDailyDate`
    2026-11-10): sin actividad → 8; mismo día → 8; `2026-11-11` → 9;
    `2026-11-11`+`12` → 10; `2026-11-12` solo → 1; `2026-11-20` → 1.
22. **Racha siempre derivada** — borrar/alterar `core.derived.streak` no cambia
    la racha calculada; `core.identity.streak` nunca se escribe; el multiplicador
    de XP usa el valor derivado.
23. **Catálogo duplicado** — un catálogo con un id repetido entre dos mapas es
    rechazado por `validateCatalog` (`DUPLICATE_MISSION_ID`) y
    `applyGameplayMutation` devuelve `BAD_CATALOG` sin escribir.
24. **Backup exacto y fail-closed** — el backup `kind: "save"` es byte a byte
    igual al save previo; si `setItem` del backup falla, la escritura no procede
    (`BACKUP_FAILED`) y el save queda intacto; si el contenido no coincide,
    `BACKUP_MISMATCH` sin escritura.
25. **Base compartida de validación** — tras extraer `validateBundleBase`, la
    suite de 61 tests sigue verde y `validateMigration` conserva sus `check` ids y
    mensajes; `validatePlayState` usa esa misma base (no duplica
    `FORMAT`/`SECTIONS`/`IMPORT_STATE`).

---

## 7. Fuera de alcance

- Implementar gameplay, misiones, pantallas o la vista de misiones.
- Tocar la UI de la ciudad o la hoja más allá de lo que exige el Punto 4.
- Cambiar migración o validación de bundles existentes (incluida cualquier
  modificación de `validateMigration` más allá de la extracción mecánica de
  `validateBundleBase`, que debe dejar sus `check` ids intactos).
- Consumir `freezers`/`shieldWeek` o cambiar el valor migrado de
  `core.identity.streak`/`lastDailyDate`.
- Cualquier prefijo de sistema en la clave de idempotencia o relajación de la
  unicidad del catálogo.
- Subir `APP_VERSION` (`0.3.0-fase2`), `schemaVersion` (1) o el caché del SW
  (`odea2-v0.3.0-fase2`).
  > **Superado (2026-11-16).** Esta restricción aplicaba solo a la tarea de
  > implementación, para no numerar un release antes de aprobarlo. Una vez
  > mergeada y publicada, el release se numeró como `0.4.0-fase3` en
  > `js/version.js`, `src/shape.js`, `package.json` y `sw.js` (incluye el bump
  > obligatorio de `CACHE_VERSION`).
- Empleo/Vida más allá del contrato de escritura: el contenido de sus misiones
  se define en la tarea de implementación.
- Pages, merge o PR de Fase 2.

---

## 8. Decisiones aprobadas por el orquestador (2026-11-15)

Las seis preguntas de la revisión quedaron **aprobadas**. Cuatro traen
precisiones que ya están incorporadas en el cuerpo de la spec.

| # | Tema | Estado | Precisión incorporada |
|---|---|---|---|
| 1 | Regla de racha | Aprobada con precisión | La racha se **deriva siempre de las fechas**, nunca es un contador almacenado. La racha migrada es la línea base: el primer día de ODEA 2 no la reinicia salvo hueco real contra `lastDailyDate` (§2.7). |
| 2 | Salto de `campaignLevel` | Aprobada | Es la semántica de ODEA 1: el nivel se deriva de `fullDaysCount`, no de una secuencia obligada. **No** se agrega compuerta secuencial (§4.2). |
| 3 | Reloj local | Aprobada | PWA local sin servidor. Riesgo aceptado: el usuario puede cambiar el reloj de su dispositivo; es su juego personal y no hay integridad competitiva en juego. |
| 4 | Orden del backup | Aprobada (versión de la spec) | Backup tras validar la copia y antes de escribir la clave. Condiciones fijas: (a) contenido = bundle persistido actual exacto, byte a byte; (b) si el backup falla, la escritura no procede (§3.2). |
| 5 | `validatePlayState` nuevo | Aprobada con precisión | No es un fork: llama a la validación base existente y valida encima solo la sección aditiva. La base sale de extraer `FORMAT`/`SECTIONS`/`IMPORT_STATE` de `validateMigration` y de reutilizar `loadOdea2`; la migración queda intacta (§2.5). |
| 6 | Unicidad de ids | Aprobada con decisión cerrada | El validador de catálogo **rechaza ids duplicados** (falla rápido, con test). La clave de idempotencia no cambia y `system` es solo trazabilidad. Sin prefijos silenciosos; repetir ids entre sistemas sería una decisión nueva (§2.3.1). |

También quedan aprobados:

- **`npm run check:write-path`** tal cual: garantía automática de la ruta única de
  escritura (§3.5).
- **Los 20 tests del §6** como mínimo de la fase de implementación, verificables
  uno a uno. Se suman los tests 21–25 que cubren las precisiones de esta revisión.

### 8.1 Riesgos aceptados (no bloquean la implementación)

1. **Reloj local.** Cambiar la fecha del dispositivo puede adelantar o atrasar la
   ruta y la racha. La idempotencia impide doble crédito, no el cambio de día
   artificial. Aceptado para un juego personal sin servidor (decisión 3).
2. **Salto de nivel.** Completar el día 48 sin los anteriores sube `campaignLevel`
   por conteo de días completos. Coherente con ODEA 1 (decisión 2).
3. **Racha y XP diaria.** Una racha derivada más alta multiplica la XP diaria ya
   existente (`src/derive.js:249`), igual que en ODEA 1. Efecto conocido.
4. **Backup tras validación.** Si el proceso muere entre el backup y la escritura,
   queda un backup idéntico al save vigente; no hay pérdida ni corrupción.

### 8.2 Condición de arranque de la implementación

La implementación del Hub **no arranca** hasta que el orquestador apruebe este
documento completo. Este PR queda en borrador para esa revisión.

### 8.3 Decisiones del orquestador (2026-11-16) — catálogos de dominios

Cierran las últimas preguntas de catálogo. **No reabren ninguna decisión anterior.**

| # | Tema | Decisión |
|---|---|---|
| C1 | Academia y XP | **Sin XP.** El catálogo fuente no define XP por misión y así queda en ODEA 2: `xp: 0`. No se inventan valores. |
| C2 | Garaje: recompensa y periodicidad | Recompensa = sinergia del Tesoro. Periodicidad = el **intervalo propio de cada misión**, no diaria ni semanal fija. |
| C3 | El Mercado | Es la tienda del núcleo (`SHOP_ITEMS`). La tienda cosmética del Tesoro queda como **segunda sección** del mismo distrito. Los dos catálogos se extraen por separado: no se fusionan ni se re-precian. |
| C4 | Jefes y cartas | **Solo lectura** en Fase 3. **No** se asignan ids posicionales. Se documentan por nombre. |
| C5 | Prueba en teléfono | Tarea del usuario, no del implementador. **No bloquea** este documento: la verificación se hace contra la build resultante. |

---

## 9. Catálogos de los dominios restantes

Todo lo de esta sección sale de las fuentes de ODEA 1 (`ebb0fce`, v6.00) y fue
verificado contra el código antes de escribirse. Nada se infiere.

> **Nota de estado (2026-11-16).** Estas decisiones aplican a los dominios que
> faltan. El Hub, Empleo, Vida, La Torre y Sagas ya están implementados y
> publicados (`0.12.0-fase3`), con R1 —recompensa congelada— activo. La
> condición de arranque del §8.2 es histórica para el Hub.

### 9.1 Academia — Distrito IA

**Catálogo.** `assets/odea-academia.js` · `RUTAS`: **6 rutas, 29 pasos**.
De esos 29, **28 son misiones reales** y **1 es un paso narrativo** con
`meta: true`, que la propia fuente excluye de `REAL_MISIONES`. El denominador del
porcentaje sigue siendo 29 (`n = min(28, count)`, y 28 ⇒ 29).

**Recompensa.**

| Concepto | Valor | Fuente |
|---|---|---|
| XP por misión | **0** | El catálogo no tiene campo de XP |
| Sinergia del Tesoro | **+3 monedas**, máximo **3 al día** | `odea-tesoro.js` · `onAcademiaMision()` |
| Clave del contador | `academia:YYYY-MM-DD` | `sinergias` del Tesoro |
| Registro de ruta | `academia.ruta` por el bus del núcleo | `odea-academia.js` |

Verificado en la fuente: `if (n >= 3) return;` y `state.monedas += 3`.

**En ODEA 2.** La completación se registra en la sección aditiva con `xp: 0`.
La ruta avisada se guarda en `worlds.academia.data.rutasAvisadas`.

### 9.2 Garaje — El Garaje

**Catálogo.** `assets/odea-garaje.js` · `MISIONES_BASE`: **13 misiones** sobre
2 vehículos (`carro` 7, `moto` 6), cada una con su intervalo en días:

`lavar` 7 · `llantas` 14 · `interior` 14 · `aceite-nivel` 15 · `fluidos` 30 ·
`luces` 30 · `aceite-cambio` 90 (carro) · `lavar` 7 · `llantas` 7 · `cadena` 14 ·
`aceite` 15 · `frenos` 30 · `luces` 30 (moto).

**Recompensa.**

| Concepto | Valor | Fuente |
|---|---|---|
| XP por misión | **0** | El catálogo no tiene campo de XP |
| Monedas propias | **0** | El Garaje no paga por sí mismo |
| Sinergia del Tesoro | **+2 monedas**, máximo **2 al día** | `odea-tesoro.js` · `onGarajeMision()` |
| Clave del contador | `garaje:YYYY-MM-DD` | `sinergias` del Tesoro |

Verificado en la fuente: `if (n >= 2) return;` y `st.monedas += 2`.

**Periodicidad.** Recurrente **por intervalo propio**: la misión vuelve a estar
debida al cumplirse sus `dias`. No es `daily` ni `weekly`.
La completación se registra **por ciclo**: `missionId` + fecha del ciclo.

> **Consecuencia técnica, no una pregunta abierta:** las tres clases actuales de
> idempotencia (`one` / `daily` / `weekly`) no cubren «cada N días». Habilitar
> Garaje exige una cuarta clase (`every:Nd`) o una decisión explícita que lo
> reduzca. Queda anotado como requisito de implementación de Fase 4.

### 9.3 El Mercado — dos catálogos, dos monedas

Existen **dos tiendas** en el original y **no se mezclan**.

| | Tienda principal (El Mercado) | Segunda sección (Tesoro) |
|---|---|---|
| Fuente | `odea.html` · `SHOP_ITEMS` | `assets/odea-tesoro.js` · `SHOP` |
| Contenido | Equipo del núcleo | Cosméticos del panel |
| Entradas | **25** = 20 comprables + 5 `grantOnly` (set EXO//ORÁCULO) | **4** |
| Precios | 18–750 monedas del núcleo | 15 / 25 / 40 / 40 |
| Efecto | `power` por slot, potencia del personaje | Cosmético: título, marco, temas |
| Estado | `gameState.shop` (`owned`, `equipped`, `spent`) | `odea_tesoro_v1` (`propios`, `tema`, `marco`, `titulo`) |

Los cinco `grantOnly` **no se venden**: se otorgan por evento (precio 0).

**Sin fusionar ni re-preciar.** Cada catálogo conserva sus precios exactos.

**Moneda.** La sinergia de Academia y Garaje acredita **monedas del Tesoro**
(`worlds.tesoro.data.monedas`), un libro distinto del saldo del núcleo
(`core.derived.coins`, que se deriva de completaciones menos `shop.spent`).
No se convierten ni se suman entre sí.

### 9.4 Jefes y cartas — solo lectura

| | Fuente | Entradas | Id |
|---|---|---|---|
| Jefes | `assets/odea-jefe.js` · `BOSSES` | 4 | **Ninguno**; rotan por semana |
| Cartas | `assets/odea-anomalias.js` · `TRIVIA` | 8 (+3 hitos) | **Ninguno** |

**Decisión.** En Fase 3 ambos siguen en **solo lectura** y se documentan **por
nombre**. **No se asignan ids posicionales**: si el arreglo fuente cambia de
orden, un id por posición apuntaría en silencio a otro jefe, y eso viola la
decisión cerrada de unicidad y estabilidad de ids (§2.3.1).

Cuando Fase 4 active estos dominios, los ids se asignarán como **slugs estables
derivados del nombre**, sobre una revisión congelada del catálogo.

El quiz (`odea-quiz*.js`) sigue **cerrado por D5**: se exhibe como archivado en
el Rincón Anomalía, nunca como contenido jugable ni extraíble.

### 9.5 Inventario extraído

`data/xp-catalog-live.json` (herramienta: `tools/extract-assets.mjs`) contiene
los catálogos con hash SHA-256 de cada fuente:

| Sección | Contenido |
|---|---|
| `academia` | 28 misiones reales, 6 rutas, denominador 29 |
| `tesoro` | 25 objetos (`SHOP_ITEMS`) |
| `tesoroModulo` | 4 cosméticos (`SHOP`) + reglas del módulo |
| `garaje` | 2 vehículos, 13 misiones con `dias` |
| `jefe` | 4 jefes, sin id |
| `anomalias` | 8 cartas + 3 hitos, sin id |
