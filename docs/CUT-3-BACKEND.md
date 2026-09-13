# Cut 3 — Backend (PDD/TDD de trabajo)

> Carril: **Backend** · Proyecto: Fitness MVP · Change: `fitness-mvp`
> Base: Cuts 1 y 2 hechos (auth, challenges, steps, leaderboard, gateway realtime). Contratos de `packages/contracts` completos (importar como `@fitness/contracts`).
> Fuente de verdad funcional: `openspec/changes/fitness-mvp/specs/social-notifications/spec.md`.
> Técnico: `openspec/changes/fitness-mvp/design.md`.
>
> **Regla de oro (strict TDD)**: cada tarea arranca con el test en ROJO (que falla) y termina cuando pasa en VERDE. Comando: `pnpm --filter api test`.

---

## Objetivo del producto en este cut (PDD)

Push notifications (invitaciones y eventos de reto), historial de retos terminados y estadísticas del usuario. El cierre social del MVP: te invitan, te avisan, y después podés ver tu historial y tus números.

**Criterio de éxito del cut**: el invitee recibe el push al ser invitado, y al tocar el push se abre la pantalla de la invitación (deep-link). Historial y stats responden con los datos correctos.

---

## Antes de arrancar

1. `docker compose up -d` (PostGIS + Redis deben quedar healthy).
2. `pnpm install`.
3. Confirmar el proyecto/credenciales de Expo push service para emular dispatches en dev (mockear el envío en los tests; el envío real se prueba con un dispositivo físico en el QA de mobile).
4. **Decisión abierta** (reportada): las fuentes no definen cómo se computa el "final rank" de un reto terminado que alimenta history. Definir antes de escribir los tests (ver ambigüedades al cierre de este doc).

---

## Tarea 5.1 — RED+GREEN: módulo notifications + stats

**Qué se construye (producto)**: el backend registra los tokens de push de cada usuario, dispara las notificaciones (invitación al invitee; reto started/ended a todos los miembros con token), y expone historial de retos pasados con rank final y estadísticas agregadas.

**Qué hacer (técnico)** — tests primero (RED):
- PushToken upsert: `POST /api/push-tokens` (o ruta equivalente del módulo) registra un token nuevo → 201; re-registrar el mismo token para el mismo usuario → actualiza `lastSeenAt` sin duplicar (UNIQUE por token); token duplicado de otro usuario → manejo de conflicto definido (re-asignar o rechazar según decisión).
- Dispatch en invitación: al crear un invite, el push service (mockeado en el test) recibe un envío para el invitee con `challengeId` + `type: "invite"` en el payload. Invitee sin token → no se envía, sin error.
- Dispatch en eventos: reto started y reto ended → un envío a cada miembro con token registrado (payload con `challengeId` + `type`).
- History: `GET /api/history` → retos pasados (terminados) newest-first con rank final; usuario sin retos terminados → 200 con lista vacía (`ChallengeHistoryDto`).
- Stats: `GET /api/stats` → `UserStatsDto` con challenges joined, wins y acumulados (distance/steps) correctos para un usuario con historial conocido; usuario sin actividad → ceros sin error.
- Los tests DEBEN fallar (módulos todavía no existen).

**Qué hacer (técnico)** — GREEN:
- **Entidad `PushToken`** (userId FK, token **UNIQUE**, platform `ios|android`, lastSeenAt). Upsert al iniciar sesión/arranque autenticado con push habilitado (el móvil dispara el registro; el backend hace el upsert idempotente). Migraciones aditivas (`synchronize:false` se mantiene).
- **Dispatch**: vía Expo push service — en el servidor Node se usa el cliente `expo-server-sdk` (del lado mobile la lib es `expo-notifications`). Triggers:
  - Invite creado → push al invitee.
  - Challenge started / ended → push a todos los miembros con token registrado.
  - Payload con `challengeId` + `type` para deep-link en mobile. Sin token → no-op silencioso.
- **History**: `GET /api/history` → retos pasados (completed/ended) newest-first con el rank final del usuario, mapeado a `ChallengeHistoryDto` de `@fitness/contracts`.
- **Stats**: `GET /api/stats` → agregados: challenges joined, wins y acumulados de distance/steps, mapeado a `UserStatsDto` de `@fitness/contracts`.
- Endpoints protegidos con el session guard de 2.2.

**Verificación**: tests RED de arriba en verde (con el push service mockeado) + `pnpm --filter api test` completo verde + `pnpm typecheck` verde.

---

## Cierre del cut (Backend)

- [ ] `pnpm --filter api test` — todo verde (pushToken upsert, dispatch en invite/started/ended, history newest-first + vacío, stats).
- [ ] `pnpm typecheck` — verde.
- [ ] Flujo manual con curl/HTTP client: register/login → upsert token → crear invite → verificar en logs que el push se despachó al invitee; reto terminado → `GET /api/history` y `GET /api/stats` con datos reales.
- [ ] Migraciones aditivas commiteadas (PushToken).