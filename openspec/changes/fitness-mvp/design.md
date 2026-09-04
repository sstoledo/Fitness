# Design: Fitness MVP — Live Fitness Challenges

## Technical Approach

Three incremental cuts on the existing NestJS 11 + TypeORM/PostGIS API and Expo SDK 57 mobile app. TypeORM for PostGIS-first support; Uber-style realtime (FusedLocation → Socket.io → Redis → client interpolation). Typed contract shared via `packages/contracts` so both developers work in parallel against the same DTOs and socket event schemas.

## Architecture

**API modules** (`apps/api/src/modules/`):

| Module | Responsibility |
|--------|----------------|
| `auth` | better-auth email/password; session token; Nest guard + socket auth guard |
| `challenges` | CRUD, invites, join (max 20), lifecycle (start/end) |
| `steps` | Idempotent step upload, daily leaderboard query |
| `realtime` | Socket.io gateway, room auth, Redis adapter, position ping pipeline |
| `notifications` | Push token registry, Expo push dispatch on invites/events |
| `stats` | History (newest-first) + aggregates (joined, wins, totals) |

**Mobile** (`apps/mobile/src/`): `app/` screens (expo-router: auth gate, challenge list/detail, live map, invite, history, stats), `health-sync/` (HealthKit/Health Connect readers), `location/` (background task + adaptive sampling hook), `lib/socket.ts` (exists; extend with room events), `store/` (zustand: session, live positions).

## Architecture Decisions

| Decision | Options | Tradeoff | Choice |
|----------|---------|----------|--------|
| Auth | better-auth vs hand-rolled JWT | Hand-rolled = auth bugs; better-auth already bootstrapped in `modules/auth` | better-auth, email/password only |
| Realtime state | Redis vs Postgres LISTEN/NOTIFY | Redis pub/sub + sorted sets = horizontal scale, cheap leaderboards | Redis |
| Position persistence | Write-through DB vs Redis-hot + DB-cold | GPS at 3s cadence would hammer Postgres | Redis-hot (TTL), positions flushed to DB on challenge end |
| Contract | `packages/contracts` (zod) vs inline types | zod schemas = runtime validation on socket events + shared DTO types | zod schemas in contracts |
| Sampling logic | Inline in task-manager callback vs pure module | No mobile test runner → logic must live in testable pure functions | `packages/contracts` types + pure `computeSamplingInterval(state)` helper, consumed by a mobile hook |
| Push | Raw APNs/FCM vs Expo push service | Expo abstracts both platforms, no certs to manage | expo-notifications → Expo push service |

**Workspace note**: `pnpm-workspace.yaml` currently lists only `apps/*`. Add `packages/*` and create `packages/contracts`.

## Data Model (TypeORM)

- **User** (id, email unique, name) — better-auth tables + app profile fields.
- **Challenge** (id, name, type `step|run|walk|bike`, status `pending|active|ended`, startDate, endDate, createdBy FK).
- **Membership** (userId, challengeId, role, joinedAt; PK composite; index on challengeId). Enforces ≤20 at service level.
- **Invite** (id, challengeId, inviterId, inviteeEmail, status, token unique).
- **StepEntry** (userId, challengeId, date, steps; **UNIQUE(userId, challengeId, date)** → upsert = idempotent sync).
- **ActivitySession** (id, challengeId, userId, startedAt, endedAt).
- **Position** (sessionId, recordedAt, `geo Geography(Point, 4326)`, speed) — written at session end from Redis buffer.
- **PushToken** (userId, token unique, platform, lastSeenAt).

Indexes: `StepEntry(challengeId, date)`, `Membership(userId)`, GiST on `Position.geo` (Cut 2+).

## Redis Layout

| Key | Type | TTL |
|-----|------|-----|
| `live:{challengeId}:pos:{userId}` | hash {lat,lng,ts} | 90s (refreshed per ping) |
| `live:{challengeId}:members` | set | challenge lifetime |
| `lb:{challengeId}:{date}` | sorted set (score=steps) | 48h cache over DB query |

**Ping flow**: client `position:ping` → gateway validates room membership → writes Redis hash → broadcasts `position:update` to `room challenge:{id}` → on stale (no heartbeat 60s) client-side marker greys out. Leaderboard served from sorted set, hydrated from DB on miss.

## Contracts (`packages/contracts`)

```ts
// DTOs
RegisterDto, LoginDto, ChallengeDto, CreateChallengeDto,
StepSyncBatchDto { entries: { date, steps }[] },
LeaderboardEntryDto { userId, name, steps, rank },
ChallengeHistoryDto, UserStatsDto

// Socket events (zod schemas, validated on BOTH sides)
Client→Server: join { challengeId }, position:ping { lat, lng, ts }, heartbeat {}
Server→Client: position:update { userId, lat, lng, ts }, member:joined, member:stale { userId }
```

## Socket.io

- **Auth**: handshake `auth: { token }` → server validates better-auth session → rejects with `connect_error` on invalid.
- **Rooms**: `challenge:{id}`; `join` handler verifies Membership row; non-member → emit `error` + disconnect from room.
- **Isolation**: positions emitted only via `io.to(room)`; adapter `@socket.io/redis-adapter` for multi-instance.
- **Heartbeat/stale**: client sends heartbeat ≤30s; server stamps last-seen in Redis; clients compute staleness (>60s) locally.

## Push Notifications

expo-notifications → `PushToken` upsert on authenticated app start (denied = silent no-op). Triggers: invite created (to invitee), challenge started/ended (to all members). Payload includes `challengeId` + `type` for deep-link routing to invite screen.

## Sampling / Battery

Pure function `computeSamplingInterval({ speed, lastMoveAt })` → 3000–5000ms moving / 30000–60000ms idle, in `packages/contracts` or `apps/mobile/src/location/sampling.ts` (pure, unit-testable later). task-manager task consumes it; reconfigures `Location.startLocationUpdatesAsync` interval on transitions. Foreground map uses 3s fixed.

## Threat Matrix

N/A — no routing, shell, subprocess, VCS/PR automation, executable-file classification, or process-integration boundary. Socket auth/room isolation covered above and tested via gateway integration tests.

## Cut Plan

1. **Cut 1**: contracts pkg + workspace, auth wiring, challenges + steps + leaderboard modules, mobile auth/health-sync/leaderboard screens.
2. **Cut 2**: Position/ActivitySession entities, realtime gateway + Redis, location capture + live map.
3. **Cut 3**: notifications module + push registration, stats/history endpoints + screens.

## Testing Strategy (strict TDD, `pnpm --filter api test`, Vitest)

| Layer | What | Approach |
|-------|------|----------|
| Unit | date validation, capacity check, step upsert idempotency, leaderboard tie-break (joinedAt), sampling function | RED first per scenario |
| Integration | register 201/409/400, login 200/401, join 403/409, leaderboard identical across members, socket join rejection for non-member, cross-room isolation | supertest + Testcontainers (PostGIS, Redis) |
| Mobile | none (no runner) — logic kept in pure modules, manual QA matrix per device |

## Migration / Rollout

TypeORM migrations, additive-only; `synchronize:false` stays. Each cut = own PR; revert = git revert.

## Open Questions

- [ ] Testcontainers vs docker-compose reuse for API integration tests (decide in tasks).
- [ ] better-auth Expo deep-link/session cookie vs bearer token transport (confirm during Cut 1).
