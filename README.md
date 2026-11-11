# ODEA 2 — Fase 0

**Especificación de la migración de progreso ODEA 1 → ODEA 2.**

El juego todavía **no está construido**: esta fase solo documenta y valida cómo se
traslada el progreso del usuario. No incluye UI, ciudad, Distrito IA, economía,
reputación, secretos, endgame ni misiones nuevas.

## Documentos

| Archivo | Contenido |
|---|---|
| `MIGRATION_SPEC.md` | Mapa de los 36 campos + 11 claves, decisiones D1–D5 y contrato de validación. |
| `SCHEMA_ODEA2_V1.md` | Schema `odea2_bundle_v1` con secciones `core` / `worlds` / `legacy`. |
| `RISK_LIST.md` | Campos en riesgo, decisiones cerradas/abiertas, versionado y caché PWA. |

## Código de validación (no es el juego)

`src/shape.js` (contrato), `src/migrate.js` (migrador con dos candados),
`src/derive.js` (oráculo XP/monedas v5.99), `src/validate.js` (validador cerrado)
y `src/storage.js` (importación, backup, cuarentena y carga/guardado `odea2_`).

## Datos

- `data/xp-catalog.json`: catálogos **estáticos de juego** (ids → XP). No contiene progreso de usuario.
- `fixtures/odea-progreso-sintetico.json`: fixture sintético con la **forma exacta** del bundle real (36 campos + 11 claves), valores falsos.

## Tests

```bash
npm test
```

33/33: paridad de los 10 componentes de XP, monedas, `eventRL`/`farm`/`canje`,
los dos candados (aborto y cuarentena), reimportación, ida y vuelta y los
**tests negativos** de los tres críticos.

## Datos personales

El bundle real del usuario **nunca** se publica. `.gitignore` bloquea
`odea-progreso-*.json` y `*progreso-real*`, con excepción del fixture sintético.
