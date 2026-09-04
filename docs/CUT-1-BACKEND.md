# Cut 1 — Backend (PDD/TDD de trabajo)

> Carril: **Backend** · Proyecto: Fitness MVP · Change: `fitness-mvp`
> Base: Fase 0 ya hecha (`packages/contracts` con DTOs y schemas zod — importar como `@fitness/contracts`).
> Fuente de verdad funcional: `openspec/changes/fitness-mvp/specs/{user-auth,step-challenges}/spec.md`.
> Técnico: `openspec/changes/fitness-mvp/design.md`.
>
> **Regla de oro (strict TDD)**: cada tarea arranca con el test en ROJO (que falla) y termina cuando pasa en VERDE. Comando: `pnpm --filter api test`.

---

## Objetivo del producto en este cut (PDD)

Que dos usuarios puedan: registrarse, loguearse, crear un reto de pasos privado, invitar amigos, unirse, sincronizar pasos y ver el mismo leaderboard diario. Nada de GPS ni mapas todavía.

**Criterio de éxito del cut**: dos usuarios se unen a un reto de pasos y ven el mismo leaderboard diario.

---

## Antes de arrancar

1. `docker compose up -d` (PostGIS + Redis deben quedar healthy).
2. `pnpm install`.
3. `curl http://localhost:4000/api/health` → `{"status":"ok","db":"up"}`.
4. ⚠️ **Fix preexistente**: `pnpm --filter api typecheck` falla en `health.controller.spec.ts` (mocks sin tipear, error TS2339 en líneas 25 y 32). Tipear el mock con `vi.fn()` tipado. Hacerlo primero, commit aparte: `fix(api): type health controller test mocks`.

---

## Tarea 2.1 — RED: tests de auth

**Qué se construye (producto)**: registro y login por email/password, con errores claros.

**Qué hacer (técnico)**:
- Escribir tests de integración con supertest + Testcontainers (Postgres real en contenedor efímero):
  - `POST /api/auth/register` con email + password válidos → 201 + session token.
  - Registro con email duplicado → 409.
  - Password < 8 caracteres → 400.
  - `POST /api/auth/login` con credenciales correctas → 200 + token.
  - Login con password incorrecto → 401 con mensaje genérico (sin revelar qué campo falló).
- Los tests DEBEN fallar (los endpoints todavía no existen).

**Verificación**: `pnpm --filter api test` corre y todos estos tests fallan como se espera.

---

## Tarea 2.2 — GREEN: wiring de better-auth

**Qué hacer (técnico)**:
- Conectar el `betterAuth` ya instanciado en `src/modules/auth/better-auth.ts` con HTTP: controller/handlers para register/login/logout/session.
- Crear un guard de NestJS que valide la sesión en endpoints protegidos.
- Validación con DTOs de `@fitness/contracts` (`RegisterDto`, `LoginDto`) + class-validator.
- Logout invalida la sesión server-side.
- **Decisión abierta** (del design): definir transporte de sesión para Expo — cookie httpOnly vs bearer token. Documentar la elección en el código/README. Recomendado: bearer token (más simple en React Native que cookies).

**Verificación**: los tests de 2.1 pasan en verde.

---

## Tarea 2.3 — RED: tests de challenges

**Qué se construye (producto)**: crear retos privados, invitar, unirse con reglas.

**Qué hacer (técnico)** — tests primero:
- `POST /api/challenges` con nombre + rango de fechas válido → 201, el creador queda como primer miembro.
- End date anterior a start date → 400, no se crea nada.
- `POST /api/challenges/:id/join` con invitación válida → 200, queda como miembro.
- Join sin invitación → 403.
- Join cuando ya hay 20 miembros → 409 "challenge full".
- Los retos NO son públicamente listables (no existe endpoint de descubrimiento).

**Verificación**: tests corren y fallan.

---

## Tarea 2.4 — GREEN: módulo challenges

**Qué hacer (técnico)**:
- Entidades TypeORM según design: `Challenge` (id, name, type, status, startDate, endDate, createdBy), `Membership` (userId + challengeId composite PK, role, joinedAt), `Invite` (token único, status, inviteeEmail).
- Migraciones TypeORM **aditivas** (nada destructivo, `synchronize:false` se mantiene).
- Servicio: create (valida fechas), invite (genera token), join (valida invitación + capacidad ≤20).
- Protegidos con el session guard de 2.2.

**Verificación**: tests de 2.3 en verde + `pnpm --filter api test` completo verde.

---

## Tarea 2.5 — RED: tests de pasos + leaderboard

**Qué se construye (producto)**: subir pasos del día y ver el leaderboard diario compartido.

**Qué hacer (técnico)** — tests primero:
- `POST /api/challenges/:id/steps` con batch `{ entries: [{ date, steps }] }` → upsert idempotente: subir la misma fecha dos veces actualiza, no duplica (UNIQUE(userId, challengeId, date)).
- `GET /api/challenges/:id/leaderboard?date=YYYY-MM-DD` → ordenado por pasos descendente, con el requester marcado.
- Dos miembros ven exactamente el mismo leaderboard.
- Empate de pasos → mismo rank, orden determinístico por `joinedAt`.

**Verificación**: tests corren y fallan.

---

## Tarea 2.6 — GREEN: módulo steps

**Qué hacer (técnico)**:
- Entidad `StepEntry` (userId, challengeId, date, steps; UNIQUE compuesto).
- Endpoint de sync en batch: upsert por (userId, challengeId, date). Idempotencia garantizada por constraint, no por lógica.
- Leaderboard: Redis sorted set `lb:{challengeId}:{date}` (score = pasos) con hidratación desde DB cuando hay cache miss, TTL 48h.
- Respuesta con `LeaderboardEntryDto` de `@fitness/contracts`.

**Verificación**: tests de 2.5 en verde + suite completa verde + `pnpm typecheck` verde.

---

## Cierre del cut (Backend)

- [ ] `pnpm --filter api test` — todo verde.
- [ ] `pnpm typecheck` — verde (incluye el fix preexistente).
- [ ] Flujo manual con curl/HTTP client: register → login → create → invite → join → sync → leaderboard.
- [ ] Migraciones aditivas commiteadas.
