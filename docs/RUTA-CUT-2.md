# Ruta cronológica — Cut 2

> Documento nuevo. NO reemplaza `docs/CUT-2-BACKEND.md` ni `docs/CUT-2-MOBILE.md` — esos siguen siendo el detalle técnico de cada tarea. Este es solo el **orden de ejecución**.
> Objetivo: retos GPS en vivo. Cualquiera de los 3 devs puede tomar cualquier tarea; el orden cronológico es la única regla de secuencia.

---

## Orden cronológico del Cut 2

| # | Tarea (ref) | Lado | Qué se hace | Depende de |
|---|---|---|---|---|
| 1 | Gateway realtime (4.1) | Backend | RED+GREEN: socket.io gateway con auth en handshake, rooms `challenge:{id}` con verificación de Membership, aislamiento cross-room con Redis adapter, pipeline `position:ping` → Redis hash → broadcast `position:update`, heartbeat ≤30s, stale >60s, entidades ActivitySession + Position (GiST) | Contratos de socket de Fase 0 ✅ |
| 2 | Captura GPS en background (4.2) | Mobile | Background task con task-manager consumiendo `computeSamplingInterval` (3–5s moviendo / 30–60s idle), extensión de `lib/socket.ts` con join/position:ping/heartbeat y auth por token, heartbeat ≤30s, detener tracking al terminar el reto | #1 (para validar pings contra Redis) |
| 3 | Mapa en vivo (4.3) | Mobile | Pantalla live map: polyline propia + marcadores de amigos con interpolación (reanimated/worklets), stale >60s → marcador gris. **Punto de integración: dos dispositivos se ven en vivo en el mapa** | #2 |

---

## Reglas de la ruta

1. **Orden estricto**: la tabla es cronológica. No adelantar una tarea si la anterior no está; si tu tarea depende de otra que aún no está, frenás y esperás (o ayudás) — pero no saltás de orden.
2. **Cada tarea = un commit** conventional en inglés, sin atribución AI.
3. **RED antes que GREEN** en backend (strict TDD): los tests RED son tu contrato, y la tarea NO se marca hecha hasta que pasan en verde.
4. **Verificación antes de marcar hecha**: backend → `pnpm --filter api test` verde + `pnpm typecheck`; mobile → `pnpm --filter mobile exec tsc --noEmit` + QA manual en dev build.
5. **Punto de integración**: la tarea #3 es el cierre del Cut 2 — dos dispositivos, mismo reto, ambos en el mapa en vivo (y un tercer reto aislado que NO los ve).
6. Si algo del detalle técnico no queda claro, la fuente es el PDD/TDD (`docs/CUT-2-*.md`) y `openspec/changes/fitness-mvp/`.