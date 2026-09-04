# Cut 1 — Mobile (PDD/TDD de trabajo)

> Carril: **Mobile** · Proyecto: Fitness MVP · Change: `fitness-mvp`
> Base: Fase 0 ya hecha (`packages/contracts` con DTOs y schemas zod — importar como `@fitness/contracts`).
> Fuente de verdad funcional: `openspec/changes/fitness-mvp/specs/{user-auth,step-challenges}/spec.md`.
> Técnico: `openspec/changes/fitness-mvp/design.md`.
>
> **Nota de testing**: mobile no tiene test runner todavía. La verificación es QA manual en dev build de Expo (no Expo Go — los módulos nativos de salud no corren ahí). La lógica crítica ya vive testeada en `packages/contracts`.

---

## Objetivo del producto en este cut (PDD)

Que el usuario pueda: registrarse/loguearse, pedir permiso de salud, sincronizar sus pasos del día, ver sus retos y el leaderboard diario con sus amigos. Sin GPS ni mapas todavía.

**Criterio de éxito del cut**: dos usuarios se unen a un reto de pasos y ven el mismo leaderboard diario.

---

## Antes de arrancar

1. API corriendo local: `docker compose up -d` + backend en `:4000`.
2. Crear dev build: `npx expo prebuild` + build con EAS o local (`npx expo run:android` / `run:ios`). Expo Go NO sirve.
3. `.env` en `apps/mobile` con `EXPO_PUBLIC_API_URL=http://localhost:4000` (en dispositivo físico, la IP de tu máquina).
4. Acordar con Backend el transporte de sesión (bearer token recomendado) — decisión abierta en tarea 2.2 del backend.

---

## Tarea 3.1 — Auth: pantallas + sesión

**Qué se construye (producto)**: registro, login, sesión persistente, logout. Si el token vence, volver a login.

**Qué hacer (técnico)**:
- Pantallas con expo-router: `(auth)/login.tsx`, `(auth)/register.tsx`, y auth gate en `_layout.tsx` (si no hay sesión → redirect a login).
- Formularios con validación por campo antes de enviar (email válido, password ≥ 8) — reusar los schemas zod de `@fitness/contracts`.
- Sesión en zustand (`useAppStore` ya existe como placeholder) + persistencia del token en `expo-secure-store`.
- Cliente HTTP que adjunta el token a cada request; al recibir 401 → limpiar sesión + redirect a login.
- Al relanzar la app con token válido → entrar directo a home.
- Logout: llamar al endpoint + limpiar token local.

**Verificación (manual)**: registro OK, login OK, cerrar y reabrir la app sin re-login, logout vuelve a login, token inválido fuerza login.

---

## Tarea 3.2 — Sync de pasos (HealthKit / Health Connect)

**Qué se construye (producto)**: la app lee los pasos del día del teléfono y los sube al reto activo.

**Qué hacer (técnico)**:
- Módulo `src/health-sync/`:
  - iOS: HealthKit (librería `@kingstinct/react-native-healthkit`).
  - Android: Health Connect (`react-native-health-connect`).
- Pedir permiso explícito al entrar a la pantalla del reto. Si el usuario lo niega → empty state explicativo (sin crashear, sin datos).
- Leer pasos del día actual y hacer `POST /api/challenges/:id/steps` con el formato `StepSyncBatchDto` de contracts (`{ entries: [{ date, steps }] }`).
- El sync es idempotente del lado del servidor — no te preocupes por duplicados.
- Disparar sync al abrir el detalle del reto y con pull-to-refresh.

**Verificación (manual)**: con permiso otorgado, los pasos aparecen en el leaderboard; con permiso denegado, se ve la pantalla explicativa.

---

## Tarea 3.3 — Pantallas de retos + leaderboard

**Qué se construye (producto)**: lista de mis retos, detalle del reto con leaderboard diario.

**Qué hacer (técnico)**:
- Pantalla lista de retos (activos + próximos), consumiendo `GET /api/challenges` (con tanstack-query — provider ya montado en el layout).
- Pantalla detalle: nombre, fechas, miembros, leaderboard diario con `LeaderboardEntryDto` (nombre, pasos, rank) y el usuario actual resaltado.
- Crear reto: formulario simple (nombre, tipo `step`, fechas).
- Invitar: compartir token/link de invitación (deep-link se completa en Cut 3; acá alcanza con mostrar el token o un flujo de unión por código).
- Estados: loading, vacío ("todavía no tenés retos"), error con retry.

**Verificación (manual)**: dos usuarios en dos dispositivos (o dispositivo + emulador) se unen al mismo reto y ven el MISMO leaderboard — este es el criterio de éxito del cut.

---

## Cierre del cut (Mobile)

- [ ] Flujo completo en dev build: register → login → permiso salud → sync → leaderboard.
- [ ] Dos usuarios ven el mismo leaderboard (punto de integración con Backend).
- [ ] Sin errores de typecheck: `pnpm --filter mobile exec tsc --noEmit`.
- [ ] QA manual por dispositivo documentada (qué probaste, en qué equipo).
