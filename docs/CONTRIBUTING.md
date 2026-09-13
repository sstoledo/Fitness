# Cómo trabajamos — Fitness MVP

> Reglas del repo. Si algo de acá choca con lo que ves en el código, gana el código y se actualiza este doc.
> Contexto de producto y roadmap: `docs/ONBOARDING.md`. Fuente de verdad funcional: `openspec/changes/fitness-mvp/`.

---

## El flujo de trabajo

1. **Ruta cronológica**: las tareas se ejecutan en orden según las rutas cronológicas `docs/RUTA-*.md` (una por cut). Si tu tarea depende de otra que aún no está, frenás y esperás (o ayudás, pero no saltás de orden).
2. **Quien elija la tarea**: el equipo es de 3 devs, sin carriles fijos ni paridad. Cualquier dev toma la próxima tarea disponible del orden cronológico de `docs/RUTA-*.md`, sin saltarse la secuencia. Nuevos devs se suman igual: toman tareas del orden cronológico.
3. **RED antes de GREEN** (strict TDD en backend): primero se escriben los tests que fallan (RED); la tarea siguiente los pone en verde **sin tocar las assertions**. Los tests RED son el contrato.
4. **Una branch por unidad de trabajo** → PR a `main` → merge → **borrar la branch mergeada** (local y remota). Las branches mergeadas son solo punteros; los commits ya viven en main.
5. **PRs chicos y revisables**: guía de ≤ ~400 líneas por unidad. Si se pasa, se divide en PRs encadenados o se aprueba explícitamente como excepción.

## Commits

- Conventional commits en inglés: `feat(api): ...`, `fix(mobile): ...`, `docs: ...`
- **1 tarea = 1 commit**
- Sin atribución AI, sin `Co-Authored-By`, sin emojis

## Idiomas

| Contenido | Idioma |
|---|---|
| Docs de coordinación (`docs/*.md`) | Español |
| Código, comentarios, UI copy, specs, mensajes de commit | Inglés |

## Verificación obligatoria (antes de abrir PR)

```bash
pnpm --filter api test                # backend — NUNCA requiere DB real
pnpm --filter mobile exec tsc --noEmit  # mobile — no hay test runner; typecheck es la puerta
pnpm typecheck                        # monorepo completo
```

Sin `.skip`, sin `.only`, sin mocks trucados en specs.

## Guardrails de arquitectura (no negociables)

- **`synchronize: false` en TypeORM**: el schema vive en migraciones aditivas (`apps/api/src/migrations/`). Nunca autogenerar schema en runtime.
- **Contratos compartidos**: front y back hablan por DTOs zod en `@fitness/contracts`. Si cambia el contrato, ambos lados fallan en typecheck — eso es a propósito.
- **Mocks con flag + REMOVAL NOTE**: mocks de dev van detrás de `EXPO_PUBLIC_USE_*` y llevan un `REMOVAL NOTE` que dice cuándo se borran.
- **Auth**: bearer token en SecureStore; `SessionGuard` en el backend. Errores de login con mensaje genérico idéntico para user inexistente y password incorrecta.
- **Estilo visual**: dark theme (`#0D0F0E` / `#B8F04A`) — no tocar.
- **No commitear**: `.turbo/`, `node_modules/`, código generado por prebuild.

## Dónde está la verdad

| Pregunta | Dónde mirar |
|---|---|
| ¿Qué hacemos y por qué? | `openspec/changes/fitness-mvp/proposal.md` |
| ¿Qué tarea sigue? | `docs/RUTA-*.md` (ruta del cut en curso) |
| ¿Cómo es el detalle técnico de mi lado? | `docs/CUT-1-BACKEND.md` / `docs/CUT-1-MOBILE.md` |
| ¿Cómo es el modelo de datos? | `docs/DATABASE.md` |
| ¿Cómo levanto el proyecto? | `docs/ONBOARDING.md` |
