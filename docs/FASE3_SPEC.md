# FASE3_SPEC — Fase 3: misiones jugables sobre la ciudad

**Estado:** especificación cerrada. **No implementada.**
**Base:** rama `fase2-ciudad` (`0.3.0-fase2`), PR #3. La Fase 3 no arranca
hasta que la Fase 2 esté verificada y mergeada.
**Alcance de este documento:** contrato de datos, API de escritura, ruta del día
y cámara. No incluye gameplay, UI ni cambios de versión/caché.

Las decisiones F3-1, F3-2 y F3-3 ya están registradas en `RISK_LIST.md` §3.2.
Este documento las desarrolla; no las reabre.

---

## 1. Resumen de decisiones

| # | Punto | Decisión | Anclaje |
|---|---|---|---|
| 1 | Registro de completaciones | Sección **raíz aditiva `play`** con `version`, `completions` y `checkins`. Clave de idempotencia = `occurrenceKey` (`missionId` para únicas, `missionId@fecha` para diarias, `missionId@semanaISO` para semanales). | `src/shape.js:28` (`BUNDLE_SECTIONS` no se toca), `src/validate.js:58-68`, `src/derive.js:76-102` |
| 2 | Escritura | **Una sola** función de gameplay: `applyGameplayMutation(storage, catalog, mutation, opts)`. Backup → copia → validación fail-closed → escritura → re-lectura → resultado tipado. | `src/storage.js:80-86`, `:262-281`, `:283-287` |
| 3 | Ruta del día | **3 misiones** del catálogo `daily`, elegidas por la fecha: día de catálogo `(díasDesdeÉpoca mod 56) + 1`; se filtran las ya completadas. La ruta no se guarda. | `data/xp-catalog.json` (`daily`: 168 ids, 56 días × 3 slots) |
| 4 | Cámara | Snapshot **en memoria de sesión** (`{x, y, zoom}`) al abrir la hoja; restauración exacta al cerrarla. Nunca dentro del bundle ni en una clave UI persistente. | `js/app.js:112-145`, `js/city/engine.js:119-127`, `js/city/camera.js:51-59` |

**Correcciones al prompt, verificadas contra el código:**

- `daily` tiene **168 misiones** (no es un dato aproximado): 56 días × 3 slots
  (`A/B/C`), cada id aparece una sola vez y pertenece a un único `day`
  (`1..56`). Ver §3.1.
- Las misiones `daily` **no son repetibles**: un mismo id no puede completarse
  en dos fechas distintas. La repetición real existe en `vida` (`kind: daily` y
  `kind: weekly`), no en `catalog.daily`. Ver §2.4.
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
    "2026-11-11": { "at": "2026-11-11T07:00:00.000Z", "streakAfter": 9 }
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
| `play.checkins.<date>` | object | Un registro por día local. `at` + `streakAfter`. |

**No se guarda XP ni monedas** en la completación: se derivan del catálogo en
cada lectura. Guardar el monto permitiría que el registro y la derivación
divergieran.

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

Única excepción de escritura fuera de `play`: el check-in actualiza
`core.identity.streak` y `core.identity.lastDailyDate`. Son **fuentes**, no
totales; `streak` ya multiplica la XP diaria en `derive.js:249` y
`lastDailyDate` no se usa como `referenceDate` (esa vive congelada en
`migration.referenceDate`; `src/storage.js:229`). Efecto conocido: subir la
racha puede subir la XP diaria ya existente, exactamente como en ODEA 1.

### 2.5 Impacto en `shape.js` y `validate.js`

- `shape.js`: solo constantes nuevas (`PLAY_SECTION`, `PLAY_VERSION`). No se
  toca `BUNDLE_SECTIONS`, `SAVE_FIELDS` ni `SIBLING_KEYS`.
- `validate.js`: `validateMigration` queda **intacta** para bundles existentes.
  Se agrega una función nueva, `validatePlayState(draft, catalog, { previous })`,
  que corre **solo** en la ruta de escritura de gameplay (Punto 2):
  1. `play.version === 1` y `completions`/`checkins` son objetos planos.
  2. Cada registro tiene `missionId`, `system`, `date` y `at` válidos.
  3. `missionId` existe en el mapa del catálogo del sistema.
  4. `occurrenceKey` coincide con la clase calculada (única/diaria/semanal).
  5. No hay dos registros con el mismo `missionId` y la misma `period`.
  6. `core.derived` coincide con `derive(sourcesFromMigrated(draft), catalog, ref)`.
  7. Ningún campo migrado cambió respecto de `previous` (salvo
     `core.derived`, `core.identity.streak` y `core.identity.lastDailyDate`).
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
| Id duplicado entre sistemas | Imposible hoy (0 colisiones); `validatePlayState` lo rechaza si ocurre. |
| Bundle en cuarentena | `rejected` con `SAVE_NOT_ACTIVE`; la cuarentena no es save. |
| `play` corrupto detectado al arrancar | `loadOdea2` falla cerrado con `XP_DRIFT`. |

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
   `kind: "source"` de la migración no se tocan.
5. **Copiar**: `draft = JSON.parse(JSON.stringify(bundle))`. La mutación nunca
   toca el objeto leído.
6. **Aplicar** `applyMutation(draft, mutation, catalog, { at, date })`:
   inicializa `play` si falta, valida la existencia de la misión y su clase,
   registra la completación o el check-in, y devuelve `changed`.
7. **Refrescar el snapshot derivado**: recalcular con
   `derive(sourcesFromMigrated(draft), catalog, draft.migration.referenceDate)`
   y escribir `draft.core.derived` (mismos campos que
   `src/storage.js:250-257`). No se edita ningún total a mano.
8. **Validar fail-closed** con `validatePlayState(draft, catalog, { previous: bundle })`.
   Si falla: descartar `draft`, devolver `rejected` con `SCHEMA_INVALID` o
   `DERIVE_DRIFT`, y **no escribir**. El backup del paso 4 ya existe, pero el
   save es idéntico al anterior.
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

**Orden del backup (decisión explícita):** el respaldo se crea después de
validar la copia y antes de tocar la clave persistida. La copia del paso 5 es
solo memoria; el save todavía no se mutó. Así una escritura inválida no rota
los 3 backups con copias idénticas del mismo save. El requisito «backup antes de
cada mutación» se cumple sobre la mutación **persistida**, que es la única que
puede dañar el progreso.

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
| `SCHEMA_INVALID` | `play` o el bundle no pasan `validatePlayState`. | No |
| `DERIVE_DRIFT` | La re-derivación no coincide con el snapshot refrescado. | No |
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

Todos son nuevos; no se modifican expectativas de Fase 0/1/2.

1. **`play` perezoso** — un bundle migrado sin `play` es válido; la primera
   escritura crea `play.version = 1` sin re-migrar.
2. **Forma migrada intacta** — tras una completación, `core` (salvo
   `derived`/`streak`/`lastDailyDate`), `worlds` y `legacy` quedan byte a byte
   iguales al bundle anterior.
3. **Ida y vuelta Hub** — completar `48A` guarda, relee y la derivación coincide
   con `core.derived`; `totalXP` sube lo que dicta `derive()`.
4. **Idempotencia** — la segunda completación de `48A` devuelve `duplicate`, no
   crea backup, no cambia bytes y no suma XP ni monedas.
5. **Vida diaria** — `hab-gym` el mismo día es `duplicate`; al día siguiente se
   aplica como nueva ocurrencia.
6. **Vida única/semanal** — una misión `kind: "one"` es única para siempre; una
   `kind: "weekly"` se repite solo al cambiar de semana ISO.
7. **Check-in** — mismo día es `duplicate`; día siguiente sube la racha; un
   hueco la reinicia a 1; `lastDailyDate` se actualiza.
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

---

## 7. Fuera de alcance

- Implementar gameplay, misiones, pantallas o la vista de misiones.
- Tocar la UI de la ciudad o la hoja más allá de lo que exige el Punto 4.
- Cambiar migración o validación de bundles existentes.
- Subir `APP_VERSION` (`0.3.0-fase2`), `schemaVersion` (1) o el caché del SW
  (`odea2-v0.3.0-fase2`).
- Empleo/Vida más allá del contrato de escritura: el contenido de sus misiones
  se define en la tarea de implementación.
- Pages, merge o PR de Fase 2.

---

## 8. Riesgos y preguntas abiertas reales

1. **Regla de racha nueva.** El código solo aporta el multiplicador
   (`src/derive.js:37-44`); no hay lógica de check-in en ODEA 1 que copiar. La
   regla propuesta (mismo día = no-op; día siguiente = +1; hueco = 1) es una
   decisión de diseño **nueva**, no una paridad. El orquestador debe
   confirmarla antes de implementar. Si se rechaza, el check-in solo registra y
   `streak` queda como fuente migrada.
2. **Salto de `campaignLevel`.** La ruta es por fecha, no por progreso: un
   jugador puede completar el día 48 sin haber hecho el 3. `campaignLevel`
   cuenta días completos (`derive.js:210-221`), así que puede saltar. Se acepta:
   es coherente con la fórmula existente.
3. **Reloj local.** La fecha y el check-in dependen del reloj del dispositivo.
   No hay hora de servidor; la idempotencia evita el doble crédito, pero no el
   cambio de día artificial. Aceptado para un juego local.
4. **Orden del backup.** Se hace después de validar la copia y antes de escribir
   la clave persistida (§3.2). Si el orquestador exige el orden literal
   «backup antes de aplicar la mutación en memoria», el cambio es de una línea,
   pero rotaría backups con copias idénticas en cada intento inválido.
5. **Validador post-migración.** `validateMigration` no sirve para gameplay:
   exige el bundle legacy de origen (`src/validate.js:45-52`). Por eso se
   especifica `validatePlayState` como validador nuevo, no como reutilización.
6. **Catálogo futuro.** La unicidad global de ids se verificó hoy (623 ids, 0
   colisiones). Si un catálogo futuro repite un id entre sistemas,
   `validatePlayState` debe rechazarlo o la clave necesita prefijo de sistema.
