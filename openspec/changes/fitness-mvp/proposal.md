# Proposal: Fitness MVP — Live Fitness Challenges with Friends

## Intent

Strava moved group challenges behind a $79.99/yr paywall (2026); alternatives are fragmented (NRC free but no Strava sync, RaceMe iOS-only, Stridekick capped at 10 people/7 days free). Fitness is the highest-volume category in the 136K-review report (8,687 reviews), and the Köhler effect shows +24% effort when training with friends. We build a mobile-first app for live fitness challenges with friends, shipped in three incremental cuts.

## Scope

### In Scope — Cut 1: Step Challenges
- Auth (register/login) via better-auth
- Step challenges synced from HealthKit / Health Connect (no continuous GPS)
- Daily leaderboard per challenge

### In Scope — Cut 2: Live GPS Challenges
- Background location: expo-location + task-manager, adaptive sampling (3–5s moving / 30–60s idle), 30s heartbeat
- Live map: own route + friend's position with marker interpolation (reanimated)
- Socket.io rooms backed by Redis

### In Scope — Cut 3: Full Social
- Push notifications (challenge invites, events)
- Stats and challenge history

### Out of Scope
- Strava/Garmin/third-party sync; wearables beyond phone health stores
- Payments/subscriptions; feed, comments, chat; public/global challenges
- Web client; mobile test-runner setup (tracked separately)

## Capabilities

### New Capabilities
- `user-auth`: registration, login, session management (better-auth)
- `step-challenges`: create/join step challenges, health-data sync, daily leaderboard
- `live-gps-challenges`: realtime GPS tracking, live map with friend positions, socket rooms
- `social-notifications`: push notifications, stats, challenge history

### Modified Capabilities
- None (greenfield; `openspec/specs/` is empty)

## Approach

- Monorepo already bootstrapped: pnpm + Turborepo + TS strict; Expo SDK 57 mobile, NestJS 11 + TypeORM + PostGIS API.
- **TypeORM (not Prisma)** for first-class PostGIS geometry support (decided).
- Realtime pattern (Uber-style): FusedLocation → WebSocket → marker interpolation on client.
- **Two-developer split**: backend owns `apps/api` (auth, challenge domain, sockets, Redis); mobile owns `apps/mobile` (health sync, location, map, UI). Contract shared via typed DTOs/socket event schemas in a shared package.
- strict_tdd on API (`pnpm --filter api test`, Vitest); mobile untested until a runner lands.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `apps/api` | Modified | auth, challenge/leaderboard modules, Socket.io gateway |
| `apps/mobile` | Modified | auth screens, health sync, map, sockets |
| `packages/` | New | shared DTO/event contracts |
| `docker-compose.yml` | Modified | PostGIS + Redis already healthy |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Background location killed by OS | High | task-manager + heartbeat; document platform limits |
| HealthKit/Health Connect permission/data variance | Med | manual QA matrix per device |
| No mobile test runner | Med | keep logic in testable shared/hooks; add runner later |

## Rollback Plan

Each cut ships behind its own merge; revert = git revert of the cut's PRs. No destructive migrations before Cut 2; PostGIS columns additive-only.

## Dependencies

- Apple HealthKit / Google Health Connect entitlements; EAS build for background-location testing.

## Success Criteria

- [ ] Cut 1: two users join a step challenge and see the same daily leaderboard
- [ ] Cut 2: two devices see each other's live interpolated position on the map
- [ ] Cut 3: invite push notification received; history/stats screens populated
- [ ] `pnpm --filter api test` and `pnpm typecheck` green

## Assumptions & Open Questions (auto mode — review welcome)

1. MVP targets iOS + Android via Expo dev builds (no store release).
2. Challenges are private, invite-only, small groups (<20 people).
3. GPS challenges are run/walk/bike only; no routing or turn-by-turn.
