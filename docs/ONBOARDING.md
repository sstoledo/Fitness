# Onboarding — Fitness MVP

> Doc de bienvenida para nuevos devs. En 10 minutos tenés el proyecto corriendo y entendés qué hay, cómo está armado y hacia dónde va.
> Fuente de verdad funcional: `openspec/changes/fitness-mvp/`. Detalle técnico por carril: `docs/CUT-1-BACKEND.md` y `docs/CUT-1-MOBILE.md`.

---

## Qué es esto

**Fitness** es una app mobile-first de **retos de fitness en vivo con amigos**. El contexto: Strava movió los retos grupales detrás de un paywall (~80 USD/año), y las alternativas están fragmentadas. Además, el efecto Köhler muestra ~+24% de esfuerzo cuando entrenás acompañado — eso es lo que aprovechamos.

Se construye en **3 cortes incrementales**:

| Corte | Contenido | Estado |
|---|---|---|
| **Cut 1** — Step Challenges | Auth, retos de pasos (HealthKit/Health Connect), leaderboard diario | 🟡 10/12 tareas (PRs #1–#5 mergeados) |
| **Cut 2** — Live GPS | Ubicación en background, mapa en vivo con posición de amigos, sockets | ⬜ No empezado |
| **Cut 3** — Social | Push notifications, stats, historial de retos | ⬜ No empezado |

---

## Quick start (web — el camino que usamos hoy)

El proyecto es **mobile**, pero el día a día lo levantamos en **web** porque es lo más rápido para iterar UI y lógica.

```bash
# 1. Requisitos: Node >= 22 (probado con v22.23.2), pnpm >= 11 (11.3.0), Docker con Compose
# 2. Levantar infra (PostGIS 16 + Redis 7)
docker compose up -d

# 3. Instalar dependencias (desde la raíz, workspace-aware)
pnpm install

# 4. Levantar la API
pnpm --filter api start:dev

# 5. En otra terminal, levantar mobile en web
pnpm --filter mobile web
```

- API: http://localhost:4000/api/health → debería responder `200 {"status":"ok","db":"up"}`
- Mobile (web): se abre en el navegador (Metro)

> **Nota sobre mocks**: en web no hay Health Connect ni un backend de steps completo todavía, así que el cliente usa flags mock para el desarrollo (ver `apps/mobile/.env.example`): `EXPO_PUBLIC_USE_CHALLENGE_MOCKS=1` y `EXPO_PUBLIC_USE_HEALTH_MOCKS=1`. Tienen `REMOVAL NOTE` — se borran cuando el backend real cubre esos caminos.

---

## Otras formas de correrlo (es mobile, después de todo)

| Entorno | Cuándo usarlo | Cómo |
|---|---|---|
| **Web** | Día a día: UI, formularios, flujos | `pnpm --filter mobile web` |
| **Emulador Android** | Comportamiento nativo sin dispositivo físico | `EXPO_PUBLIC_API_URL=http://10.0.2.2:4000` (el emulador no ve `localhost`) + `pnpm --filter mobile android`. Requiere Android SDK + KVM |
| **Dispositivo físico** | Pruebas reales (sensores, permisos) | `EXPO_PUBLIC_API_URL=http://<tu-IP-LAN>:4000` + Expo Go para lo básico |
| **Dev build nativo** | Health Connect / background location | `react-native-health-connect` **no corre en Expo Go ni web** — requiere prebuild + EAS build. Por eso existen los mocks |

---

## Arquitectura

```
Fitness/
├── apps/
│   ├── api/                    # NestJS 11 — REST + WebSocket gateway
│   │   └── src/modules/
│   │       ├── auth/           # better-auth + SessionGuard (bearer)
│   │       ├── challenges/     # create/join, store abstraction (ver abajo)
│   │       └── health/         # GET /api/health (SELECT 1)
│   └── mobile/                 # Expo SDK 57 — expo-router (file-based routing)
│       └── src/
│           ├── app/            # (auth)/, challenges/, (tabs)/
│           ├── lib/            # api.ts (cliente bearer), challenges.ts, health.ts,
│           │                   # step-sync.ts (+ outbox offline en SecureStore),
│           │                   # session-storage.ts, socket.ts (stub para Cut 2)
│           └── store/          # Zustand (sesión, socket state)
├── packages/contracts/         # @fitness/contracts — DTOs + schemas zod COMPARTIDOS
├── docker-compose.yml          # PostGIS 16 + Redis 7
└── openspec/changes/fitness-mvp/   # proposal, design, specs, tasks (la fuente de verdad)
```

### Las 4 decisiones arquitectónicas clave

1. **Contratos compartidos (`@fitness/contracts`)**: front y back hablan a través de DTOs validados con zod. Si el contrato cambia, ambos lados fallan en typecheck — no en runtime.
2. **`synchronize: false` en TypeORM**: el schema vive en **migraciones aditivas** (`apps/api/src/migrations/`), nunca autogeneradas. No hay sorpresas de schema en producción.
3. **Tests de API sin base de datos**: `ChallengesStore` es una abstracción con dos implementaciones — `InMemoryChallengesStore` (tests aislados, seeds determinísticos) y `TypeOrmChallengesStore` (producción, join transaccional con lock pesimístico para el límite de 20 miembros). `pnpm --filter api test` nunca pide Postgres.
4. **Auth con bearer token**: better-auth emite el token; el cliente lo guarda en SecureStore y lo manda en cada request. `SessionGuard` protege las rutas autenticadas.

---

## Stack actual

| Capa | Tecnologías |
|---|---|
| **Monorepo** | pnpm workspaces + Turborepo + Biome · TS strict |
| **API** | NestJS 11 · TypeORM 0.3 · PostgreSQL 16 + **PostGIS** · Redis 7 · better-auth · Socket.io 4.8 (gateway instalado, rooms en Cut 2) · Throttler · Vitest 3 |
| **Mobile** | Expo SDK 57 · React Native 0.86 · React 19 · expo-router · TanStack Query 5 · Zustand 5 · expo-secure-store · react-native-health-connect 4.1 · Skia + victory-native (gráficos) |
| **Infra** | Docker Compose (PostGIS + Redis) |

## Tecnologías pronosticadas (ya decididas, algunas ya instaladas)

| Para | Tecnología | Corte |
|---|---|---|
| Ubicación en background | `expo-location` + `expo-task-manager` — sampling adaptativo (3–5s en movimiento / 30–60s idle) + heartbeat 30s | Cut 2 |
| Mapa en vivo | Socket.io rooms (backed por Redis) + interpolación de markers con `reanimated`/`worklets` (patrón Uber) | Cut 2 |
| Geometrías de rutas | PostGIS (por eso TypeORM y no Prisma — soporte first-class de geometry) | Cut 2 |
| Leaderboard | Redis sorted sets (llega en la tarea #11, último backend del Cut 1) | Cut 1 |
| Push notifications | `expo-notifications` (ya instalado) | Cut 3 |
| Builds nativos | EAS Build (necesario para probar background location) | Cut 2+ |

---

## Cómo trabajamos (convenciones del equipo)

- **Ruleta par/impar**: Adrián = tareas impares (backend), Amigo = pares (mobile). Orden cronológico estricto en `docs/RUTA-CUT-1.md` — si tu tarea depende de una del otro, frenás y esperás (o ayudás).
- **RED antes que GREEN** (strict TDD en backend): la tarea impar anterior escribe los tests que fallan; la tuya los pone en verde sin tocar las assertions.
- **1 tarea = 1 commit** conventional en inglés, sin atribución AI, sin emojis.
- **Idiomas**: docs de coordinación en español; código, comentarios y UI copy en inglés.
- **Verificación antes de marcar hecha**: backend → `pnpm --filter api test` verde; mobile → `pnpm --filter mobile exec tsc --noEmit` + QA manual.
- **Estilo visual**: dark theme (`#0D0F0E` fondo / `#B8F04A` accent) — no tocar.

---

## Dónde estamos hoy (estado real)

| PR | Tareas | Qué trajo |
|---|---|---|
| #1 ✅ | 1–2 | Fix typecheck + pantallas auth (login/register, sesión en SecureStore, offline banner) |
| #2 ✅ | 3–4 | Tests RED de auth + wiring real con bearer contract |
| #3 ✅ | 5–6 | GREEN auth (endpoints better-auth, SessionGuard) + lista/crear retos UI |
| #4 ✅ | 7–8 | Tests RED de challenges + flujo de unirse a reto (deep link con invite token) |
| #5 ✅ | 9–10 | GREEN challenges (entidades + migración + endpoints reales) + health sync (Health Connect, outbox offline) |

**Lo que falta del Cut 1**: tarea #11 (backend: `StepEntry` con upsert idempotente + leaderboard con Redis sorted set) y #12 (mobile: pantalla de leaderboard + **prueba de integración: dos usuarios ven el mismo leaderboard** — el cierre del corte).

---

## Qué leer después

1. `docs/RUTA-CUT-1.md` — el orden cronológico y quién hace qué
2. `docs/CUT-1-BACKEND.md` o `docs/CUT-1-MOBILE.md` — según tu carril
3. `docs/DATABASE.md` — el modelo de datos (3NF)
4. `openspec/changes/fitness-mvp/proposal.md` — el porqué del producto

¿Dudas? Preguntá en el grupo — nadie nace sabiendo el dominio, y este proyecto está hecho para aprenderlo entre todos. 🚀
