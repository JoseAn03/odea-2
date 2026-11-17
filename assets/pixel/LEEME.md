# Arte pixel — ODEA 2 Costa Neón (v2, muestra)

Capa visual retro por cuadritos para la ciudad 2D, estilo RPG cenital tipo
Pokémon / GTA clásico: tiles de 32×32, personajes de 16×20 con animación de
caminar de 2 cuadros por dirección (frente, espalda, lado), props de ciudad
(postes de luz con halo, árboles, bancas), un carro y una moto. Escena
nocturna con luces: la ciudad se oscurece y los postes encienden su halo.
Paleta Costa Neón (rosa #FF2E93, cian #00E5FF, naranja #FF8A3D, fondo #12081F).
**Solo capa visual: no toca progreso, misiones ni datos.**

**El avatar del jugador es único: es el ÚNICO personaje con gorra** (azul,
camisa cian, tenis rosa neón). Los NPC se generan sin gorra a propósito.

## Archivos

- `tileset.png` — 10 tiles: asfalto, asfalto con línea horizontal y vertical,
  acera, paso de cebra, grama, techos A/B/C (B y C con letrero de neón), plaza.
- `personaje.png` — hoja de 6 cuadros del jugador (frente A/B, espalda A/B,
  lado A/B). La vista de lado se espeja para caminar a la izquierda.
- `npc_1.png`, `npc_2.png` — misma hoja, otras paletas, SIN gorra.
- `props.png` — poste de luz, árbol y carro en una hoja.
- `carro_cian.png`, `carro_rosa.png`, `moto.png` — vehículos sueltos.
- `preview.png` — muestra estática con luces (no es captura del juego).
- `preview_anim.gif` — muestra animada: el jugador camina por la plaza, un
  carro cruza la calle, un NPC sube por la acera y las luces respiran.
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
