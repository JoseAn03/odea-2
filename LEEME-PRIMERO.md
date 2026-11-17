# ODEA 2 · Costa Neón — Campañas profesionales

> **Documento histórico — entrega 0.18.0-fase4 (17 nov 2026).**
> La versión publicada hoy es **0.27.1-fase7**: la navegación, el teléfono, la
> Tienda, las Diarias y los respaldos cambiaron después de esta guía, y la
> sincronización con Drive se retiró en v0.27.0. El estado actual y la política
> de privacidad vigente están en `README.md`. Se conserva este texto porque
> describe cómo se instalaba esta entrega concreta y qué límites tenía.

Versión: **0.18.0-fase4**.

Este ZIP contiene el proyecto completo, no sólo un parche. Incluye el mapa de
la isla, las dos escenas originales, las campañas, el teléfono, el guardado,
el modo offline y las pruebas de código.

## Qué hay de nuevo

- **El Brete:** 48 misiones en 8 capítulos para prepararte como analista de
  datos. Hojas de cálculo, SQL, estadística, Python/pandas, Power BI,
  portafolio, currículum honesto ES/EN, perfil profesional, publicaciones,
  postulaciones y entrevistas.
- **Zona Gamer:** 48 misiones en 8 capítulos. Permisos y material propio,
  selección de momentos, edición, subtítulos, narrativa, publicación y
  métricas, IA con revisión humana, automatización controlada y servicio
  comercial hasta una primera entrega pagada real.
- **Postulaciones ilimitadas:** cada registro deliberado da **25 XP y 2
  monedas ficticias**. No tiene límite diario ni total artificial. El botón
  produce un efecto de disparo/acierto después de guardar correctamente.
- Las dos rutas tienen entregables, criterios de aceptación, notas de
  evidencia, recursos de referencia y desbloqueo secuencial.
- La ciudad y el teléfono usan **el mismo progreso**, sin premios duplicados.
- Ahora también podés **empezar desde cero**, sin necesitar un export de
  ODEA 1. Esa acción sólo está disponible cuando no hay una partida activa.

## Lo primero: protegé tu partida

1. En tu Odea actual, abrí **Menú → Exportar respaldo** y guardá el JSON.
2. Conservá ese archivo fuera de la carpeta del proyecto.
3. Si actualizás el mismo sitio de GitHub Pages, mantené la misma dirección
   y el mismo navegador: el guardado vive en ese origen.
4. Si cambiás de dispositivo, navegador o dirección, importá/restaurá tu
   respaldo de ODEA 2 desde el Menú. No reimportes un ODEA 1 viejo encima de
   una partida que ya avanzó en ODEA 2.

El ZIP **no contiene tu partida privada** ni datos de tus cuentas.

## Cómo ponerlo en tu GitHub Pages

1. Descomprimí este ZIP.
2. Entrá al repositorio `JoseAn03/odea-2`.
3. Subí **el contenido de la carpeta del proyecto**, de manera que
   `index.html`, `js`, `css`, `src`, `data`, `assets`, `sw.js` y el resto
   queden directamente en la raíz del repositorio, no dentro de una carpeta
   extra.
4. Conservá los archivos de configuración de GitHub Pages y confirmá los
   cambios.
5. Esperá a que termine el despliegue de GitHub Pages. Abrí tu dirección
   habitual y, si Odea avisa de una actualización, tocá **Recargar**.
6. Verificá que la insignia muestre `v0.18.0-fase4`.

El código usa rutas relativas para funcionar bajo `/odea-2/`. Este paquete
no actualiza GitHub automáticamente ni cambia por sí solo el juego publicado.

## Cómo jugar las campañas

### En el mapa

- Tocá **Zona Gamer**, en la manzana del noreste, para entrar al estudio.
- Tocá **El Brete**, en el sector sur de oficinas, para entrar a la ruta de
  analista de datos.
- El botón **Mapa** de la cabecera te devuelve a la ciudad.
- El resto de los distritos conserva sus funciones anteriores.

### En el teléfono

- Abrí **Teléfono** en la barra inferior.
- **El Brete** y **Zona Gamer** abren las mismas rutas con diseño compacto.
- **Misiones** muestra las tareas diarias y el avance de ambas campañas.
- **Mapa** muestra los destinos y lleva a su localización/panel.
- **Inventario** y **Ajustes** abren Mochila y Menú.
- El botón redondo vuelve a Inicio; desde Inicio cierra el teléfono.

### Misiones y evidencia

1. Abrí la siguiente misión.
2. Hacé el trabajo indicado y verificá el criterio de aceptación.
3. Escribí una nota de al menos 12 caracteres sobre tu entrega, o un enlace
   que puedas volver a consultar.
4. Tocá **Completar misión**. El guardado confirma la recompensa y
   desbloquea el siguiente paso.

La evidencia es un registro personal, no una certificación automática ni una
evaluación de IA. No pegues contraseñas, documentos de identidad, CVs con datos
sensibles ni comprobantes bancarios completos. Para pagos, basta una referencia
privada minimizada: no necesitás exponer información financiera.

## Minijuego de postulaciones

En **El Brete**, cerca del inicio de la pantalla:

1. Enviá vos una candidatura por el canal oficial de la empresa.
2. Opcionalmente anotá empresa, puesto y una nota.
3. Tocá **Disparar postulación** para registrar esa acción.
4. Recibís **25 XP + 2 monedas del juego** y se actualiza tu contador.

Podés seguir registrando nuevas postulaciones. No hace falta completar
primero la ruta de aprendizaje. Hay una pausa breve contra doble toque y un
control entre pestañas para no pagar dos veces una acción accidental.

No es un bot de postulaciones, no manda CVs y no verifica que una candidatura
se haya enviado. Usalo como bitácora honesta de acciones reales. El historial
completo viaja en el respaldo; la pantalla sólo muestra los registros recientes.
El almacenamiento del navegador tiene una capacidad finita aunque el juego no
imponga un límite de registros.

## IA, empleo y dinero

- Las misiones enseñan a trabajar con herramientas externas y a configurar
  automatizaciones con permisos, revisión, pruebas y control de errores.
- Este juego no llama a un proveedor de IA, no publica en tus canales,
  no descarga videos y no entra en tus cuentas.
- El saldo de Odea es ficticio. No es una billetera ni se convierte en dinero.
- Conseguir empleo, crecer un canal o recibir ingresos no está garantizado.
- El último hito comercial de clips sólo debe marcarse cuando realmente
  haya aceptación de la entrega y pago. Si no, conservá el plan de
  prospectar y continuá sin fingir el resultado.

## Probar el proyecto en una computadora

Es una aplicación web estática con módulos JavaScript. No se debe abrir
`index.html` mediante doble clic (`file://`).

Si tenés Python instalado, abrí una terminal en la carpeta del proyecto:

```sh
python -m http.server 8000
```

Abrí `http://localhost:8000` en tu propio navegador. Ese origen de prueba no
comparte el guardado de GitHub Pages. No subas respaldos personales a la
carpeta que servís. En producción usá HTTPS.

No requiere instalar paquetes para jugar. Para las pruebas de código,
necesitás Node.js 20 o superior:

```sh
node --test
node tools/check-write-path.mjs
node tools/dom-smoke.mjs
```

## Conservación y ampliaciones

Las rutas nuevas se guardan en `play.campaigns`, sin modificar los mundos ni
los datos migrados. Sus premios se derivan de registros con cantidades
congeladas. Exportar y restaurar el bundle conserva evidencia e historial.

Las zonas heredadas de empleo siguen disponibles desde **Ver misiones de
empleo heredadas de ODEA 1**. El mar y las islas reservadas de expansión se
mantienen; esas expansiones son decorativas, todavía no terrenos comprables.

Las escenas y la interfaz son originales, inspiradas en una estética tropical
y neón. No son recursos oficiales de GTA ni una reproducción exacta de la
imagen de referencia.
