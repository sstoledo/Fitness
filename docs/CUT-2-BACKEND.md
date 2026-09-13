# Cut 2 — Backend (PDD/TDD de trabajo)

> Carril: **Backend** · Proyecto: Fitness MVP · Change: `fitness-mvp`
> Base: Cut 1 hecho (auth, challenges, steps, leaderboard). Contratos de socket ya definidos en Fase 0 — `packages/contracts` con schemas zod (importar como `@fitness/contracts`).
> Fuente de verdad funcional: `openspec/changes/fitness-mvp/specs/live-gps-challenges/spec.md`.
> Técnico: `openspec/changes/fitness-mvp/design.md`.
>
> **Regla de oro (strict TDD)**: cada tarea arranca con el test en ROJO (que falla) y termina cuando pasa en VERDE. Comando: `pnpm --filter api test`.

---

## Objetivo del producto en este cut (PDD)

Retos GPS en vivo (run/walk/bike) con sesión realtime por reto: cada reto es una sala aislada donde los miembros ven las posiciones de los demás en tiempo real. Nada de feeds ni comentarios — solo el mapa en vivo y la sesión que lo alimenta.

**Criterio de éxito del cut**: dos dispositivos en el mismo reto se ven en vivo en el mapa, y las posiciones de un reto nunca llegan a los miembros de otro.

---

## Antes de arrancar

1. `docker compose up -d` (PostGIS + Redis deben quedar healthy).
2. `pnpm install`.
3. Contratos de socket ya listos en `packages/contracts` (Fase 0): `join { challengeId }`, `position:ping { lat, lng, ts }`, `heartbeat {}`, `position:update { userId, lat, lng, ts }`, `member:joined`, `member:stale { userId }`.
4. **Decisión abierta** (del design/tasks): infraestructura de tests de integración del gateway — Testcontainers (PostGIS + Redis efímeros) vs reutilizar docker-compose. Definir antes de escribir los tests RED. La suite de Cut 1 usó Testcontainers; confirmar que el adapter de Redis queda cubierto por la misma elección.

---

## Tarea 4.1 — RED+GREEN: gateway realtime

**Qué se construye (producto)**: la sesión realtime de un reto: te conectás, entrás a la sala de tu reto, y tus posiciones se comparten en vivo con los miembros — y solo con ellos.

**Qué hacer (técnico)** — tests primero (RED):
- Socket join rejection: un socket con sesión válida PERO sin Membership en el reto → join rechazado (emit `error` + disconnect de la room).
- Cross-room isolation: un `position:ping` enviado en `challenge:{1}` no llega a ningún socket de `challenge:{2}`.
- Stale >60s: con last-seen vencido (sin heartbeat durante más de 60s), el pipeline marca/emite el miembro como stale (`member:stale { userId }`).
- Handshake inválido: socket con `auth: { token }` no válido → `connect_error` y no entra a ninguna room.
- Los tests DEBEN fallar (el gateway todavía no existe o no cubre estos caminos).

**Qué hacer (técnico)** — GREEN:
- **Auth en handshake**: el gateway valida el session token de better-auth en `auth: { token }` del handshake de socket.io. Token inválido → `connect_error`; no se crea sesión de socket.
- **Rooms y membresía**: rooms `challenge:{id}`. El handler `join { challengeId }` verifica la Membership en DB; non-member → rechazado (emit `error` + disconnect de la room).
- **Aislamiento cross-room**: todo broadcast sale SOLO por `io.to(room)` de la sala correspondiente; nunca `io.emit` global. Adapter `@socket.io/redis-adapter` para escalar a múltiples instancias sin romper el aislamiento.
- **Pipeline de pings**: `position:ping { lat, lng, ts }` → validar membresía → escribir hash Redis `live:{challengeId}:pos:{userId}` con `{ lat, lng, ts }` y TTL 90s (refreshed por cada ping) → broadcast `position:update { userId, lat, lng, ts }` al room `challenge:{id}`.
- **Heartbeat / stale**: el cliente manda `heartbeat {}` al menos cada 30s; el servidor actualiza el last-seen en Redis. Staleness >60s: el evento `member:stale { userId }` queda documentado en el contrato; los clientes también pueden computarla localmente contra el `ts` de la última posición (patrón del design — ver reporte de ambigüedades).
- **Entidades (Cut 2)**: `ActivitySession` (id, challengeId, userId, startedAt, endedAt) y `Position` (sessionId, recordedAt, `geo Geography(Point, 4326)`, speed) con índice **GiST** sobre `geo`. Migraciones aditivas (`synchronize:false` se mantiene).
- **HOT/cold**: las posiciones en vivo viven SOLO en Redis (hot, TTL 90s); al terminar el reto se vuelcan de Redis a DB (`Position` por sesión) — no hay write-through por ping.
- Protegido con el session guard de 2.2 + validación de mensajes con los schemas zod de `@fitness/contracts`.

**Verificación**: los tests RED de arriba pasan en verde + `pnpm --filter api test` completo verde.

---

## Cierre del cut (Backend)

- [ ] `pnpm --filter api test` — todo verde (incluye los tests del gateway: join rejection, cross-room isolation, stale >60s).
- [ ] `pnpm typecheck` — verde.
- [ ] Flujo manual con dos sockets (por ej. `socket.io-client` en scripts): handshake con token válido → join → `position:ping` desde A → B recibe `position:update`; handshake con token inválido → `connect_error`.
- [ ] Migraciones aditivas commiteadas (ActivitySession + Position + índice GiST).