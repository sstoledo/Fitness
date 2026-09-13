# Ruta cronológica — Cut 1

> Documento nuevo. NO reemplaza `docs/CUT-1-BACKEND.md` ni `docs/CUT-1-MOBILE.md` — esos siguen siendo el detalle técnico de cada tarea. Este es solo el **orden de ejecución**.
> Convención de equipo (actualizada): **3 devs, quien elija la tarea** — cualquier dev toma cualquier tarea del orden cronológico. No hay carriles fijos ni paridad. Cada tarea es un commit propio.

---

## Orden cronológico del Cut 1

| # | Tarea (ref) | Lado | Qué se hace | Depende de |
|---|---|---|---|---|
| 1 | Fix typecheck bootstrap | Backend | Tipear mocks de `health.controller.spec.ts` con `vi.fn()`. Commit: `fix(api): type health controller test mocks` | — |
| 2 | Auth screens + sesión (3.1) | Mobile | Pantallas login/register (expo-router), token en secure-store, auth gate, logout | Contratos de Fase 0 ✅ |
| 3 | RED tests auth (2.1) | Backend | Tests supertest: register 201/409/400, login 200/401. Deben fallar | #1 |
| 4 | Auth gate wiring | Mobile | Conectar pantallas de #2 contra la API real; definir con backend el transporte (bearer recomendado) | #3 |
| 5 | GREEN auth (2.2) | Backend | Wire better-auth HTTP + session guard + logout. Tests de #3 en verde | #3 |
| 6 | Lista de retos UI (3.3 parte 1) | Mobile | Pantalla lista + crear reto (form nombre/tipo/fechas), estados loading/vacío/error | #4 |
| 7 | RED tests challenges (2.3) | Backend | Tests: create 201/400, join 200/403/409 (máx 20). Deben fallar | #5 |
| 8 | Unirse a reto UI (3.3 parte 2) | Mobile | Flujo de invitación/unión por código o token | #6 |
| 9 | GREEN challenges (2.4) | Backend | Entidades Challenge/Membership/Invite + migraciones aditivas + endpoints | #7 |
| 10 | Health sync (3.2) | Mobile | Lectura HealthKit/Health Connect, permiso denegado → empty state, POST batch de pasos | #6 |
| 11 | RED+GREEN steps + leaderboard (2.5 + 2.6) | Backend | StepEntry con UNIQUE compuesto, upsert idempotente, leaderboard con Redis sorted set | #9 |
| 12 | Leaderboard UI + integración (3.3 parte 3) | Mobile | Pantalla leaderboard diario + **prueba de integración: dos usuarios ven el mismo leaderboard** | #10, #11 |

---

## Reglas de la ruta

1. **Orden estricto**: la tabla es cronológica. No adelantar una tarea si la anterior no está; si tu tarea depende de otra que aún no está, frenás y esperás (o ayudás) — pero no saltás de orden.
2. **Cada tarea = un commit** conventional en inglés, sin atribución AI.
3. **RED antes que GREEN** en backend (strict TDD): los tests RED de la tarea anterior son tu contrato.
4. **Verificación antes de marcar hecha**: backend → `pnpm --filter api test` verde; mobile → QA manual en dev build.
5. **Punto de integración**: la tarea #12 es el cierre del Cut 1 — dos dispositivos, mismo reto, mismo leaderboard.
6. Si algo del detalle técnico no queda claro, la fuente es el PDD/TDD (`docs/CUT-1-*.md`) y `openspec/changes/fitness-mvp/`.
