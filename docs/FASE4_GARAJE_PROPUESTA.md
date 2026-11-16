# Propuesta técnica — Distrito Garaje

**Estado: NO IMPLEMENTADO.** Este documento es una propuesta para revisión.
La fuente no define recompensas y la periodicidad no encaja en el modelo actual, así que
implementarlo exigiría suposiciones sobre reglas heredadas. No se hizo.

**Fuente:** `assets/odea-garaje.js` @ `ebb0fce` (v6.00), extraído con
`tools/extract-assets.mjs` (rama `feat/extraccion-catalogos`, PR #15).

---

## 1. Las 13 misiones, con origen verificado

Declaradas en `assets/odea-garaje.js` · `var MISIONES_BASE`.

| # | missionId | Vehículo | Periodicidad (`dias`) | Nombre |
|---|---|---|---:|---|
| 1 | `c-lavar` | carro | 7 | Lavar el carro |
| 2 | `c-llantas` | carro | 14 | Revisar presión de llantas |
| 3 | `c-interior` | carro | 14 | Limpiar el interior |
| 4 | `c-aceite-nivel` | carro | 15 | Revisar nivel de aceite |
| 5 | `c-fluidos` | carro | 30 | Revisar refrigerante y líquido de frenos |
| 6 | `c-luces` | carro | 30 | Revisar luces y escobillas |
| 7 | `c-aceite-cambio` | carro | 90 | Cambio de aceite y filtro (control por fecha/km) |
| 8 | `m-lavar` | moto | 7 | Lavar la moto |
| 9 | `m-llantas` | moto | 7 | Revisar presión de llantas |
| 10 | `m-cadena` | moto | 14 | Limpiar y lubricar la cadena |
| 11 | `m-aceite` | moto | 15 | Revisar nivel de aceite |
| 12 | `m-frenos` | moto | 30 | Revisar frenos |
| 13 | `m-luces` | moto | 30 | Revisar luces |

Vehículos (`var VEHICULOS`): `carro` = Hyundai Accent 2017, `moto` = Formula X2.
Ambos existen en la fuente y todas las misiones apuntan a un vehículo válido.

---

## 2. Lo que la fuente NO define

| Dato | Estado |
|---|---|
| **XP por misión** | ❌ No existe campo de XP en `MISIONES_BASE` |
| **Monedas por misión** | ❌ No existe campo de monedas |
| **Requisitos / desbloqueos** | ❌ No declarados |
| **Estado heredado** | ⚠️ Solo `worlds.garaje.misiones` en el bundle migrado |

**No hay componente `garaje` en `xpBreakdown`.** Es decir: el Garaje no otorga XP en
ODE A 1, igual que Academia. Inventarle un valor violaría la regla de no inventar XP.

---

## 3. El problema de la periodicidad

Cada misión trae `dias` (7, 14, 15, 30, 90), que es un **intervalo de mantenimiento**, no
una clase de frecuencia del modelo actual:

| Clase disponible | Encaje |
|---|---|
| `one` (única) | ❌ El mantenimiento se repite |
| `daily` (por fecha civil) | ❌ No es diario |
| `weekly` (semana ISO) | ❌ 14/15/30/90 días no son semanas |

`occurrenceKey` solo produce tres formas. Metrar el Garaje requeriría **una cuarta clase
(`every:N days`)** o una decisión de producto que lo reduzca a una de las tres.

Eso es exactamente el tipo de suposición que el encargo prohíbe.

---

## 4. Cómo aparecería en el distrito (si se aprueba)

Sin duplicar completaciones, y reutilizando el patrón ya probado:

1. `SYSTEM_MAPS.garaje = ["garaje.misiones"]` con un catálogo nuevo en
   `data/xp-catalog.json` que conserve `{ id, vehiculo, nombre, dias }` **y** el campo de
   recompensa que se decida.
2. `missionsOf(catalog, "garaje")` devolvería las 13, agrupadas por vehículo
   (`carro` / `moto`) igual que Empleo agrupa por mapa.
3. `occurrenceKey` ampliado con la clase que se decida. La clave sería
   `id@<periodo>` y el registro guardaría `period` como ya hace hoy.
4. La hoja del distrito mostraría solo pendientes del periodo vigente, con el conteo de
   completadas — mismo componente `<details>` que Empleo y Vida.
5. Un mismo `missionId` seguiría siendo **una sola entidad**: completar desde el distrito o
   desde cualquier vista lee y escribe el mismo registro.

---

## 5. Tests que exigiría

1. Catálogo: 13 ids, sin duplicados, todos con `vehiculo` existente y `dias > 0`.
2. Idempotencia por periodo: dos completaciones en el mismo intervalo → `duplicate`.
3. Al vencer el intervalo (`dias`), la misión vuelve a estar pendiente.
4. Una misión de un vehículo no aparece en el otro.
5. La ruta única de escritura sigue siendo la única (`check:write-path`).
6. R1: la recompensa se congela al escribir y no cambia si el catálogo cambia.

---

## 6. Datos que faltan para poder implementarlo

1. **Recompensa de cada una de las 13 misiones** (XP y/o monedas). No está en la fuente.
2. **Decisión sobre la periodicidad**: cuarta clase `every:Nd`, o mapeo explícito a una de
   las tres existentes.
3. **Semántica de `km`**: el bundle guarda `worlds.garaje.km`, que la fuente usa en
   `c-aceite-cambio` («control por fecha/km»). No está definido cómo entra el kilometraje en
   la regla de vencimiento.
4. **Nombres de distrito**: la UI ya usa «El Garaje»; confirmar si se mantiene.

Con esos cuatro puntos resueltos, la implementación es del mismo tamaño que Empleo y no
necesita tocar la ruta de escritura.
