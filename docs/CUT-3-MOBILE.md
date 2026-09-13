# Cut 3 — Mobile (PDD/TDD de trabajo)

> Carril: **Mobile** · Proyecto: Fitness MVP · Change: `fitness-mvp`
> Base: Cuts 1 y 2 hechos (auth, sync pasos, leaderboard, captura GPS + mapa en vivo). Contratos de `packages/contracts` completos (importar como `@fitness/contracts`).
> Fuente de verdad funcional: `openspec/changes/fitness-mvp/specs/social-notifications/spec.md`.
> Técnico: `openspec/changes/fitness-mvp/design.md`.
>
> **Nota de testing**: mobile no tiene test runner todavía. La verificación es QA manual en dev build de Expo (los push de Expo no llegan en Expo Go — requiere dev build con `expo-notifications`). Typecheck: `pnpm --filter mobile exec tsc --noEmit`.

---

## Objetivo del producto en este cut (PDD)

El usuario recibe un push cuando lo invitan a un reto, lo toca y cae en la pantalla de la invitación (aceptar/rechazar). Además, desde la app ve su historial de retos terminados y sus estadísticas acumuladas.

**Criterio de éxito del cut**: la invitación llega como push al dispositivo y, al tocarla, se abre la pantalla de la invitación con accept/decline.

---

## Antes de arrancar

1. API corriendo local (incluye el módulo de notifications/history/stats del backend del cut); Backend ya despacha con el payload `{ challengeId, type }`.
2. **Dev build obligatorio** para recibir push reales: `expo-notifications` requiere build nativo (EAS o local). Expo Go no sirve para validar el envío.
3. Proyecto de Expo configurado para push (projectId en `app.json`) + credenciales/entorno del push service que usa el backend.
4. Contratos listos en `@fitness/contracts`: `ChallengeHistoryDto`, `UserStatsDto` (y los tipos del payload de push).

---

## Tarea 5.2 — Push registration + deep-link

**Qué se construye (producto)**: la app se registra para recibir pushes cuando hay sesión activa, y si tocan una notificación de invitación, abre la pantalla de la invitación.

**Qué hacer (técnico)**:
- **Registro al arrancar autenticado**: pedir permiso de notificaciones con `expo-notifications`.
  - Otorgado → obtener el token del dispositivo y hacer upsert en la API (`POST /api/push-tokens` o la ruta que defina el backend) con platform.
  - **Denegado → no-op silencioso**: la app sigue funcionando normal, sin re-prompt agresivo ni ventanas repetidas.
- **Listener de notificaciones**: al recibir una notificación con payload `{ challengeId, type }`:
  - `type: "invite"` → deep-link a la pantalla de la invitación (`accept`/`decline`), consumiendo el flujo de invite existente del Cut 1.
  - `type: "challenge_started"` / `"challenge_ended"` → no requieren pantalla de invite en este cut (a lo sumo abrir el detalle del reto si está activo; decisión menor de UX, no bloquea el criterio de éxito).
- Manejar ambos caminos: app en foreground (listener activo) y cold-start desde el push (payload inicial en `getLastNotificationResponseAsync` / `useLastNotificationResponse`).

**Verificación (manual en dev build)**: con sesión iniciada y permiso otorgado, un segundo usuario invita → el push llega nombrando reto e inviter → al tocarlo se abre la pantalla de la invitación. Con permiso denegado: la app funciona sin push y sin re-promptos.

---

## Tarea 5.3 — History + Stats screens

**Qué se construye (producto)**: dos pantallas — historial de retos terminados (newest-first, con rank final) y estadísticas del usuario (joined, wins, acumulados).

**Qué hacer (técnico)**:
- **Pantalla historial**: consumiendo `GET /api/history` → `ChallengeHistoryDto` — retos pasados newest-first con nombre, fechas, tipo y rank final. **Empty state** cuando no hay retos terminados.
- **Pantalla stats**: consumiendo `GET /api/stats` → `UserStatsDto` — challenges joined, wins, cumulative distance/steps.
- Ambas con tanstack-query (provider ya montado): estados **loading / vacío / error con retry**.
- Navegación desde tabs/detalle de reto según el layout existente.

**Verificación (manual)**: historial y stats se ven poblados desde la API real; usuario sin retos terminados ve el empty state; error de red → estado de error con retry. Typecheck verde.

---

## Cierre del cut (Mobile)

- [ ] Push de invitación recibido en dispositivo en dev build y tappable → abre la pantalla de invite con accept/decline (punto de integración con Backend).
- [ ] Permiso denegado → la app funciona sin push y sin re-promptos.
- [ ] Historial y stats con estados loading/vacío/error correctos.
- [ ] Sin errores de typecheck: `pnpm --filter mobile exec tsc --noEmit`.
- [ ] QA manual por dispositivo documentada (qué probaste, en qué equipo).