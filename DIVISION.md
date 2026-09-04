# Fitness MVP — División de trabajo para 2 personas

> Fuente: `openspec/changes/fitness-mvp/` (proposal → specs → design → tasks).
> Este documento es la guía práctica para repartirse el trabajo. Las tareas detalladas con criterios de verificación están en `openspec/changes/fitness-mvp/tasks.md`.

---

## 1. Resumen de la división

El MVP está cortado en **3 cortes incrementales**, y cada corte se divide en **dos carriles paralelos: backend y mobile**. Antes de eso hay una **Fase 0 compartida (ya hecha)** que desbloquea a ambos.

```
Fase 0  (HECHA ✅)     → packages/contracts: tipos, schemas de sockets, lógica de sampling
Cut 1   (retos de pasos)   → Backend: auth + retos + pasos + leaderboard | Mobile: auth + sync de pasos + UI
Cut 2   (GPS en vivo)      → Backend: gateway realtime + Redis           | Mobile: ubicación en background + mapa en vivo
Cut 3   (social)           → Backend: notificaciones + stats             | Mobile: push + pantallas de historial
```

Total: **20 tareas** con owner marcado (`[Backend]`, `[Mobile]`, `[Shared]`), orden de dependencias y forma de verificar cada una.

---

## 2. Por qué este enfoque

| Decisión | Motivo |
|---|---|
| **Cortes incrementales (1→2→3)** | Cada corte da algo que funciona y se puede probar en el teléfono. El Cut 1 (pasos) ya tiene valor propio y valida el hueco de mercado (Strava puso los retos grupales detrás del paywall). Si el proyecto muere a la mitad, queda algo usable. |
| **Contratos primero (Fase 0)** | `packages/contracts` define los DTOs y eventos de socket que ambos lados consumen. Sin esto, backend y mobile se pisan o se bloquean esperando al otro. Con esto, **los dos trabajan en paralelo desde el día uno**. |
| **Split backend/mobile por corte** | Son dos mundos con stacks distintos (NestJS vs Expo) y casi cero solapamiento de archivos. Es la división que menos conflictos de merge genera. |
| **TDD en backend, QA manual en mobile** | El API tiene runner de tests (Vitest); mobile todavía no (riesgo conocido). La lógica crítica de mobile (sampling, contratos) se movió a código puro testeable en `packages/contracts`. |
| **Una sola PR grande** | Decisión del equipo: se aprueba `size:exception`. Los commits igual van por work units (una tarea = un commit reviewable), la PR acumula todo el MVP. |

---

## 3. Cómo se trabaja (workflow)

1. **Ambos clonan el repo y levantan la base**: `docker compose up -d` (PostGIS + Redis) → `pnpm install` → verificar que `curl http://localhost:4000/api/health` responde `{"status":"ok","db":"up"}`.
2. **Ramas**: trabajen cada uno en su rama (`feat/backend-cut1`, `feat/mobile-cut1`) o directo en una rama compartida si se sincronizan bien. Al final, todo converge en una sola PR a main.
3. **Cada tarea = un commit** con mensaje conventional (ej: `feat(api): add step sync endpoint`).
4. **Antes de pasar a la siguiente tarea**: correr la verificación que dice `tasks.md` (backend: `pnpm --filter api test`; mobile: prueba manual en dev build de Expo).
5. **Sincronización diaria corta**: si mobile necesita un endpoint que todavía no existe, se mockea contra los DTOs de `@fitness/contracts` y se sigue. Nunca frenar al otro.
6. **Punto de integración al final de cada corte**: probar el criterio de éxito del corte (están en el proposal). Ejemplo Cut 1: *dos usuarios se unen a un reto de pasos y ven el mismo leaderboard diario*.

---

## 4. La división para 2 personas

### ✅ Opción elegida: A — Split estricto backend/mobile

**Decisión tomada por el equipo.** Los documentos de trabajo por carril, con cada tarea detallada punto por punto (estilo PDD/TDD), están en:

- **`docs/CUT-1-BACKEND.md`** — carril backend, tareas 2.1 a 2.6
- **`docs/CUT-1-MOBILE.md`** — carril mobile, tareas 3.1 a 3.3

> Por ahora solo está detallado el **Cut 1** (retos de pasos). Los documentos de Cut 2 y Cut 3 se generan cuando el Cut 1 esté integrado.

**Dev 1 → Backend** (`apps/api`, `packages/contracts` si hace falta ajustar algo)

| Corte | Tareas | Qué construye |
|---|---|---|
| Cut 1 | 2.1 – 2.6 | Auth (better-auth wiring), retos + invitaciones (máx. 20, fechas válidas), sync idempotente de pasos, leaderboard diario con Redis |
| Cut 2 | 4.1 | Gateway Socket.io: rooms por reto, aislamiento cross-room, ping pipeline con Redis, detección de stale >60s |
| Cut 3 | 5.1 | Notificaciones push (registro de tokens, disparo en invitación/inicio/fin), endpoints de stats e historial |
| Cierre | 6.1 | `pnpm --filter api test` + typecheck verdes |

**Dev 2 → Mobile** (`apps/mobile`)

| Corte | Tareas | Qué construye |
|---|---|---|
| Cut 1 | 3.1 – 3.3 | Pantallas de auth, lectura HealthKit/Health Connect + sync de pasos, lista de retos + leaderboard |
| Cut 2 | 4.2 – 4.3 | Captura GPS en background (con `computeSamplingInterval` de contracts), conexión a rooms, mapa en vivo con interpolación de marcadores |
| Cut 3 | 5.2 – 5.3 | Registro de push + deep-link a invitación, pantallas de historial y stats |
| Cierre | 6.2 | README/docs de setup actualizados |

✅ **Por qué se eligió**: cada uno aprende su stack a fondo, cero conflictos de archivos, avance en paralelo real. Si uno termina su carril antes, toma tareas del siguiente corte de su propio carril.
⚠️ **Costo conocido**: si uno se traba, el otro no puede destrabarlo fácil sin salir de su stack — coordinar en la sincronización diaria.

---

## 5. Pendientes conocidos (anotarlos antes de arrancar)

- ⚠️ `pnpm --filter api typecheck` **falla en el commit de bootstrap** (`health.controller.spec.ts` usa mocks sin tipear). Fix rápido: tipear con `vi.fn()`. Dev Backend arranca con esto.
- Mobile no tiene test runner: la QA es manual en dev build. Si quieren, agregar `jest-expo` como tarea extra fuera del MVP.
- Decisión abierta del design: transporte de sesión better-auth en Expo (cookie vs bearer) — se confirma en la tarea 2.2/3.1.

---

## 6. Cuando terminen

Con los tres cortes listos → se corre `sdd-verify` (valida contra las specs) y después `sdd-archive` (cierra el change y deja el estado final persistido).
