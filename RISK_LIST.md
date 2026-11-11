# RISK_LIST — Fase 0 de ODEA 2 (Costa Neón)

Alcance: riesgos de la **migración de progreso** y de la futura puesta en
marcha del repositorio/PWA. No incluye riesgos de diseño de la ciudad ni de
sistemas de juego (fases futuras).

Severidad: **S1** = pérdida de progreso real · **S2** = importación inválida o
bloqueada · **S3** = deuda/depuración.

---

## 1. Campos en riesgo si se omiten

| # | Campo / clave | Sev. | Qué se pierde si falta | Por qué es fácil omitirlo | Detección actual |
|---|---|---|---|---|---|
| R1 | `eventRL` (crédito del evento) | **S1** | XP (`xpBreakdown.evento`) y monedas del evento de entrevista. | Ya no tiene UI en ODEA 1; parece “muerto”. | `CRITICAL_EVENTRL` + paridad de XP. |
| R2 | `farm` (crédito del Quiz Farmeo) | **S1** | XP (`xpBreakdown.farm`) y monedas del farmeo. | Capa quiz retirada en v5.99; parece “muerto”. | `CRITICAL_FARM` + XP/monedas. |
| R3 | `canje` (Recompensas Reales) | **S1** | Historial de recompensas creadas/canjeadas y el gasto asociado. | No afecta XP; un validador ingenuo no lo nota. | `CRITICAL_CANJE` explícito. |
| R4 | `shop.spent` | **S1** | Balance de monedas (se inflaría) o historial de gasto. | Se confunde con “derivado” y se recalcula. | `SHOP_SPENT` + `COINS_IDENTICAL`. |
| R5 | `odea_sagas_v1` | **S1** | XP de `vida` (kid/pow) y monedas de sagas. | Es una clave hermana, no un campo de `save`. | XOR de `vida` y `COINS_IDENTICAL`; el catálogo la necesita. |
| R6 | `vida.log` y listas | **S1** | XP de vida, bonus de equilibrio y rachas. | Formato `id|clave` poco obvio. | `XP_COMPONENTS_IDENTICAL` (vida). |
| R7 | `hunt.log` | **S1** | XP y monedas de La Cacería. | La Cacería tiene 22 subcampos; fácil migrar solo `applications`. | XP (`hunt`) y monedas. |
| R8 | `gods` | **S2** | XP de jefes y 50 monedas por jefe. | Mapa id→true sin esquema visible. | XP (`bosses`) y monedas. |
| R9 | `diary.log` / `focus.log` | **S2** | XP de diario/enfoque. | Logs pequeños; se pierden en refactors. | XP (`diary`/`focus`). |
| R10 | `completedB2b` | **S2** | XP legacy B2B y monedas. | Mundo retirado; parece obsoleto. | XP (`career`) y monedas. |
| R11 | `rewards` (gear) | **S2** | Equipo desbloqueado/equipado. | Colisión de nombre con “recompensas reales”. | `FIELD_VALUES_IDENTICAL` (→ `gear`). |
| R12 | `activity` | **S3** | Historial de actividad y rachas. | Estructura por fecha variable. | `FIELD_VALUES_IDENTICAL`. |
| R13 | `odea_events` | **S3** | Log de auditoría (máx. 500). | No es estado de juego. | `KEY_VALUES_IDENTICAL` (archivado). |
| R14 | `odea_quiz_v1` | **S3** | Data legacy de quiz. | Capa retirada; tentación de borrar. | Archivado explícito como `legacy`. |
| R15 | `stats` | **S3** | Snapshot de dominios. | Derivado; se asume recalculable. | `FIELD_VALUES_IDENTICAL`. |

---

## 2. Riesgos de proceso / datos

| # | Riesgo | Sev. | Mitigación |
|---|---|---|---|
| P1 | Commitear el JSON real del usuario (contiene progreso personal). | **S1** | `.gitignore` bloquea `odea-progreso-20*.json`; el fixture es sintético; revisar `git status` antes de commit. |
| P2 | Importar dos veces el mismo bundle (duplicar créditos). | **S1** | Implementado en Fase 0: save activo → `ALREADY_IMPORTED`; misma huella → `DUPLICATE_SOURCE` (incluso con reset). Solo «reset + reimportar» explícito, con backup previo. |
| P3 | Bundle parcialmente corrupto (JSON válido, datos faltantes). | **S1** | Dos candados: totales → aborta; estructura → cuarentena. Nunca “repara” en silencio. |
| P4 | Migrar con un catálogo distinto al de ODEA 1 (ids/XP cambiados). | **S1** | Catálogo congelado con hash de fuente (`data/xp-catalog.json`), paridad exacta verificada; en Fase 1 usar el mismo núcleo portado. |
| P5 | Cambio de semana entre exportación e importación. | **S2** | `migration.referenceDate` fijo en `lastDailyDate` (D3); efecto conocido y aceptado. |
| P6 | `localStorage` lleno o cuota excedida al escribir. | **S2** | Escribir en una clave nueva `odea2_bundle_v1`; capturar `QuotaExceededError`; nunca borrar ODEA 1. Ojo: cada backup ocupa espacio (ver P13). |
| P7 | Service Worker sirviendo una versión vieja de ODEA 2. | **S2** | Versionar `CACHE_VERSION` por release y `skipWaiting`/`clients.claim` controlado (ver §4). |
| P8 | Regresión futura que reintroduce el bug v5.98 (no restaurar créditos). | **S1** | Los tests negativos de `eventRL`, `farm` y `canje` son obligatorios en CI. |
| P9 | Campos desconocidos de una versión futura de ODEA 1. | **S2** | `migration.unmapped` los preserva; el validador no los descarta. |
| P10 | Dependencia de `Math.random` en normalizaciones de ODEA 1. | **S3** | La migración no normaliza; clona crudo. ODEA 2 normaliza al cargar. |
| P11 | Aceptar una cuarentena con un hueco estructural (p. ej. sin `canje`) deja el save incompleto para siempre. | **S1** | La aceptación es explícita y queda registrada en `import.acceptedChecks`; el validador sigue devolviendo `ok: false`. Mitigación real: mostrar el reporte y recomendar abortar si falta un crítico. |
| P12 | La huella es FNV-1a (no criptográfica): colisión teórica de dos bundles distintos. | **S3** | El digest se combina con `appVersion` + `totalXP` + `lastDailyDate`; la colisión práctica es despreciable para uso local. No se usa como seguridad. |
| P13 | Backups acumulados (`odea2_backup_*`) consumen cuota de `localStorage`. | **S2** | Conservar siempre el backup del origen; recortar los de save (A5). Si falla la cuota, abortar sin escribir y avisar. |

---

## 3. Decisiones cerradas en Fase 0

| # | Decisión | Resolución |
|---|---|---|
| D1 | Almacenamiento | **Bundle único** `odea2_bundle_v1` con secciones internas `core` / `worlds` / `legacy`, para que una futura separación por claves no requiera otro cambio de formato. |
| D2 | Política de checksum | **Cuarentena + backup, con dos candados**: (1) si los totales no reconcilian → **aborta sin escribir**; (2) si el checksum estructural falla → **cuarentena** con reporte y aceptación explícita. Backup del origen **siempre** primero. |
| D3 | `referenceDate` | **`lastDailyDate`** (fallback: fecha de importación). Efecto conocido del bonus semanal de sagas **aceptado sin compensaciones**. |
| D4 | Reimportación | **Rechazada por defecto**. Solo «reset + reimportar» explícito, con backup previo del save actual. Huella del origen (`sourceFingerprint`) para detectar duplicados. |
| D5 | `odea_quiz_v1` | **Archivada indefinidamente.** No se elimina automáticamente en ninguna versión; solo con decisión explícita del usuario y verificando que no alimenta totales. |

### 3.1 Decisiones de Fase 1 (cerradas)

| # | Decisión | Resolución |
|---|---|---|
| F1-1 | Aviso de versión nueva del service worker | Se implementa en **Fase 2**: aviso «Hay una versión nueva» con botón **Recargar**. La actualización se aplica **solo** cuando el usuario la toca. Nunca recarga forzada ni silenciosa a mitad de uso. |
| F1-2 | Retención de backups `odea2_backup_save_*` | **Últimos 3**, con rotación automática: al crear el cuarto se elimina el más viejo. El backup del **origen** (`kind: source`) **nunca** se rota. **Implementado en Fase 1** (`SAVE_BACKUP_RETENTION = 3`). |
| F1-3 | Multi-pestaña | Se resuelve en **Fase 2** con listener del evento `storage`: si otra pestaña escribió el save, se muestra aviso y se recarga el estado desde `localStorage`. Sin bloqueos distribuidos. |
| F1-4 | GitHub Pages | Se habilita al **cerrar Fase 1**, en orden: (a) verificación externa, (b) merge de los PRs a `main`, (c) activar Pages desde `main`. **No** se activa durante la fase. |

### 3.2 Decisiones todavía abiertas (no bloquean Fase 0)

| # | Decisión | Opciones | Recomendación |
|---|---|---|---|
| A1 | `level` (alias de `campaignLevel`) | mantener / deprecar en v2. | Mantener en v1; marcar deprecado en v2. |
| A2 | `stats` | recalcular siempre / conservar snapshot. | Recalcular al cargar; conservar el snapshot solo para auditoría. |
| A3 | Retención de `odea_events` | archivar todo / recortar a 500 / descartar. | Archivar (máx. 500 ya viene recortado). No es estado de juego; sirve para auditar. |
| A4 | Normalización de `hunt` | crudo / normalizar en migración. | Crudo (ya implementado); normalizar al cargar con el núcleo portado. |

---

## 4. Notas de versionado de schema y caché PWA

### 4.1 Schema

- `schemaVersion` del bundle y de `core` empiezan en **1**.
- Sube solo con cambios incompatibles; los aditivos se documentan sin subir.
- Cadena de migraciones: `odea_bundle_v2 → odea2 v1 → odea2 v2 → …`.
- `migratedFrom` es inmutable: guarda `format`, `appVersion`, `saveVersion` y
  `migratedAt` para auditar cualquier regresión.
- Las tres secciones (`core` / `worlds` / `legacy`) son estables: separar el
  bundle en claves por dominio **no** cambia el formato.
- Los checksums (`core.derived.xpBreakdown`, `core.derived.totalXP`) deben
  seguir siendo comparables. Si una versión futura cambia la fórmula de XP,
  **no** se debe comparar contra snapshots viejos sin una migración de checksum
  explícita.
- `sourceFingerprint` es inmutable y forma parte de la detección de duplicados:
  no recalcularlo con otro algoritmo sin subir `schemaVersion`.

### 4.2 Caché PWA

- ODEA 1 usa `CACHE_VERSION` en `sw.js` (ej. `odea-v5.63-…`) y estrategia
  network-first para HTML / cache-first para assets. ODEA 2 debe usar un
  **namespace propio** (ej. `odea2-v0.1.0-…`) para no pisar la caché de ODEA 1.
- Nunca cachear el bundle de progreso: vive en `localStorage`, no en la caché
  del SW.
- Al publicar una versión, cambiar `CACHE_VERSION`; limpiar cachés viejas con
  `caches.delete()` selectivo (solo prefijo `odea2-`).
- El HTML de ODEA 2 debe servirse network-first para que un deploy de
  emergencia no quede atrapado en caché.
- **Riesgo de convivencia:** ODEA 1 y ODEA 2 pueden compartir origen (GitHub
  Pages) y por tanto `localStorage` y Cache Storage. Usar claves
  `odea2_*` y prefijos de caché `odea2-` evita colisiones; no tocar
  `odea_save_v2` ni las claves `odea_*` de ODEA 1.

---

## 5. Verificación ejecutada en Fase 0

- Fixture sintético: **33/33 tests OK**. Incluye los negativos de `eventRL`,
  `farm` y `canje`, los dos candados (aborto y cuarentena), aceptar/abortar
  cuarentena, rechazo de reimportación, huella del origen e ida y vuelta.
- Importación del fixture sintético (`fixtures/odea-progreso-sintetico.json`):
  `status: active`, `checksumOk: true`, `reconciled: true`, validación **OK**,
  backup del origen idéntico, con paridad exacta:
  - `career=2903, ach=330, vida=1705, capital=630, focus=50, diary=30,
    bosses=1100, hunt=95, evento=60, farm=12`, `totalXP=6915`.
  - `campaignLevel=3`, `odeLevel=13`.
  - Monedas: `earned=141`, `spent=100`, `balance=41`.
  - Secciones: `worlds=8`, `legacy=3`; huella `178c5e1d4329f87a`.
- Estos son los únicos totales que pueden aparecer en el repo. Cualquier
  cambio futuro que rompa estos números debe fallar en CI.
