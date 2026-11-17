# ODEA 2 — Costa Neón

**v0.27.1-fase7 · la ciudad, el día y las campañas sobre tu progreso real de ODEA 1.**

La app es estática (sin frameworks, sin dependencias, sin build): toda la ciudad
se dibuja por código con Canvas 2D sobre la paleta oficial (`#12081F`,
`#FF2E93`, `#00E5FF`, `#FF8A3D`) y el progreso vive en el `localStorage` del
navegador, en una sola clave. Sobre esa base se juegan el **Hub**, **Empleo**,
**Vida**, **La Torre**, **Mirador de Sagas**, **Distrito IA**, las **campañas
profesionales** (El Brete y Zona Gamer), la **Tienda** y las **Misiones
Diarias**; **El Garaje** y **Rincón Anomalía** siguen en solo lectura porque su
catálogo no está extraído (ver `docs/FASE4_DOMINIOS.md`).

- Versión publicada: **0.27.1-fase7** (insignia de la esquina inferior).
- PWA instalable y offline después de la primera carga.
- 268 pruebas automatizadas, sin dependencias, más tres comprobaciones de
  contrato que corren en CI (ver [Probar el proyecto](#probar-el-proyecto)).

## Estado de las fases

| Fase | Estado | Contenido |
|---|---|---|
| **0** | ✅ completa | Especificación de la migración (36 campos + 11 claves), decisiones D1–D5, validación y 33 tests. |
| **1** | ✅ completa | PWA instalable, importación con validación/cuarentena/aborto, respaldo y restauración verificada. |
| **2** | ✅ completa | Ciudad 2D cenital con HUD, distritos y paneles de datos reales. |
| **3** | ✅ completa | Hub, Empleo, Vida, La Torre y Sagas jugables: sección `play`, escritura única, ruta del día, idempotencia por frecuencia y racha derivada. |
| **4** | ✅ completa salvo dos distritos | Academia, Capital, Sagas y Empleo con paridad. **Garaje** y **Anomalía** quedan bloqueados: su catálogo no está en el catálogo que juega la app. |
| **5** | ✅ completa | Rendimiento de la ciudad (caché estático del lienzo, 30 FPS, pausa por cobertura) e identidad Vice City con la economía ₡. |
| **6** | ✅ completa y luego **retirada** | Sincronización opcional con Google Drive (v0.20–v0.26). Se **eliminó en v0.27.0** a pedido del jugador: el respaldo es manual, por archivo. |
| **7** | ✅ completa | La Tienda (Palí pixel art, atuendos y vehículos), el panel de Diarias en **Hoy**, caminar con flechas/WASD en PC y la salida de Google Drive. |

Las fases 4–7 llegaron por PRs con su verificación en el cuerpo del PR; las
decisiones que las cierran están registradas en `RISK_LIST.md` §3.4.

## Correr la app en local

Los módulos ES y el service worker **no funcionan con `file://`**: hace falta un
servidor HTTP.

```bash
python -m http.server 8080    # o: npx serve .
```

1. Importá un export de ODEA 1 (`odea_bundle_v2`) con «Importar mi progreso», o
   empezá una partida vacía desde ese mismo panel.
2. La ciudad se enciende y el HUD queda visible con tus datos reales.
3. Arrastrá con el mouse/dedo para recorrer, pellizcá o usá la rueda para zoom.
4. Tocá un distrito en el mapa (o abrí el **Teléfono** y usá su **Mapa**) para
   entrar a su panel.

La app funciona sin conexión después de la primera carga: el service worker
**precachea el cascarón completo, incluido el catálogo** (`sw.js`), y sirve el
catálogo con estrategia *network-first* con tiempo límite, cayendo a la caché si
no hay red.

## Probar el proyecto

```bash
npm test                  # 268 pruebas + guarda contra "verde con 0 tests"
npm run check:write-path  # una sola ruta de escritura del save
npm run check:ui          # renderiza TODA la interfaz y comprueba que no escribe
```

Los tres pasos son obligatorios en CI (`.github/workflows/ci.yml`), en Node 20,
22 y 24.

Qué cubre cada barrera:

- **Suite** (27 archivos): migración sin pérdida, paridad de XP y monedas,
  cuarentena y aborto, escritura única con backup verificado byte a byte,
  idempotencia por frecuencia real, recompensas congeladas (R1), racha derivada,
  rendimiento con 14.700 ocurrencias, campañas, Tienda, Diarias, Academia,
  Sagas, Capital, Empleo, Vida, extras de interfaz y accesibilidad de los
  componentes.
- **Ruta de escritura**: análisis real, no un grep de una línea. Quita
  comentarios respetando cadenas, busca la clave por sus partes (constante,
  concatenación, plantilla), prohíbe `STORAGE_KEYS`, las llamadas al escritor y
  `localStorage` fuera de sus dueños, y recorre también la raíz y los `.mjs`.
  Sus 16 tests son las diez evasiones que el gate viejo dejaba pasar.
- **Interfaz completa**: monta un DOM mínimo y renderiza HUD, Hoy, Mochila,
  Menú, los 9 distritos, las campañas, el teléfono y la Tienda; verifica que
  renderizar no escriba el save y que ninguna pantalla invente misiones.

## La ciudad: distritos y mapeo cerrado

Cada sistema existente tiene **exactamente un hogar**. La tabla es la fuente de
verdad y está cubierta por tests.

| Distrito | Zona | Claves legacy | Componentes de XP | Qué muestra el panel |
|---|---|---|---|---|
| **El Hub** | Plaza Central | `hub`, `events`, `juice` | `ach`, `evento`, `farm` | Jugador, nivel, XP total, racha, campaña/diarias/semanales/logros, recompensas pendientes, **Monumento al Crédito Permanente** (`evento + farm`), eventos archivados y preferencias. |
| **Distrito IA** | Zona Franca de Heredia | `academia` | — | Actividades de Academia completadas, rutas y sinergia del Tesoro. |
| **Distrito Empleo** | Centro Financiero | `empleo` | `career`, `hunt` | XP de carrera y cacería, postulaciones, vacantes, seguimientos, racha de cacería, trabajos/B2B/puente. |
| **Barrio Vida** | Zona residencial | — | `vida`, `diary`, `focus` | XP de vida, registros, racha, entradas de diario y sesiones de enfoque. |
| **La Torre** | Capital | — | `capital` | XP de capital y módulos completados de ahorro, inglés e IA. |
| **El Mercado** | Tesoro y tienda | `tesoro` | — | Balance (ganadas − gastadas), objetos comprados/equipados, monedas/racha/escudos del tesoro y canjes reales. |
| **El Garaje** | Zona Industrial | `garaje` | — | Kilómetros de carro y moto, misiones de vehículo y accesorios (solo lectura). |
| **Mirador de Sagas** | Sagas y jefes | `sagas`, `jefe` | `bosses` | Capítulos de sagas (5 + 7 del catálogo), saga semanal, jefes derrotados y victorias semanales. |
| **Rincón Anomalía** | Esquina con glitch | `anomalia`, `quiz` | — | Anomalía activa y el archivo legacy del quiz, siempre marcado como **archivado**. |

Notas de mapeo:

- `events` es el log de auditoría y `juice` son preferencias de sonido: no son
  sistemas de juego, por eso viven en El Hub.
- `odea_empleo_v2` y `odea_quiz_v1` son legacy archivado; se conservan y se
  muestran como archivo, nunca como progreso activo.
- Los porcentajes solo se calculan cuando el catálogo aporta el denominador
  real (`campaign`, `daily`, `weekly`, `jobs`, `b2b`, `puente`,
  `achievements`, `bosses`, `capital`, sagas). En el resto se muestran conteos.

## Navegación: cuatro destinos

Barra inferior fija con cuatro destinos (decisión F3-5), más **Teléfono** y
**Caminar**, que viven en la misma barra: cinco botones en total, en un carril
del mismo ancho cada uno.

| Destino | Qué hace |
|---|---|
| **Ciudad** | El mapa. Aquí se elige distrito tocándolo, o desde el mapa del teléfono. |
| **Hoy** | Abre el panel de Diarias: misma interfaz y misma ruta que el teléfono. |
| **Mochila** | Nivel, XP por componente, equipo, racha y monedas. Solo lectura. |
| **Menú** | Exportar respaldo, restaurar o importar archivo y versión. |
| **Teléfono** | La misma ciudad en formato móvil: misiones, El Brete, Zona Gamer, Tienda, mapa, inventario y ajustes. |
| **Caminar** | Modo paseo: el avatar recorre la ciudad con arrastre, palanca o flechas/WASD en PC. |

Sin save la barra no existe: la pantalla de importación de la Fase 1 sigue siendo
la única entrada. Cerrar cualquier capa vuelve a Ciudad y el foco regresa al
control que la abrió.

> La fila de los 9 chips bajo el HUD (propuesta F3-5) está **implementada y
> probada en `renderChips`, pero todavía no montada**: hoy se llega a los
> distritos por el mapa o por el mapa del teléfono. Montarla cambia el encaje
> visual del mapa y es una decisión pendiente, no un olvido.

## La ciudad responde

`js/ambience.js` produce un **perfil visual de solo lectura** a partir de la
hora, la fecha y el progreso. El renderizador lo consume; nada de eso toca el
save.

| Señal | Efecto | Límite |
|---|---|---|
| Hora local | Día, atardecer o noche: tinte y luces | No cambia elegibilidad ni recompensas |
| Fecha (semilla) | Clima ficticio estable del día | No se presenta como clima real |
| Progreso del distrito | Más ventanas encendidas | Umbrales fijos: 0 sin actividad, 1 con XP migrado, 2 con completaciones nuevas |
| Movimiento reducido | Mitad de vehículos | Antes de tocar cualquier interacción |

Es determinista: la misma fecha y hora dan el mismo perfil, también tras recargar.

## Rendimiento

- El lienzo se dibuja a **30 FPS** con caché estático del mundo: la ciudad se
  pre-renderiza a un canvas fuera de pantalla y solo se repintan las capas vivas
  mientras la cámara no cambie de detalle.
- El rAF se pausa con la pestaña oculta y cuando el mapa queda cubierto por el
  teléfono, la hoja o un panel.
- El catálogo (100 KB, 16 KB gzip) entra en el precache y se revalida con
  `network-first` y 4 s de tiempo límite: un `fetch` colgado ya no puede dejar
  el arranque en la pantalla fatal.

## HUD e interacción

- **HUD superior**: nombre, nivel de campaña, nivel ODEA, barra de XP con
  `XP actual / próximo umbral` según `odeLadder`, balance de monedas
  (ganadas − gastadas) y racha. Sin acciones: exportar e importar viven en Menú.
- **Panel de distrito**: hoja inferior en móvil (panel lateral en pantallas
  anchas) con descripción, cifras reales y las misiones jugables del sistema.
- **Cámara**: arrastre con touch/mouse, pellizco, rueda y —en PC— flechas/WASD
  en modo caminar (v0.26.0).
- **Animación**: `requestAnimationFrame`, pausada con la pestaña oculta y sin
  parpadeos ni tráfico en movimiento si el sistema pide
  `prefers-reduced-motion`.
- **Aviso de versión nueva**: el SW espera; la actualización se aplica solo al
  tocar «Recargar» (nunca `skipWaiting` silencioso).
- **Multi-pestaña**: un listener del evento `storage` sobre la clave del save
  avisa y recarga el estado desde `localStorage`.
- **Exclusión de escritura**: cada mutación corre dentro de un **Web Lock**
  exclusivo de origen (`odea2:gameplay-write`). Si el navegador no expone Web
  Locks, el CAS sigue fallando cerrado por operación (`CONCURRENT_CHANGE`) y el
  resultado informa `locked: false`.
- **Capas accesibles**: hoja y overlay son diálogos (`role`, `aria-modal`,
  `tabindex`), el foco está atrapado dentro y vuelve a la capa tras cada
  repintado, y el skip link solo existe cuando hay HUD.

## Qué hace la app

1. **Importar progreso de ODEA 1** (`odea_bundle_v2`): valida con el catálogo
   de juego y aplica D1–D5.
   - Totales que no reconcilian → **aborta sin escribir**.
   - Estructura incompleta → **cuarentena** con reporte y confirmación explícita.
   - Se guarda en **una sola clave**.
   - Un segundo import se rechaza; solo «reset + reimportar» con backup previo.
2. **Jugar**: Hub (diarias, check-in, racha), Empleo, Vida, Capital, Sagas,
   Academia y las dos campañas profesionales. Toda escritura pasa por
   `applyGameplayMutation` (`src/storage.js`): backup exacto verificado byte a
   byte, validación fail-closed, relectura y rollback.
3. **Exportar respaldo** desde **Menú** (descarga el save actual, con evidencia
   y notas incluidas). Desde v0.27.0 es la **única** forma de sacar la partida
   del dispositivo.
4. **Restaurar respaldo** (`odea2_bundle_v1`): valida el archivo, respalda el
   save actual **y verifica ese backup byte a byte** antes de reemplazarlo
   (v0.27.1); si la relectura no coincide, revierte.

### Retención de respaldos

Los respaldos automáticos del save (`odea2_backup_save_*`) se rotan a los
**últimos 3**: al crear el cuarto se elimina el más viejo. El respaldo del
archivo de ODEA 1 importado (`odea2_backup_source_*`) **nunca** se rota. Para
conservar una copia puntual, usá «Exportar respaldo» antes.

## Privacidad

- **La partida no sale del dispositivo.** Vive en el `localStorage` de ese
  navegador y ese origen; `Exportar respaldo` la escribe en un archivo que
  elegís vos.
- **La app no hace peticiones de red para guardar ni para jugar.** No hay
  cuentas, ni analítica, ni telemetría, ni publicidad, ni scripts de terceros.
  Solo carga sus propios archivos desde el mismo origen.
- **Desde v0.27.0 no hay sincronización con Google Drive.** Se retiró a pedido
  del jugador; al abrir la app se borra la metadata (`odea2_sync_v1`) que esa
  función pudo dejar en el aparato. La partida nunca se tocó en esa limpieza.
- El respaldo exportado **incluye** tu nombre de jugador, las notas de
  evidencia de las campañas y las postulaciones que registres: tratalo como un
  archivo personal y no lo subas a ningún repo.
- `.gitignore` bloquea `odea-progreso-*.json` y `*progreso-real*`, con excepción
  del fixture sintético (`fixtures/odea-progreso-sintetico.json`).

## Estructura

```
index.html              cascarón: canvas, HUD, barra de destinos, hoja, overlay, teléfono y toasts
manifest.webmanifest    PWA (ODEA 2 — Costa Neón)
sw.js                   service worker versionado (odea2-v0.27.1-fase7)
css/app.css             tema neón + capa de ciudad (HUD, hoja, overlay, teléfono, toasts)
css/campaign.css        capa de campañas, diarias y tienda
js/app.js               orquestador: ciudad, HUD, importación, campañas, watchers
js/city/                layout, world, cámara, renderer, pixel art, entrada y motor rAF
js/districts.js         los 9 distritos, paleta y mapeo XP/claves → distrito
js/hud.js               modelo del HUD, Hoy y Mochila derivados del save (sin DOM)
js/hud-ui.js            HUD, barra de destinos, chips, hoja y misiones del día (DOM)
js/ui.js                pantallas de estado, importación, Menú, Personaje y respaldos
js/campaign-ui.js       El Brete, Zona Gamer y Diarias (DOM)
js/shop-ui.js           la Tienda (DOM)
js/ambience.js          perfil visual por hora/clima/progreso (solo lectura)
js/tabs.js              contrato de los 4 destinos (puro, sin DOM)
js/toast.js             avisos efímeros y aviso de versión nueva
js/update-watcher.js    versión nueva: aviso + SKIP_WAITING a pedido
js/storage-watch.js     listener multi-pestaña
js/importer.js          puente hacia src/storage.js (la única capa que escribe)
js/browser-storage.js   adaptador de localStorage (y limpieza de metadata vieja)
src/                    migración, validación, derivación, gameplay, tienda, campañas
data/xp-catalog.json    catálogo estático de juego (sin progreso de usuario)
fixtures/               bundle sintético (36 campos + 11 claves, valores falsos)
tests/                  27 archivos, 268 pruebas
tools/                  gates (ruta de escritura, tests, smoke), extractores y fixture
```

`js/` no reimplementa la validación: importa `src/shape.js`, `src/migrate.js`,
`src/derive.js`, `src/validate.js` y `src/storage.js` directamente. La única
capa que escribe el save es `src/storage.js`, y `check:write-path` lo verifica
en cada push.

## Documentos

| Archivo | Contenido |
|---|---|
| `MIGRATION_SPEC.md` | Mapa de los 36 campos + 11 claves, decisiones D1–D5 y contrato de validación. |
| `SCHEMA_ODEA2_V1.md` | Schema `odea2_bundle_v1` con secciones `core` / `worlds` / `legacy` y la sección aditiva `play`. |
| `RISK_LIST.md` | Campos en riesgo, decisiones cerradas (§3.1–§3.4), versionado y caché PWA. |
| `docs/FASE3_SPEC.md` | Spec de Fase 3: sección `play`, escritura única, ruta del día, racha y cámara. |
| `docs/FASE4_DOMINIOS.md` | Fichas de los seis dominios restantes y por qué Garaje y Anomalía siguen bloqueados. |
| `docs/FASE4_EXTRACCION.md` | Extracción de catálogos de ODEA 1 y su procedencia. |
| `docs/R1_RECOMPENSAS.md` | Recompensas congeladas y compatibilidad de `play` v1/v2/v3. |
| `LEEME-PRIMERO.md` | Guía de instalación de la entrega **0.18.0** (documento histórico). |
| `VERIFICACION.md` | Verificación de la entrega **0.18.0** (documento histórico). |

## Decisiones registradas

| Ámbito | Decisión |
|---|---|
| Service worker | Aviso «Hay una versión nueva» con botón **Recargar**. La actualización se aplica solo cuando el usuario la toca; nunca recarga forzada. `CACHE_VERSION` sube en cada release y `activate` borra los cachés viejos. |
| Catálogo | Entra en el precache (v0.27.1) y se revalida en línea con `network-first` y 4 s de límite: primer arranque offline cubierto. |
| Backups | Rotación a los últimos 3 respaldos de save; el del origen nunca se rota. Restaurar exige backup exacto y relectura (v0.27.1). |
| Multi-pestaña | Listener del evento `storage` + **Web Locks** sobre toda la mutación, con CAS de fallback. |
| GitHub Pages | Publicado desde `main`; cada push dispara CI y despliegue. |
| Respaldo | **Manual por archivo** (v0.27.0): exportar/restaurar desde Menú. Sin nube, sin cuentas. |
| Navegación | Cuatro destinos + Teléfono + Caminar, en una sola barra de cinco botones. |
| Gameplay | Ruta del día, completaciones idempotentes por frecuencia real, XP y monedas derivados, racha derivada. |

## Datos personales

El bundle real del usuario **nunca** se publica ni se sube a ningún servidor:
solo se escribe en un archivo cuando el jugador lo exporta. `.gitignore` bloquea
`odea-progreso-*.json` y `*progreso-real*`, con excepción del fixture sintético
(`fixtures/odea-progreso-sintetico.json`).
