# R1 — Recompensas históricas inmutables

**Estado:** implementado en la rama `feat/r1-recompensas`. Pendiente de revisión de Muse/José.
**Alcance:** integridad del historial de recompensas. No activa distritos nuevos.

---

## 1. El problema

Antes de R1, una completación guardaba solo `{ missionId, system, date, at, period }`.
El XP y las monedas se recalculaban **desde el catálogo vigente** en cada derivación.

Consecuencia: si una misión cambiaba de valor en `data/xp-catalog.json`, **el historial
viejo cambiaba con ella**. El pasado no era estable.

---

## 2. Qué se congela

Cada completación nueva guarda:

```json
{
  "missionId": "n4",
  "system": "empleo",
  "date": "2026-11-16",
  "at": "2026-11-16T15:04:05.000Z",
  "reward": { "xp": 120, "coins": 1 },
  "rulesVersion": 1
}
```

En Vida se agrega `reward.cat` (la categoría del pilar), porque su cálculo la necesita.

- **`reward`** lo calcula el **dominio** desde el catálogo válido, dentro de la función
  de mutación. La UI nunca envía cantidades: solo `{ type, system, missionId }`.
- **`rulesVersion`** identifica con qué reglas se calculó. Sube cuando cambia **cómo** se
  calcula una recompensa, no cuando cambia un valor del catálogo.

### Lo que NO se congela, y por qué

- **Multiplicador de racha.** El XP de las misiones diarias se multiplica por
  `streakMult(racha)`, y la racha es **derivada de fechas** por decisión R3: nunca es un
  contador guardado. Congelar el multiplicador convertiría la racha en un valor
  almacenado por la puerta de atrás. Lo que se congela es el **XP base** del catálogo;
  la regla de racha sigue siendo una regla.
- **Monedas.** Bajo `RULES_VERSION 1` son 1 por completación (regla heredada: ODEA 1
  cuenta una moneda por cosa completada, no hay campo de monedas en el catálogo). Se
  guardan en el registro para que una regla futura no reescriba lo viejo.

---

## 3. Cómo se lee ahora

`derive()` usa el valor congelado **cuando existe** y cae al catálogo cuando no:

| Ruta | Antes | Ahora |
|---|---|---|
| Hub diarias/semanales | catálogo | congelado si existe |
| Empleo (jobs/b2b/puente) | catálogo | congelado si existe |
| Capital (done/eng/ai) | catálogo | congelado si existe |
| Vida — entrada `log` | catálogo | congelado por entrada |
| Vida — arrays `growth`/`kid`/… | catálogo | congelado por id |

Los registros **sin** `reward` (anteriores a R1, o migrados) siguen exactamente por la
ruta de compatibilidad de siempre. No se reescribe nada del pasado.

---

## 4. Versionado y cierre por versión

- `PLAY_VERSION` pasa de **1 a 2**. La sección `play` se crea perezosamente en la primera
  escritura, así que un bundle migrado sin `play` sigue siendo válido.
- `validatePlayState` acepta `play.version` **1 o 2**:
  - v1 → los registros **no** pueden traer `reward` (incoherente y rechazado).
  - v2 → `reward` es opcional por registro (compatibilidad con los previos a R1), pero si
    está presente se valida: `xp` finito ≥ 0, `coins` entero ≥ 0, `cat` string si existe y
    `rulesVersion` entero ≥ 1.
- Si `play.version > PLAY_VERSION`, `applyGameplayMutation` **rechaza con
  `BUNDLE_TOO_NEW`**: solo lectura y exportación. Un cliente viejo nunca sobrescribe datos
  que no entiende.

---

## 5. Ruta de escritura

No se agregó ninguna ruta nueva. Todo sigue pasando por `applyGameplayMutation`
(`src/storage.js`):

```
copia → mutación → refresco derivado → validación fail-closed
→ backup verificado byte a byte → CAS → escritura → relectura → éxito
```

`check:write-path` sigue en verde: solo `src/storage.js` toca `odea2_bundle_v1`.

---

## 6. Compatibilidad y rollback

| Escenario | Comportamiento |
|---|---|
| Bundle migrado sin `play` | Válido; la primera escritura crea `play` (hoy v3) |
| Bundle con `play` v1 y registros sin `reward` | Se lee y se deriva igual que antes |
| Bundle con `play` v1 y un `reward` | Rechazado por validación (incoherente) |
| Bundle con `play` v2 leído por cliente v1 | El cliente v1 lo ve como versión futura y no muta |
| Restaurar un respaldo con `reward` | Conserva el significado: mismos totales |

**Rollback:** revertir los commits de la rama. Los bundles escritos con R1 quedarían con
`play.version = 2`; un cliente anterior (que solo acepta v1) los trataría como versión
futura y quedaría en solo lectura — **no corrompe**, pero exige volver a esta versión para
seguir jugando. Por eso el rollback debe hacerse antes de que alguien complete misiones
con R1 activo, o aceptando esa limitación.

---

## 7. Cobertura T16, T23 y T24

Preparadas como **plan reproducible**, no como pruebas aprobadas.

### T16 — offline real

- Procedimiento: cargar la app con red, dejar que el SW instale, cerrar sesión, activar
  modo avión, recargar, completar una misión y reabrir.
- Qué debe demostrarse: el cascarón y `src/*` salen de caché; `data/xp-catalog.json` cae a
  caché (network-first); el guardado local funciona.
- Qué falta: es una prueba de navegador. La suite corre en Node sin SW.
- Estado: **no ejecutada**.

### T23 — teclado, lector, zoom

- Ya implementado en código: foco atrapado en hoja y overlay, foco devuelto al cerrar,
  `aria-current` en la barra, `aria-live` en avisos, skip-link.
- Qué falta demostrar: recorrido completo con Tab, anuncio de estados con lector de
  pantalla y zoom de texto al 200%.
- Estado: **no ejecutada**; requiere navegador y lector.

### T24 — historial grande

- Criterio: fixture sintético con varios años de actividad; sin recorte, sin fallo de
  parseo, sin degradación inaceptable.
- **Ejecutada la parte que se puede ejecutar en Node**: `tests/t24-historial-grande.test.js`
  genera **14.700 ocurrencias** (49 misiones diarias de Vida × 300 días) con semilla fija,
  sin commitear un archivo enorme. Comprueba:
  1. ninguna ocurrencia se pierde y la ida y vuelta por JSON conserva todas;
  2. el bundle valida sin `DERIVE_DRIFT`;
  3. todos los componentes de XP son finitos y no negativos;
  4. la derivación promedia por debajo de **2.000 ms** (red de seguridad, no una medición
     del teléfono).
- **Lo que sigue pendiente**: la sesión sostenida de 15 minutos en el teléfono real, con
  la ciudad animada y el guardado. Eso es del checklist manual.
- Estado: **cobertura parcial ejecutada**; la parte de dispositivo, pendiente.

### Checklist de teléfono real (para José)

1. Instalar la PWA y abrirla desde el icono.
2. Completar una misión del Hub; recargar; verificar que persiste.
3. Repetir la misma misión: debe decir «ya estaba completada», sin ganar XP.
4. Activar modo avión y repetir el paso 2.
5. Abrir dos pestañas y completar en ambas la misma misión: un solo crédito.
6. Recorrer con Tab la barra, la hoja y los diálogos; el foco no debe escaparse.
7. Exportar respaldo, borrar datos del sitio, restaurar: los totales deben coincidir.

**Este checklist no está aprobado.** Lo firma quien lo ejecute.
