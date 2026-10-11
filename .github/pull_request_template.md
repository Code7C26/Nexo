## Qué cambia

<!-- Qué se hizo y por qué. Si toca una regla de negocio o una decisión de
CLAUDE.md, citar la sección (§N). -->

## Cómo se verificó

<!-- Tests, pasos en el navegador, comparación contra HEAD, etc. -->

## Checklist

- [ ] `npm test` y `npm run lint` en verde (los corre el CI).
- [ ] Nada se probó contra `backend/db/nexo.db`: las pruebas usaron `NEXO_DB_PATH` a una copia.
- [ ] Si cambia el esquema: migración idempotente explicada (CLAUDE.md §34) y probada sobre una base nueva y una copia de la real.
- [ ] Toda ruta nueva está clasificada en `backend/permisos.js`.
- [ ] Todo dato que se imprime en HTML pasa por `esc()` y toda llamada al backend por `api()`.
- [ ] `handoff.md` actualizado.
