# Cut 2 — Mobile (PDD/TDD de trabajo)

> Carril: **Mobile** · Proyecto: Fitness MVP · Change: `fitness-mvp`
> Base: Cut 1 hecho (auth, sync de pasos, lista/detalle de retos). Contratos de socket ya definidos en Fase 0 — `packages/contracts` con schemas zod (importar como `@fitness/contracts`).
> Fuente de verdad funcional: `openspec/changes/fitness-mvp/specs/live-gps-challenges/spec.md`.
> Técnico: `openspec/changes/fitness-mvp/design.md`.
>
> **Nota de testing**: mobile no tiene test runner todavía. La verificación es QA manual en dev build de Expo (no Expo Go — los módulos nativos de ubicación y background task no corren ahí). La lógica crítica vive testeada en `packages/contracts` (incluido `computeSamplingInterval`, tarea 1.3 de Fase 0).

---

## Objetivo del producto en este cut (PDD)

Que el usuario pueda correr/caminar/andar en bici un reto GPS en vivo: la app captura su posición en background con sampling adaptativo, mantiene un heartbeat, y en el mapa en vivo se ve la ruta propia más los marcadores de los amigos moviéndose con interpolación.

**Criterio de éxito del cut**: dos dispositivos en el mismo reto se ven en vivo en el mapa (la ruta de uno aparece en el otro, en tiempo real).

---

## Antes de arrancar

1. API corriendo local: `docker compose up -d` + backend en `:4000`.
2. **Dev build obligatorio**: `npx expo prebuild` + build EAS o local. Background location NO corre en Expo Go.
3. `.env` en `apps/mobile` con `EXPO_PUBLIC_API_URL=http://<tu-IP-LAN>:4000` (dispositivo físico).
4. Confirmar con Backend el transporte del token de sesión para el handshake de socket (`auth: { token }`) — mismo bearer de 2.2.
5. Contratos de socket listos en `@fitness/contracts`: `join { challengeId }`, `position:ping { lat, lng, ts }`, `heartbeat {}`, `position:update { userId, lat, lng, ts }`, `member:joined`, `member:stale { userId }`.

---

## Tarea 4.2 — Captura GPS en background

**Qué se construye (producto)**: mientras el reto está activo, el teléfono reporta posición sola — aunque la app esté en background — y avisa que sigue vivo.

**Qué hacer (técnico)**:
- Módulo `src/location/` con background task vía `expo-task-manager` que consume el helper puro `computeSamplingInterval({ speed, lastMoveAt })` de `@fitness/contracts` → **3000–5000ms en movimiento / 30000–60000ms idle**.
- Al detectar transiciones (moviendo ↔ idle), reconfigurar `Location.startLocationUpdatesAsync` con el intervalo nuevo. En foreground, sampling fijo de **3s**.
- Extender `src/lib/socket.ts` (ya existe como stub) con los eventos de room:
  - Client→Server: `join { challengeId }`, `position:ping { lat, lng, ts }`, `heartbeat {}`.
  - Auth del handshake: socket.io `auth: { token }` con el bearer de la sesión (SecureStore).
  - Server→Client (a consumir en 4.3): `position:update { userId, lat, lng, ts }`, `member:joined`, `member:stale { userId }`.
- Heartbeat al menos cada **30s** (el servidor actualiza last-seen en Redis).
- Detener el tracking al terminar el reto o al salir del mismo (deja de mandar pings y heartbeat, limpia la background task).
- Requiere permisos de **background location** + dev build: documentar el flujo de permisos (foreground first, luego "Always" para background) y el caso "denied" sin crashear.

**Verificación manual/typecheck**: `pnpm --filter mobile exec tsc --noEmit` verde + con backend corriendo, los pings del dispositivo llegan a los hashes Redis `live:{challengeId}:pos:{userId}` (chequear con `redis-cli HGETALL`).

---

## Tarea 4.3 — Mapa en vivo

**Qué se construye (producto)**: la pantalla del reto muestra el mapa con la ruta propia (polyline) y los marcadores de los amigos que se mueven con interpolación; un amigo que dejó de reportar se ve marcado como inactivo.

**Qué hacer (técnico)**:
- Pantalla live map (expo-router, formato del reto GPS) con:
  - **Ruta propia**: polyline con las posiciones acumuladas del dispositivo.
  - **Marcadores de amigos**: última posición recibida por `position:update`; movimiento interpolado con `reanimated`/`worklets` (patrón Uber — suavizar entre posiciones consecutivas, no saltos).
  - Estados: sin sesión activa, conectando, error de conexión con retry.
- **Stale >60s**: un amigo sin `position:update` reciente (o con evento `member:stale { userId }`) se muestra **gris/inactivo**; calculable localmente contra el `ts` de la última posición.
- Posiciones propias en el store de zustand (`store/` — live positions) alimentadas por el módulo de socket de 4.2.
- Consumir los DTOs/schemas de `@fitness/contracts` para los eventos (validación en runtime de los mensajes entrantes).

**Verificación (manual)**: dos dispositivos en el MISMO reto se ven en vivo en el mapa — el criterio de éxito del cut. Probar también: tercer dispositivo en OTRO reto no ve a estos usuarios (aislamiento), y un amigo que cierra la app queda gris a los ~60s.

---

## Cierre del cut (Mobile)

- [ ] Dos dispositivos en el mismo reto se ven en vivo en el mapa (punto de integración con Backend).
- [ ] Background: la app puesta en segundo plano sigue reportando posición y heartbeat.
- [ ] Compañero inactivo >60s → marcador gris/inactivo.
- [ ] Sin errores de typecheck: `pnpm --filter mobile exec tsc --noEmit`.
- [ ] QA manual por dispositivo documentada (qué probaste, en qué equipo).