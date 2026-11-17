# Arte pixel — ODEA 2 Costa Neón (v1, muestra)

Capa visual retro por cuadritos para la ciudad 2D: tiles de 32×32 y personajes
de 16×20 con animación de caminar de 2 cuadros por dirección (frente, espalda,
lado). Todo en la paleta Costa Neón (rosa #FF2E93, cian #00E5FF, naranja
#FF8A3D, fondo #12081F). **Solo capa visual: no toca progreso, misiones ni datos.**

## Archivos

- `tileset.png` — 8 tiles en fila: asfalto, asfalto con línea, acera, paso de
  cebra, grama, techo A, techo B, plaza.
- `personaje.png` — hoja de 6 cuadros del jugador (frente A/B, espalda A/B,
  lado A/B). La vista de lado se espeja para caminar a la izquierda.
- `npc_1.png`, `npc_2.png` — misma hoja con otras paletas (gente de ambiente).
- `preview.png` — muestra: una esquina de ciudad armada con los tiles y 3
  personajes (no es captura del juego).
- `generar_arte_pixel.py` — el generador: todo el arte sale de este script
  (Python + PIL). Cambiar un color o un tile = editar el script y correrlo.

## Herramientas

- **Generación:** Python 3 + Pillow (`generar_arte_pixel.py` en esta carpeta).
- **Edición manual de pixeles:** Piskel (gratis, en el navegador) o Aseprite,
  abriendo los PNG de esta carpeta.
- **Integración en el juego (cuando se apruebe):** cargar los PNG en el Canvas
  con el suavizado desactivado (`imageSmoothingEnabled = false` y CSS
  `image-rendering: pixelated`), dibujar tiles de 32×32 y alternar los cuadros
  A/B cada ~180 ms mientras el personaje se mueve.

## Estado

Muestra v1 para decidir el estilo. No está conectada al juego todavía: la
integración va en su propia fase/PR cuando el orquestador la apruebe, sin
mezclarse con el trabajo de la spec de Fase 3.
