# ODEA 2 — Costa Neón

**Fase 1: esqueleto PWA con la migración de progreso funcionando de verdad.**
El juego todavía **no está construido**: no hay ciudad, distritos ni misiones.
Esta fase entrega una pantalla de estado que importa, valida y guarda el
progreso de ODEA 1 en el navegador.

## Estado de las fases

| Fase | Estado | Contenido |
|---|---|---|
| **Fase 0** | ✅ completa | Especificación de la migración (36 campos + 11 claves), decisiones D1–D5, código de validación y 33 tests. |
| **Fase 1** | ✅ esta rama | PWA instalable, importación con validación/cuarentena/aborto, respaldo y restauración. Sin juego. |
| Fase 2+ | pendiente | Ciudad 2D cenital, distritos y sistemas de juego (con aprobación explícita). |

## Correr la app en local

Los módulos ES y el service worker **no funcionan con `file://`**: hace falta un
servidor HTTP.

```bash
# opción 1
npx serve .

# opción 2 (Python)
python -m http.server 8080
```

Abrí la URL que indique el servidor (por ejemplo `http://localhost:3000`).
La app funciona sin conexión después de la primera carga (service worker
`odea2-v0.2.0-fase1`).

## Correr los tests

```bash
npm test
```

**48 tests** (Node ≥ 20):

- **33 de Fase 0**: no-pérdida, paridad de los 10 componentes de XP, monedas,
  `eventRL`/`farm`/`canje`, cuarentena, aborto, reimportación, huella, ida y
  vuelta y los tests negativos de los tres críticos.
- **15 de Fase 1**: ida y vuelta en almacenamiento, forma exacta del bundle
  (36 + 11), rechazo sin críticos, restauración de `odea2_bundle_v1`,
  rechazo del segundo import de ODEA 1, respaldo previo, detección de formato
  y rotación de backups a los últimos 3.

## Qué hace la app

1. **Importar progreso de ODEA 1** (`odea_bundle_v2`): valida con el catálogo
   de juego y aplica D1–D5.
   - Totales que no reconcilian → **aborta sin escribir**.
   - Estructura incompleta → **cuarentena** con reporte y confirmación explícita.
   - Se guarda en **una sola clave**: `odea2_bundle_v1`.
   - Un segundo import se rechaza; solo «reset + reimportar» con backup previo.
2. **Exportar respaldo**: descarga el `odea2_bundle_v1` actual.
3. **Restaurar respaldo** (`odea2_bundle_v1`): ruta distinta de la migración,
   con backup automático del save actual y confirmación explícita.

### Retención de respaldos

Los respaldos automáticos del save (`odea2_backup_save_*`) se rotan a los
**últimos 3**: al crear el cuarto se elimina el más viejo. El respaldo del
archivo de ODEA 1 importado (`odea2_backup_source_*`) **nunca** se rota. Para
conservar una copia puntual, usá «Exportar respaldo» antes.

Todo ocurre en el dispositivo. Nada se envía a ningún servidor.

## Estructura

```
index.html              pantalla única
manifest.webmanifest    PWA (ODEA 2 — Costa Neón)
sw.js                   service worker versionado
css/app.css             tema oscuro neón
js/                     UI, importador y adaptadores del navegador
src/                    lógica de migración/validación de Fase 0 (reutilizada)
data/xp-catalog.json    catálogo estático de juego (sin progreso de usuario)
fixtures/               bundle sintético (36 campos + 11 claves, valores falsos)
tests/                  Fase 0 + Fase 1
```

`js/` no reimplementa la validación: importa `src/shape.js`, `src/migrate.js`,
`src/derive.js`, `src/validate.js` y `src/storage.js` directamente.

## Documentos

| Archivo | Contenido |
|---|---|
| `MIGRATION_SPEC.md` | Mapa de los 36 campos + 11 claves, decisiones D1–D5 y contrato de validación. |
| `SCHEMA_ODEA2_V1.md` | Schema `odea2_bundle_v1` con secciones `core` / `worlds` / `legacy`. |
| `RISK_LIST.md` | Campos en riesgo, decisiones cerradas/abiertas, versionado y caché PWA. |

## Decisiones registradas

| Ámbito | Decisión |
|---|---|
| Service worker | **Fase 2**: aviso «Hay una versión nueva» con botón **Recargar**. La actualización se aplica solo cuando el usuario la toca; nunca recarga forzada ni silenciosa a mitad de uso. |
| Backups | **Fase 1, implementada**: rotación a los últimos 3 respaldos de save; el backup del origen nunca se rota. |
| Multi-pestaña | **Fase 2**: listener del evento `storage`; si otra pestaña escribió el save, aviso y recarga del estado desde `localStorage`. Sin bloqueos distribuidos. |
| GitHub Pages | Al **cerrar Fase 1**: verificación externa → merge de los PRs a `main` → activar Pages desde `main`. No se activa durante la fase. |

## Datos personales

El bundle real del usuario **nunca** se publica ni se sube a ningún servidor.
`.gitignore` bloquea `odea-progreso-*.json` y `*progreso-real*`, con excepción
del fixture sintético (`fixtures/odea-progreso-sintetico.json`).
