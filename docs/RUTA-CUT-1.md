# Ruta cronológica — Cut 1 (ruleta par/impar)

> Documento nuevo. NO reemplaza `docs/CUT-1-BACKEND.md` ni `docs/CUT-1-MOBILE.md` — esos siguen siendo el detalle técnico de cada tarea. Este es solo el **orden de ejecución** y **quién hace qué**.
> Objetivo: los dos tocan backend (DB incluida) Y mobile. Cada tarea es un commit propio.

---

## La ruleta ya se tiró 🎲

| Dev | Paridad | Stack que arranca |
|---|---|---|
| **Adrián** | **IMPARES** (1, 3, 5, 7, 9, 11) | Backend primero |
| **Amigo** | **PARES** (2, 4, 6, 8, 10, 12) | Mobile primero |

Regla: seguir el orden cronológico de la tabla de abajo. Si te toca una tarea que depende de otra que aún no está, **frenás y esperás al otro** (o lo ayudás, pero no saltás de orden).

---

## Orden cronológico del Cut 1

| # | Tarea (ref) | Lado | Qué se hace | Depende de | Asignado |
|---|---|---|---|---|---|
| 1 | Fix typecheck bootstrap | Backend | Tipear mocks de `health.controller.spec.ts` con `vi.fn()`. Commit: `fix(api): type health controller test mocks` | — | **Adrián** |
| 2 | Auth screens + sesión (3.1) | Mobile | Pantallas login/register (expo-router), token en secure-store, auth gate, logout | Contratos de Fase 0 ✅ | **Amigo** |
| 3 | RED tests auth (2.1) | Backend | Tests supertest: register 201/409/400, login 200/401. Deben fallar | #1 | **Adrián** |
| 4 | Auth gate wiring | Mobile | Conectar pantallas de #2 contra la API real; definir con backend el transporte (bearer recomendado) | #3 | **Amigo** |
| 5 | GREEN auth (2.2) | Backend | Wire better-auth HTTP + session guard + logout. Tests de #3 en verde | #3 | **Adrián** |
| 6 | Lista de retos UI (3.3 parte 1) | Mobile | Pantalla lista + crear reto (form nombre/tipo/fechas), estados loading/vacío/error | #4 | **Amigo** |
| 7 | RED tests challenges (2.3) | Backend | Tests: create 201/400, join 200/403/409 (máx 20). Deben fallar | #5 | **Adrián** |
| 8 | Unirse a reto UI (3.3 parte 2) | Mobile | Flujo de invitación/unión por código o token | #6 | **Amigo** |
| 9 | GREEN challenges (2.4) | Backend | Entidades Challenge/Membership/Invite + migraciones aditivas + endpoints | #7 | **Adrián** |
| 10 | Health sync (3.2) | Mobile | Lectura HealthKit/Health Connect, permiso denegado → empty state, POST batch de pasos | #6 | **Amigo** |
| 11 | RED+GREEN steps + leaderboard (2.5 + 2.6) | Backend | StepEntry con UNIQUE compuesto, upsert idempotente, leaderboard con Redis sorted set | #9 | **Adrián** |
| 12 | Leaderboard UI + integración (3.3 parte 3) | Mobile | Pantalla leaderboard diario + **prueba de integración: dos usuarios ven el mismo leaderboard** | #10, #11 | **Amigo** |

---

## Reglas de la ruta

1. **Orden estricto**: la tabla es cronológica. No adelantar tareas de paridad propia si la anterior del otro no está.
2. **Cada tarea = un commit** conventional en inglés, sin atribución AI.
3. **RED antes que GREEN** en backend (strict TDD): los tests de la tarea impar anterior son tu contrato.
4. **Verificación antes de marcar hecha**: backend → `pnpm --filter api test` verde; mobile → QA manual en dev build.
5. **Punto de integración**: la tarea #12 es el cierre del Cut 1 — dos dispositivos, mismo reto, mismo leaderboard.
6. Si algo del detalle técnico no queda claro, la fuente es el PDD/TDD de tu lado (`docs/CUT-1-*.md`) y `openspec/changes/fitness-mvp/`.
