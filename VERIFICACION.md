# Verificación de la entrega — v0.18.0-fase4

## Base

Código público de `JoseAn03/odea-2`, commit
`b1f452e7b0325bae2d5765191789b2dbca45c0e7`, descargado para esta actualización.
No se modificó el repositorio remoto ni GitHub Pages.

## Comprobaciones automatizadas

- Suite del proyecto: **237 pruebas**, sin fallos.
- Renderizado determinista de pantallas heredadas: **21 comprobaciones**,
  sin fallos.
- Comprobación de sintaxis de todos los módulos de `js` y `src`: sin errores.
- Guardia de escritura: **sólo `src/storage.js` escribe la clave de partida**.

Las pruebas nuevas cubren las dos campañas completas (96 misiones), una
partida realmente vacía, bloqueo de prerrequisitos, evidencia mínima,
idempotencia, premios elegidos por el dominio, monedas y XP derivados,
125 postulaciones el mismo día, doble toque, contador desactualizado,
concurrencia entre pestañas, recarga, exportación/restauración del bundle,
estado corrupto, UI en modo normal/compacto, navegación entre capítulos,
errores sin premio, continuidad mapa/teléfono y hit testing de las zonas.

También verifican que los recursos y módulos precacheados existan y que las
campañas no cambien los créditos permanentes de los eventos retirados.

## Contrato de guardado

La novedad se almacena en `play.campaigns` con versión propia 1:

- `completions`: una clave por misión, nota de evidencia, fecha, recompensa
  congelada y versión de reglas.
- `applications`: una clave idempotente por registro deliberado, empresa,
  puesto y nota opcionales, fecha y recompensa congelada.

Los datos migrados en `core` (excepto su snapshot derivado), `worlds` y
`legacy` permanecen intactos. Las campañas suman XP de carrera; las
postulaciones suman XP de cacería. Se mantiene el desglose histórico de diez
componentes y no se reutiliza el crédito de un evento retirado.

No se cambió el límite de almacenamiento del navegador. No hay un tope
artificial de postulaciones; si se agota la cuota, la escritura falla y no
se muestra un premio exitoso.

## Límite de esta verificación

Las pruebas de DOM son deterministas en Node: comprueban controles,
contenido y eventos, no geometría ni apariencia real del navegador.
Se revisaron las dos ilustraciones generadas, pero **no se realizó una
validación visual del proyecto actualizado en un navegador desplegado ni
en un teléfono físico**.

Se intentó el validador de Website de Skywork. No pudo ejecutarse porque
este repositorio externo de GitHub Pages no es un proyecto Website
administrado: `PROJECT_NOT_INITIALIZED`, fase `manifest`, no reintentable.
Se mantuvo su arquitectura original y se usaron sus pruebas nativas para
entregar el ZIP. No se creó otra web ni se reemplazó el juego por una
plantilla. No hay una URL nueva de vista previa.

## Revisión manual al publicarlo

1. Respaldar la partida y comprobar la versión `0.18.0-fase4`.
2. Abrir El Brete y Zona Gamer desde el mapa y desde el teléfono.
3. Completar una misión con una nota real, recargar y comprobar premio
   único, nota y siguiente misión.
4. Registrar una postulación, comprobar el efecto de acierto, el contador,
   el HUD y el historial; intentar doble toque.
5. Revisar ancho de 320 px, orientación horizontal, teclado del móvil,
   scroll del teléfono, navegación con Tab/Escape y movimiento reducido.
6. Exportar y restaurar un respaldo de prueba para comprobar continuidad.
7. Volver a los distritos anteriores y comprobar sus tareas e inventario.

No usar una partida personal para ensayos destructivos de restauración.
