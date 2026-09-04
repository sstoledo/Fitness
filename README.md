# Fitness — Monorepo

Live fitness challenges with friends. This is the base skeleton only: no business
logic yet. It exists so that backend and mobile work can proceed in parallel
without friction — it installs, builds, runs, and has minimal passing tests.

## Stack

- **Monorepo**: pnpm workspaces + Turborepo + Biome
- **API**: NestJS 11, TypeORM, PostgreSQL 16 + PostGIS, Redis 7, Socket.io, better-auth, Throttler
- **Mobile**: Expo SDK 56 (React Native 0.85, React 19.2, New Architecture, expo-router), TanStack Query, Zustand
- **Infra**: Docker Compose (PostGIS 16 + Redis 7)

## Prerequisites

- Node.js >= 22 (tested with v22.23.2)
- pnpm >= 11 (tested with 11.3.0)
- Docker with Compose plugin

## Quick start

```bash
# 1. Copy environment files (already done if .env exists at root)
cp .env.example .env
cp apps/api/.env.example apps/api/.env

# 2. Start infra (PostGIS + Redis)
docker compose up -d

# 3. Install dependencies (workspace-aware, from the root)
pnpm install

# 4. Run everything in dev mode
pnpm dev
```

- API: http://localhost:4000/api/health
- Mobile: `pnpm --filter mobile start`, then scan the QR with Expo Go or press `a` for Android / `i` for iOS simulators.

## Monorepo map

```
Fitness/
├── apps/
│   ├── api/      # NestJS 11 — REST + WebSocket gateway, TypeORM, better-auth placeholders
│   └── mobile/   # Expo SDK 56 — expo-router app, TanStack Query, Zustand, socket client stub
├── docker-compose.yml
├── turbo.json
├── biome.json
└── tsconfig.base.json
```

## Per-app notes

### apps/api

- Global prefix `/api`, global `ValidationPipe`, CORS enabled, global `ThrottlerGuard`.
- `TypeOrmModule.forRootAsync` reads `DATABASE_URL`. `synchronize: false` on
  purpose — schema migrations are a future task, do not enable synchronize.
- `GET /api/health` runs `SELECT 1`; returns `200 {"status":"ok","db":"up"}` when
  the database responds, `503 {"status":"error","db":"down"}` otherwise.
- `src/modules/auth/better-auth.ts` exports a minimal better-auth instance
  (email/password). The HTTP integration with NestJS is a future task.
- Tests run with Vitest; none of them require a database.

### apps/mobile

- `EXPO_PUBLIC_API_URL` (see `apps/mobile/.env.example`) points the client at the
  API. The home screen polls `GET /api/health` and shows **API: online/offline**.
- `src/store/useAppStore.ts`: placeholder Zustand store (socket connection state).
- `src/lib/socket.ts`: socket.io-client stub pointing at `EXPO_PUBLIC_API_URL`
  (no room logic yet).

## Known issues

None at bootstrap time. Anything found later goes here.

## Useful commands

```bash
pnpm --filter api build         # build NestJS API
pnpm --filter api test          # API unit tests (Vitest)
pnpm --filter mobile exec tsc --noEmit   # typecheck mobile
pnpm --filter mobile exec expo-doctor    # expo health check
docker compose ps               # infra status
```