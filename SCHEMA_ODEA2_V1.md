# SCHEMA_ODEA2_V1 — borrador del save `odea2_` v1

**Estado:** borrador de Fase 0 **cerrado**. Define la forma que ODEA 2 guardará
desde el día uno y el resultado exacto de la importación única desde ODEA 1
v5.99.

- Formato de archivo: `odea2_bundle_v1`
- Clave de almacenamiento: `odea2_bundle_v1` (prefijo `odea2_`)
- Versión de schema: `schemaVersion: 1` (en el bundle y en `core`)
- Claves auxiliares: `odea2_quarantine_v1` (preview) y `odea2_backup_*` (backups)

---

## 1. Estructura del bundle

Un **bundle único** con **tres secciones de dominio** (decisión D2). Cada
sección es autocontenida para que una futura separación en claves por dominio
no exija otro cambio de formato.

```jsonc
{
  "_format": "odea2_bundle_v1",
  "schemaVersion": 1,
  "appVersion": "0.3.0-fase2",

  "migratedFrom": {
    "format": "odea_bundle_v2",
    "appVersion": "5.99",
    "saveVersion": 3,
    "migratedAt": "2026-11-10T12:00:00.000Z"
  },

  "sourceFingerprint": {
    "algorithm": "fnv1a64",
    "digest": "178c5e1d4329f87a",
    "appVersion": "5.99",
    "totalXP": 6915,
    "lastDailyDate": "2026-11-10"
  },

  "import": {
    "state": "active",              // active | quarantine | aborted
    "checksumOk": true,             // candado 2 (estructura)
    "reconciled": true,             // candado 1 (totales)
    "attemptedAt": "2026-11-10T12:00:00.000Z",
    "acceptedAt": null,             // solo si el usuario aceptó una cuarentena
    "acceptedChecks": [],
    "failedChecks": [],
    "report": { /* totales: ver §7.2 */ },
    "backup": { "key": "odea2_backup_source_178c5e1d_…", "digest": "…", "createdAt": "…", "kind": "source" }
  },

  "migration": {
    "referenceDate": "2026-11-10",
    "decisions": [ /* 36, una por campo de save */ ],
    "worlds": { /* 11 decisiones de claves */ },
    "unmapped": { "fields": {}, "keys": {} },
    "importCheck": { /* reconciliación + paridad */ }
  },

  "core":   { /* núcleo: estado del juego, §3 */ },
  "worlds": { /* 8 claves activas, §4 */ },
  "legacy": { "keys": { /* 3 claves archivadas, §5 */ } }
}
```

**Regla:** todo lo que ODEA 1 guardaba vive en `core`, `worlds` o `legacy`.
No hay `save` en la raíz. Nada se descarta: lo desconocido va a
`migration.unmapped`.

---

## 2. `core` — estado del núcleo

### 2.1 `core.identity`

| Campo | Tipo | Origen ODEA 1 | Notas |
|---|---|---|---|
| `playerName` | string | `save.playerName` | Default ODEA 1: `"Recluta"`. |
| `startDate` | string \| null | `save.startDate` | `YYYY-MM-DD`. |
| `lastDailyDate` | string \| null | `save.lastDailyDate` | `YYYY-MM-DD`. Fija `referenceDate`. |
| `streak` | number | `save.streak` | Multiplica XP diario (`streakMult`). |
| `shieldWeek` | string \| null | `save.shieldWeek` | `YYYY-Www`. |
| `freezers` | number | `save.freezers` | 0..2. |
| `sound` | boolean | `save.sound` | Default `true`. |

### 2.2 `core.progress`

| Campo | Tipo | Origen ODEA 1 | Fuente de |
|---|---|---|---|
| `completedMissions` | string[] | `save.completedMissions` | XP campaña + monedas. |
| `completedDaily` | string[] | `save.completedDaily` | XP diaria ×racha + monedas. |
| `completedWeekly` | number[] | `save.completedWeekly` | XP semanal + monedas. |
| `completedJobs` | string[] | `save.completedJobs` | XP empleo + monedas. |
| `completedB2b` | string[] | `save.completedB2b` | XP legacy B2B + monedas. |
| `completedPuente` | string[] | `save.completedPuente` | XP Puente + monedas. |
| `unlockedAch` | string[] | `save.unlockedAch` | XP logros. |
| `applications` | object[] | `save.applications` | Fuentes de noticias seguidas. |

### 2.3 `core.vida`

Origen: `save.vida` (1:1).

```jsonc
{
  "log": ["hab-gym|2026-11-05", "reto9|2026-11-05"],
  "growth": ["grw-libro"],
  "kid": ["kht-zapatos"],
  "couple": ["cgo-presu"],
  "pow": ["pow-48"],
  "men": ["men-ep"],
  "plan": ["pln-piscina"],
  "orden": ["orw-limpieza"]
}
```

- `log`: entradas `"id|clave"`. La clave es fecha (`YYYY-MM-DD`) o semana ISO.
- Listas: ids de misiones one-shot/semanales.
- **Fuente de XP** (`vidaCompute`) incluido el bonus de equilibrio y las sagas.

### 2.4 `core.capital`

Origen: `save.capital` (1:1).

```jsonc
{ "done": ["ca1_1"], "eng": ["en1_1"], "ai": ["ia1_2"] }
```

### 2.5 `core.gods`

Origen: `save.gods`. Mapa `id → true` de jefes derrotados.

```jsonc
{ "cronos": true, "hades": true }
```

### 2.6 `core.shop`

Origen: `save.shop` (1:1). Libro de gastos de monedas y equipo comprado.

```jsonc
{ "spent": 100, "owned": ["hl_iron"], "equipped": { "cabeza": "hl_iron" } }
```

> `spent` incluye equipo, congeladores y **canjes de recompensas reales**.
> Nunca se recalcula ni se "normaliza" a la baja.

### 2.7 `core.reto`

Origen: `save.reto` (1:1): `{ "date": "YYYY-MM-DD"|null, "id": string|null, "done": boolean }`.

### 2.8 `core.gear`  ← **`save.rewards` de ODEA 1**

Renombrado: en ODEA 1 `rewards` es el **arsenal/equipo**, no recompensas reales.

```jsonc
{ "unlocked": ["rw_d1"], "queue": [], "equipped": { "torso": "rw_first" } }
```

Slots observados: `cabeza`, `hombros`, `torso`, `pies`, `medallas`.
ODE 2 no debe usar el nombre `rewards` para este dato.

### 2.9 `core.planner`

Origen: `save.planner` (1:1): `{ "items": [{ "f": "campaign", "id": "fl1_1" }] }`.

### 2.10 `core.diary`

Origen: `save.diary` (1:1).

```jsonc
{ "date": "2026-11-10", "text": "…", "log": [{ "date": "2026-11-09", "xp": 15 }] }
```

`log[].xp` es **fuente de XP**.

### 2.11 `core.activity`

Origen: `save.activity` (1:1). Mapa por fecha:

```jsonc
{ "2026-11-05": { "n": 5, "by": { "vida": 3, "daily": 2 } } }
```

`n` = misiones del día; `by` = desglose por frente. Historial acotado a 400 días
en ODEA 1; se preserva tal cual.

### 2.12 `core.focus`

Origen: `save.focus` (1:1).

```jsonc
{ "log": [{ "d": "carrera", "xp": 25, "date": "2026-11-06", "t": 1762400000000 }], "date": "2026-11-07" }
```

`log[].xp` es **fuente de XP**.

### 2.13 `core.hunt` — La Cacería (22 subcampos)

Origen: `save.hunt` (1:1). Se preserva **crudo**; la normalización de ODEA 1
(`normalizeHunt`) se aplicará al cargar, no en la migración (para no perder
campos que ODEA 1 recortaría).

| # | Subcampo | Tipo | Fuente de |
|---|---|---|---|
| 1 | `created` | string\|null | Fecha de creación. |
| 2 | `quota` | number | Cuota diaria (5). |
| 3 | `quickShots` | number | Disparos rápidos. |
| 4 | `radarChecks` | `{date, done[]}` | Radar. |
| 5 | `applications` | object[] | Postulaciones (shape `huntApp`). |
| 6 | `vacancies` | object[] | Vacantes (`huntVacancy`). |
| 7 | `forge` | object | Forja por vacante. |
| 8 | `followups` | object[] | Seguimientos. |
| 9 | `missions` | `{daily:{date,done[]}, weekly:{week,done[]}}` | Misiones de caza. |
| 10 | `log` | object[] | **Fuente de XP y monedas** (`huntLog`). |
| 11 | `manual` | object[] | Misiones manuales. |
| 12 | `streak` | number | Racha. |
| 13 | `bestStreak` | number | Mejor racha. |
| 14 | `lastPost` | string\|null | Último post. |
| 15 | `combo` | number | Combo. |
| 16 | `comboDate` | string\|null | Fecha del combo. |
| 17 | `quotaBonusDate` | string\|null | Bonus de cuota. |
| 18 | `regenCount` | number | Regeneraciones. |
| 19 | `boss` | `{favorites[], custom[], history[], failed[]}` | Jefe de caza. |
| 20 | `settings` | `{fx, vibrate}` | Preferencias. |
| 21 | `surprise` | `{date, type, done}` | Sorpresa. |
| 22 | `v2` | `{legacyShots, shots[], platform, chain{lastDay,days,best}, lastUndo}` | Cacería v2. |

`log[]` shape: `{key, id, shotId, appId, kind, date, xp, coins, title}`.
`v2.shots[]` shape: `{id, ts, date, mission, platform, xp, coins, crit, combo, damage}`.
`v2.lastUndo` shape: `{shotId, prevActivity, prevStreak, prevLastDailyDate,
prevShieldWeek, prevUnlockedAch[], prevChain, prevFreezers}`.

### 2.14 `core.credits` — crédito permanente (**CRÍTICO**)

```jsonc
{
  "eventRL": { "log": [{ "id": "ev_sint_1", "d": "2026-11-01", "xp": 20, "coins": 2 }] },
  "farm":    { "log": [{ "d": "2026-11-08", "c": 4 }] }
}
```

| Crédito | Origen | Regla de XP | Regla de monedas |
|---|---|---|---|
| `eventRL` | `save.eventRL` | `Σ log[].xp` (0..60 por entrada en ODEA 1) | `Σ log[].coins` (0..12). |
| `farm` | `save.farm` | `Σ min(por día, 40) × 2` | `Σ floor(min(por día, 40) / 4)`. |

Ambos sistemas ya no tienen UI en ODEA 1, pero **siguen sumando**. No son
"datos muertos": son crédito del usuario.

### 2.15 `core.realRewards` — Recompensas Reales (**CRÍTICO**)

Origen: `save.canje`. Se renombra para no colisionar con `rewards`.

```jsonc
{
  "canje": {
    "custom": [{ "id": "cx_sint_1", "ico": "🎁", "n": "…", "price": 30, "custom": true }],
    "log": [{ "id": "lr_movie", "n": "…", "ico": "🍿", "price": 30, "d": "2026-11-09", "done": false }]
  }
}
```

- `custom`: recompensas creadas por el usuario.
- `log`: canjes realizados (`done` = disfrutada).
- Cada canje suma a `shop.spent`; por eso ambos se migran juntos.
- Se preserva **verbatim** (incluidos campos extra como `doneDate` si existieran).

### 2.16 `core.stats`

Origen: `save.stats` (1:1). Derivado en ODEA 1:

```jsonc
{ "domains": [{ "id": "carrera", "n": "Carrera", "s": "Carrera", "ico": "💼", "c": "#ffaa00", "xp": 480, "pct": 12, "lvl": 1 }] }
```

Se conserva como snapshot; ODEA 2 recalcula los dominios.

### 2.17 `core.derived` — snapshots y checksum

| Campo | Origen ODEA 1 | Uso en ODEA 2 |
|---|---|---|
| `xpBreakdown` | `save.xpBreakdown` | Checksum de 10 componentes. Se compara al cargar. |
| `totalXP` | `save.totalXP` | Checksum de la suma. |
| `campaignLevel` | `save.campaignLevel` | Nivel del plan. |
| `level` | `save.level` | Alias de `campaignLevel`; deprecable en v2. |
| `odeLevel` | `save.odeLevel` | Nivel global ODEA. |
| `coins` | calculado | `{ earned, spent, balance }` al importar. |

`xpBreakdown` tiene exactamente estas 10 claves:
`career, ach, vida, capital, focus, diary, bosses, hunt, evento, farm`.

**Invariante de carga:** `recalcular(fuentes) === derived.*`. Si no, se aborta
con `XP_DRIFT` (no se corrige en silencio).

---

## 3. `worlds` — 8 claves activas

Cada entrada:

```jsonc
{
  "legacyKey": "odea_sagas_v1",
  "schemaVersion": 1,
  "lifecycle": "active",
  "reason": "Aporta XP a vida (kid/pow) y monedas.",
  "data": { /* contenido original, clonado 1:1 */ }
}
```

| `worlds.<name>` | `legacyKey` | Rol |
|---|---|---|
| `academia` | `odea_academia_v1` | Academia; base del Distrito IA. |
| `jefe` | `odea_jefe_v1` | Jefe semanal. |
| `anomalia` | `odea_anomalia_v1` | Anomalía diaria. |
| `tesoro` | `odea_tesoro_v1` | Tesoro, rachas y sinergias. |
| `sagas` | `odea_sagas_v1` | **Aporta XP a `vida` y monedas.** |
| `garaje` | `odea_garaje_v1` | Misiones de vehículo y km. |
| `juice` | `odea_juice_v1` | Preferencias de sonido/juice. |
| `hub` | `odea_hub_v1` | Recompensas pendientes de monedas. |

`schemaVersion` = `data.v` si es número; si no, `null` (p. ej. `odea_juice_v1`,
que no tiene `v`).

---

## 4. `legacy` — 3 claves archivadas

```jsonc
{
  "keys": {
    "quiz": {
      "legacyKey": "odea_quiz_v1",
      "schemaVersion": 1,
      "lifecycle": "archived-legacy",
      "reason": "LEGACY PERMANENTE: capa quiz retirada de la interfaz en v5.99…",
      "data": { /* intacto */ }
    }
  }
}
```

| `legacy.keys.<name>` | `legacyKey` | `lifecycle` | Regla |
|---|---|---|---|
| `empleo` | `odea_empleo_v2` | `archived-legacy` | Marca escalar (=1) ya consumida. |
| `quiz` | `odea_quiz_v1` | `archived-legacy` | **Archivada indefinidamente (D5).** |
| `events` | `odea_events` | `archived-log` | Log de auditoría (máx. 500). |

**Regla D5:** ninguna clave legacy se elimina automáticamente, ni en v1 ni en
versiones futuras. Solo con decisión explícita del usuario y verificando antes
que no alimenta ningún total. `reset + reimportar` tampoco las borra.

---

## 5. `migration` — trazabilidad

| Campo | Tipo | Uso |
|---|---|---|
| `referenceDate` | `YYYY-MM-DD` | Fija derivaciones de calendario (saga semanal). |
| `decisions` | array(36) | Una por campo: `{source, action, target, present, reason, critical?}`. |
| `worlds` | object(11) | Una por clave: `{legacyKey, section, lifecycle, reason, present}`. |
| `unmapped.fields` | object | Campos extra preservados. |
| `unmapped.keys` | object | Claves extra preservadas. |
| `importCheck` | object | `{ok, stored, recomputed, recomputedFromMigrated, parityOk}`. |

---

## 6. `sourceFingerprint` — huella del origen

| Campo | Tipo | Uso |
|---|---|---|
| `algorithm` | `"fnv1a64"` | Algoritmo del digest (no criptográfico). |
| `digest` | hex 16 | Huella estable del bundle legacy completo. |
| `appVersion` | string\|null | Versión de ODEA 1 que exportó. |
| `totalXP` | number\|null | Total de XP del bundle de origen. |
| `lastDailyDate` | string\|null | Última misión diaria del bundle de origen. |

Se usa para **detectar duplicados** (D4): mismo `digest` = mismo bundle =
reimportación rechazada aunque se haya hecho reset.

---

## 7. `import` — máquina de estados

### 7.1 Estados

| Estado | Significado | ¿Es save? | Transiciones |
|---|---|---|---|
| `active` | Importación válida y utilizable. | **Sí** | — (solo reset + reimportar) |
| `quarantine` | Preview pendiente de decisión del usuario. | No | `acceptQuarantine()` → `active`; `rejectQuarantine()` → se descarta |
| `aborted` | Los totales no reconciliaron. No se escribió nada. | No | — (corregir el bundle y reintentar) |

Reglas:

- Un bundle `quarantine` **no** se puede cargar (`loadOdea2` → `IMPORT_NOT_ACTIVE`)
  ni guardar como save (`saveOdea2` → `IMPORT_NOT_ACTIVE`).
- Aceptar una cuarentena copia `failedChecks` a `acceptedChecks` y fija
  `acceptedAt`. **Aceptar no repara**: los checks siguen fallando y la
  validación sigue devolviendo `ok: false`.
- `aborted` implica que no existe bundle guardado; el backup del origen sí.

### 7.2 `import.report`

```jsonc
{
  "referenceDate": "2026-11-10",
  "totals": {
    "totalXP":     { "stored": 6915, "recomputed": 6915, "ok": true },
    "xpBreakdown": { "stored": { … }, "recomputed": { … }, "diffs": [], "ok": true },
    "shop": {
      "spent": { "stored": 100, "recomputed": 100, "ok": true },
      "coins": { "earned": 141, "spent": 100, "balance": 41 }
    }
  },
  "missing":   { "fields": [], "keys": [], "criticals": [] },
  "criticals": { "eventRL": true, "farm": true, "canje": true }
}
```

### 7.3 `import.backup`

```jsonc
{ "key": "odea2_backup_source_178c5e1d_2026-11-10T12:00:00.000Z",
  "digest": "178c5e1d4329f87a",
  "createdAt": "2026-11-10T12:00:00.000Z",
  "kind": "source" }
```

- `kind: "source"` = backup del bundle legacy importado.
- `kind: "save"` = backup del save ODEA 2 actual antes de un «reset + reimportar»
  o de una restauración.
- El backup se hace **siempre antes** de cualquier escritura, incluso si la
  importación termina en `aborted`.
- **Retención (Fase 1):** los backups `kind: "save"` se rotan automáticamente a
  los **últimos 3**; al crear el cuarto se elimina el más viejo. Los
  `kind: "source"` **no se rotan nunca**. Para conservar una copia puntual, el
  usuario debe exportarla antes con «Exportar respaldo».

### 7.4 Reimportación

| Situación | Resultado |
|---|---|
| No existe save `odea2_` | Importa. |
| Existe `quarantine` | Permite reintentar (todavía no es save). |
| Existe `active` y **misma huella** | `DUPLICATE_SOURCE` (siempre). |
| Existe `active` y huella distinta | `ALREADY_IMPORTED`; solo «reset + reimportar». |
| `resetAndReimport()` | Backup del save actual (`kind: "save"`) → borra → importa. |

---

## 8. Invariantes del schema v1

1. Todo id de misión/log se conserva **verbatim**; no se reescribe ni se filtra
   en la migración.
2. `xpBreakdown` y `totalXP` son **checksums**, no la fuente de verdad.
3. `eventRL`, `farm` y `canje` no pueden ser `null` en un save `active` sin
   quedar registrados en `import.acceptedChecks`.
4. `shop.spent` es inmutable en la migración.
5. Las 11 claves existen si existían en origen: 8 en `worlds`, 3 en `legacy`.
6. `migration.decisions.length === 36`; `migration.worlds` declara 11.
7. El bundle migrado **no muta** el bundle de origen.
8. `import.state === "active"` es requisito para cargar y guardar.
9. `sourceFingerprint.digest` es estable: mismo bundle → mismo digest.
10. Las claves legacy **nunca** se eliminan automáticamente.

---

## 9. Versionado

- `schemaVersion` sube solo con cambios **incompatibles** de forma o semántica.
- Cambios aditivos (campos nuevos opcionales) no suben la versión; se documentan.
- Cada versión tendrá una migración encadenada `vN → vN+1`. La importación de
  ODEA 1 siempre produce `v1`; luego se aplican las migraciones internas.
- `migratedFrom` conserva `format`, `appVersion` y `saveVersion` de origen para
  auditoría y para depurar regresiones.
- `level` queda como alias deprecable: no eliminarlo hasta que no existan
  bundles v1 con lectores antiguos.
- Separar el bundle en claves por dominio (`odea2_core_*`, `odea2_world_*`,
  `odea2_legacy_*`) **no** cambia el formato: las secciones ya están separadas.

---

## 10. Ejemplo mínimo (recortado)

```jsonc
{
  "_format": "odea2_bundle_v1",
  "schemaVersion": 1,
  "appVersion": "0.3.0-fase2",
  "migratedFrom": { "format": "odea_bundle_v2", "appVersion": "5.99", "saveVersion": 3, "migratedAt": "…" },
  "sourceFingerprint": { "algorithm": "fnv1a64", "digest": "…", "appVersion": "5.99", "totalXP": 6915, "lastDailyDate": "2026-11-10" },
  "import": { "state": "active", "checksumOk": true, "reconciled": true, "attemptedAt": "…",
              "acceptedAt": null, "acceptedChecks": [], "failedChecks": [], "report": { … },
              "backup": { "key": "…", "digest": "…", "createdAt": "…", "kind": "source" } },
  "migration": { "referenceDate": "2026-11-10", "decisions": [ … 36 … ], "worlds": { … 11 … },
                 "unmapped": { "fields": {}, "keys": {} }, "importCheck": { "ok": true } },
  "core": {
    "schemaVersion": 1,
    "identity": { "playerName": "…", "streak": 8, "freezers": 1, "sound": true },
    "progress": { "completedMissions": ["fl1_1"], "completedDaily": ["1A"], "…": "…" },
    "vida": { "log": [], "growth": [], "kid": [], "couple": [], "pow": [], "men": [], "plan": [], "orden": [] },
    "capital": { "done": [], "eng": [], "ai": [] },
    "gods": {},
    "shop": { "spent": 0, "owned": [], "equipped": {} },
    "reto": { "date": null, "id": null, "done": false },
    "gear": { "unlocked": [], "queue": [], "equipped": {} },
    "planner": { "items": [] },
    "diary": { "date": null, "text": "", "log": [] },
    "activity": {},
    "focus": { "log": [], "date": null },
    "hunt": { "created": null, "quota": 5, "…": "… (22 subcampos)" },
    "credits": { "eventRL": { "log": [] }, "farm": { "log": [] } },
    "realRewards": { "canje": { "custom": [], "log": [] } },
    "stats": { "domains": [] },
    "derived": { "xpBreakdown": { "career": 0, "ach": 0, "vida": 0, "capital": 0,
                                  "focus": 0, "diary": 0, "bosses": 0, "hunt": 0,
                                  "evento": 0, "farm": 0 },
                 "totalXP": 0, "campaignLevel": 1, "level": 1, "odeLevel": 1,
                 "coins": { "earned": 0, "spent": 0, "balance": 0 } }
  },
  "worlds": { "sagas": { "legacyKey": "odea_sagas_v1", "schemaVersion": 1, "lifecycle": "active", "reason": "…", "data": {} } },
  "legacy": { "keys": { "quiz": { "legacyKey": "odea_quiz_v1", "schemaVersion": 1, "lifecycle": "archived-legacy", "reason": "…", "data": {} } } }
}
```
