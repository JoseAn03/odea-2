# ODEA 2 — Costa Neón

**Fase 2: la ciudad 2D cenital, dibujada sobre tu progreso real.**
La ciudad se ve, se recorre y muestra el estado real de cada sistema importado
desde ODEA 1. **Las misiones todavía no se juegan** dentro de la ciudad: eso es
la Fase 3. Esta fase es de **solo lectura** sobre el save.

No hay frameworks ni assets externos: toda la ciudad se dibuja por código con
Canvas 2D, sobre la paleta oficial (`#12081F`, `#FF2E93`, `#00E5FF`, `#FF8A3D`).

## Estado de las fases

| Fase | Estado | Contenido |
|---|---|---|
| **Fase 0** | ✅ completa | Especificación de la migración (36 campos + 11 claves), decisiones D1–D5, código de validación y 33 tests. |
| **Fase 1** | ✅ completa | PWA instalable, importación con validación/cuarentena/aborto, respaldo y restauración. |
| **Fase 2** | ✅ esta rama (`fase2-ciudad`) | Ciudad 2D cenital con HUD, distritos y paneles de datos reales. Sin misiones. |
| Fase 3 | 📋 decidida, no iniciada | Hub (tutorial + bucle diario), luego Empleo y Vida jugables. El resto sigue de solo lectura. Arranca solo con la Fase 2 verificada. |
| Fase 4+ | pendiente | Resto de distritos jugables. |

## Correr la app en local

Los módulos ES y el service worker **no funcionan con `file://`**: hace falta un
servidor HTTP.

```bash
# opción 1
npx serve .

# opción 2 (Python)
python -m http.server 8080
```

Abrí la URL que indique el servidor (por ejemplo `http://localhost:3000`) y
seguí estos pasos:

1. Importá un export de ODEA 1 (`odea_bundle_v2`) con «Importar mi progreso».
2. La ciudad se enciende y el HUD queda visible con tus datos reales.
3. Arrastrá con el mouse/dedo para recorrer, pellizcá o usá la rueda para zoom.
4. Tocá un distrito en el mapa (o su chip abajo) para abrir su panel.

Sin save, la ciudad se muestra atenuada y la pantalla de importación de la
Fase 1 queda al frente. No hay datos de ejemplo: el progreso siempre es el real.

La app funciona sin conexión después de la primera carga (service worker
`odea2-v0.3.0-fase2`). El catálogo de juego se sirve con estrategia
*network-first* y cae a la caché si no hay red.

## Correr los tests

```bash
npm test
```

**61 tests** (Node ≥ 20):

- **33 de Fase 0**: no-pérdida, paridad de los 10 componentes de XP, monedas,
  `eventRL`/`farm`/`canje`, cuarentena, aborto, reimportación, huella, ida y
  vuelta y los tests negativos de los tres críticos.
- **15 de Fase 1**: ida y vuelta en almacenamiento, forma exacta del bundle
  (36 + 11), rechazo sin críticos, restauración de `odea2_bundle_v1`,
  rechazo del segundo import de ODEA 1, respaldo previo, detección de formato
  y rotación de backups a los últimos 3.
- **13 de Fase 2**: mapeo completo y sin duplicados de los 10 componentes de XP
  y las 11 claves; celdas de distrito únicas y sin solapes; paridad del HUD con
  `src/derive.js`; crédito permanente = evento + farm; paneles con cifras del
  save; watchers de versión nueva y multi-pestaña con eventos simulados; la capa
  visual no escribe el bundle (byte a byte); versión de app/SW/paquete
  sincronizada.

## La ciudad: distritos y mapeo cerrado

Cada sistema existente tiene **exactamente un hogar**. La tabla es la fuente de
verdad y está cubierta por tests.

| Distrito | Zona | Claves legacy | Componentes de XP | Qué muestra el panel |
|---|---|---|---|---|
| **El Hub** | Plaza Central | `hub`, `events`, `juice` | `ach`, `evento`, `farm` | Jugador, nivel, XP total, racha, campaña/diarias/semanales/logros, recompensas pendientes, **Monumento al Crédito Permanente** (`evento + farm`), eventos archivados y preferencias. |
| **Distrito IA** | Zona Franca de Heredia | `academia` | — | Actividades de Academia completadas y rutas avisadas. |
| **Distrito Empleo** | Centro Financiero | `empleo` | `career`, `hunt` | XP de carrera y cacería, postulaciones, vacantes, seguimientos, racha de cacería, trabajos/B2B/puente. |
| **Barrio Vida** | Zona residencial | — | `vida`, `diary`, `focus` | XP de vida, registros, racha, entradas de diario y sesiones de enfoque. |
| **La Torre** | Capital | — | `capital` | XP de capital y módulos completados de ahorro, inglés e IA. |
| **El Mercado** | Tesoro y tienda | `tesoro` | — | Balance (ganadas − gastadas), objetos comprados/equipados, monedas/racha/escudos del tesoro y canjes reales. |
| **El Garaje** | Zona Industrial | `garaje` | — | Kilómetros de carro y moto, misiones de vehículo y accesorios. |
| **Mirador de Sagas** | Sagas y jefes | `sagas`, `jefe` | `bosses` | Capítulos de sagas (5 + 7 del catálogo), saga semanal, jefes derrotados y victorias semanales. |
| **Rincón Anomalía** | Esquina con glitch | `anomalia`, `quiz` | — | Anomalía activa y el archivo legacy del quiz, siempre marcado como **archivado** (no cuenta como progreso activo). |

Notas de mapeo:

- `events` es el log de auditoría y `juice` son preferencias de sonido: no son
  sistemas de juego, por eso viven en El Hub.
- `odea_empleo_v2` y `odea_quiz_v1` son legacy archivado; se conservan y se
  muestran como archivo, nunca como progreso activo.
- Los porcentajes solo se calculan cuando el catálogo aporta el denominador
  real (`campaign`, `daily`, `weekly`, `jobs`, `b2b`, `puente`,
  `achievements`, `bosses`, `capital`, sagas). En el resto se muestran conteos.

## HUD e interacción

- **HUD superior**: nombre, nivel de campaña, nivel ODEA, barra de XP con
  `XP actual / próximo umbral` según `odeLadder`, balance de monedas
  (ganadas − gastadas), racha y accesos a «Respaldo» y «Mi progreso».
- **Chips inferiores**: acceso directo a los 9 distritos.
- **Panel de distrito**: hoja inferior en móvil (panel lateral en pantallas
  anchas) con descripción, cifras reales y la leyenda:
  «Las misiones de este distrito se juegan aquí a partir de la Fase 3».
- **Cámara**: arrastre con touch/mouse, pellizco y rueda, con límites suaves.
  El marcador del jugador aparece en El Hub al abrir.
- **Animación**: `requestAnimationFrame`, pausada con la pestaña oculta y sin
  parpadeos ni tráfico en movimiento si el sistema pide
  `prefers-reduced-motion`.
- **Aviso de versión nueva**: el SW espera; la actualización se aplica solo al
  tocar «Recargar» (nunca `skipWaiting` silencioso). El service worker instala
  la versión nueva pero no toma el control hasta esa acción.
- **Multi-pestaña**: un listener del evento `storage` sobre
  `odea2_bundle_v1` avisa «Tu progreso cambió en otra pestaña» y recarga el
  estado desde `localStorage`.

## Qué hace la app

1. **Importar progreso de ODEA 1** (`odea_bundle_v2`): valida con el catálogo
   de juego y aplica D1–D5.
   - Totales que no reconcilian → **aborta sin escribir**.
   - Estructura incompleta → **cuarentena** con reporte y confirmación explícita.
   - Se guarda en **una sola clave**: `odea2_bundle_v1`.
   - Un segundo import se rechaza; solo «reset + reimportar» con backup previo.
2. **Ver la ciudad y los paneles**: derivación con `src/derive.js` (sin lógica
   duplicada). Ningún módulo visual escribe el save; los tests lo verifican
   comparando el bundle byte a byte antes y después de abrir todos los paneles.
3. **Exportar respaldo**: descarga el `odea2_bundle_v1` actual desde el HUD.
4. **Restaurar respaldo** (`odea2_bundle_v1`): ruta distinta de la migración,
   con backup automático del save actual y confirmación explícita. Vive en
   «Mi progreso» junto al estado de la Fase 1.

### Retención de respaldos

Los respaldos automáticos del save (`odea2_backup_save_*`) se rotan a los
**últimos 3**: al crear el cuarto se elimina el más viejo. El respaldo del
archivo de ODEA 1 importado (`odea2_backup_source_*`) **nunca** se rota. Para
conservar una copia puntual, usá «Exportar respaldo» antes.

Todo ocurre en el dispositivo. Nada se envía a ningún servidor.

## Estructura

```
index.html              cascarón: canvas, HUD, chips, hoja, overlay y toasts
manifest.webmanifest    PWA (ODEA 2 — Costa Neón)
sw.js                   service worker versionado (odea2-v0.3.0-fase2)
css/app.css             tema neón + capa de ciudad (HUD, hoja, overlay, toasts)
js/app.js               orquestador: ciudad, HUD, importación, watchers
js/city/                layout, world, cámara, renderer, entrada y motor rAF
js/districts.js         los 9 distritos, paleta y mapeo XP/claves → distrito
js/hud.js               modelo del HUD derivado del save (sin DOM)
js/hud-ui.js            HUD, chips y hoja de distrito (DOM)
js/district-figures.js  cifras reales de cada panel (sin DOM)
js/toast.js             avisos efímeros y aviso de versión nueva
js/update-watcher.js    versión nueva: aviso + SKIP_WAITING a pedido
js/storage-watch.js     listener multi-pestaña
js/ui.js                pantallas de estado/importación de Fase 1 (overlay)
js/importer.js          puente de solo lectura/escritura hacia src/storage.js
js/browser-storage.js   adaptador de localStorage
src/                    lógica de migración/validación de Fase 0 (reutilizada)
data/xp-catalog.json    catálogo estático de juego (sin progreso de usuario)
fixtures/               bundle sintético (36 campos + 11 claves, valores falsos)
tests/                  Fase 0 + Fase 1 + Fase 2
```

`js/` no reimplementa la validación: importa `src/shape.js`, `src/migrate.js`,
`src/derive.js`, `src/validate.js` y `src/storage.js` directamente. La única
capa que escribe el save es `src/storage.js`, a través de `js/importer.js`.

## Documentos

| Archivo | Contenido |
|---|---|
| `MIGRATION_SPEC.md` | Mapa de los 36 campos + 11 claves, decisiones D1–D5 y contrato de validación. |
| `SCHEMA_ODEA2_V1.md` | Schema `odea2_bundle_v1` con secciones `core` / `worlds` / `legacy`. |
| `RISK_LIST.md` | Campos en riesgo, decisiones cerradas/abiertas, versionado y caché PWA. |

## Decisiones registradas

| Ámbito | Decisión |
|---|---|
| Service worker | **Fase 2, implementada**: aviso «Hay una versión nueva» con botón **Recargar**. La actualización se aplica solo cuando el usuario la toca; nunca recarga forzada ni silenciosa a mitad de uso. |
| Backups | **Fase 1, implementada**: rotación a los últimos 3 respaldos de save; el backup del origen nunca se rota. |
| Multi-pestaña | **Fase 2, implementada**: listener del evento `storage`; si otra pestaña escribió el save, aviso y recarga del estado desde `localStorage`. Sin bloqueos distribuidos. |
| GitHub Pages | La Fase 1 se publicó tras verificación externa. La Fase 2 **no** toca Pages ni se mergea hasta la revisión del PR. |
| Solo lectura | **Fase 2**: la ciudad, el HUD y los paneles leen el save y derivan con `src/derive.js`; no mutan `odea2_bundle_v1`. |

### Fase 3 (decidida, no iniciada)

Registrada en `RISK_LIST.md` §3.2. **No se implementa hasta que la Fase 2 esté
verificada.**

- **Navegación**: las misiones se abren **desde la hoja del distrito**; la hoja
  se expande a una vista completa del sistema sobre la ciudad, que queda visible
  y atenuada detrás. Un solo mundo continuo: al cerrar, se vuelve al mapa en el
  mismo lugar (cámara y selección preservadas).
- **Orden**: primero **El Hub** (tutorial y bucle diario: ruta del día,
  check-in, racha) para probar la escritura de punta a punta; después **Empleo**
  y **Vida**. Los demás distritos siguen de solo lectura hasta la Fase 4.
- **Escritura**: todo pasa por `src/storage.js`, con backup previo y rotación de
  los últimos 3. XP y monedas siempre derivados (nunca se editan totales);
  validación fail-closed; completaciones idempotentes por ID; cada tipo de
  escritura con test de ida y vuelta y test negativo. La cuarentena sigue siendo
  exclusiva de importación/restauración.

## Datos personales

El bundle real del usuario **nunca** se publica ni se sube a ningún servidor.
`.gitignore` bloquea `odea-progreso-*.json` y `*progreso-real*`, con excepción
del fixture sintético (`fixtures/odea-progreso-sintetico.json`).
