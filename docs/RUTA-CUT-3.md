# Ruta cronológica — Cut 3

> Documento nuevo. NO reemplaza `docs/CUT-3-BACKEND.md` ni `docs/CUT-3-MOBILE.md` — esos siguen siendo el detalle técnico de cada tarea. Este es solo el **orden de ejecución**.
> Objetivo: push notifications + historial + stats. Cualquiera de los 3 devs puede tomar cualquier tarea; el orden cronológico es la única regla de secuencia.

---

## Orden cronológico del Cut 3

| # | Tarea (ref) | Lado | Qué se hace | Depende de |
|---|---|---|---|---|
| 1 | Módulo notifications + stats (5.1) | Backend | RED+GREEN: entidad PushToken (upsert, UNIQUE por token), dispatch vía Expo push service en invite (al invitee) y challenge started/ended (a miembros con token), payload `{ challengeId, type }`; `GET /api/history` newest-first con rank final; `GET /api/stats` con joined/wins/acumulados | Retos + Memberships de Cut 1 ✅ |
| 2 | Push registration + deep-link (5.2) | Mobile | Registro del token al arrancar autenticado (denegado = no-op silencioso, sin re-prompt agresivo), listener de notificaciones, deep-link del payload `{ challengeId, type }` → pantalla de invite con accept/decline | #1 (endpoint de push-tokens y dispatch real) |
| 3 | History + Stats screens (5.3) | Mobile | Pantallas de historial (retos pasados newest-first con rank final, empty state) y stats (joined, wins, acumulados) consumiendo `ChallengeHistoryDto`/`UserStatsDto` con tanstack-query; estados loading/vacío/error | #2 (base de navegación) y #1 (endpoints) |

---

## Reglas de la ruta

1. **Orden estricto**: la tabla es cronológica. No adelantar una tarea si la anterior no está; si tu tarea depende de otra que aún no está, frenás y esperás (o ayudás) — pero no saltás de orden.
2. **Cada tarea = un commit** conventional en inglés, sin atribución AI.
3. **RED antes que GREEN** en backend (strict TDD): los tests RED son tu contrato, y la tarea NO se marca hecha hasta que pasan en verde.
4. **Verificación antes de marcar hecha**: backend → `pnpm --filter api test` verde + `pnpm typecheck`; mobile → `pnpm --filter mobile exec tsc --noEmit` + QA manual en dev build.
5. **Punto de integración**: la tarea #2 es el cierre del Cut 3 — invitación recibida como push en el dispositivo y tappable (abre la pantalla de invite).
6. Si algo del detalle técnico no queda claro, la fuente es el PDD/TDD (`docs/CUT-3-*.md`) y `openspec/changes/fitness-mvp/`.