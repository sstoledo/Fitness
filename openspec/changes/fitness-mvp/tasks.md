# Tasks: Fitness MVP — Live Fitness Challenges

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 3,500–5,000 (all 3 cuts) |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR per cut → WU1 contracts → WU2 Cut 1 backend → WU3 Cut 1 mobile → WU4 Cut 2 → WU5 Cut 3 |
| Delivery strategy | ask-on-risk |
| Chain strategy | pending |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: pending
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| 1 | `packages/contracts` + workspace wiring | PR 1 | `pnpm --filter contracts test` | `pnpm typecheck` in api+mobile | Revert `packages/contracts`, `pnpm-workspace.yaml` |
| 2 | Cut 1 backend: auth, challenges, steps, leaderboard | PR 2 | `pnpm --filter api test` | docker compose up; supertest flows register→create→join→sync→leaderboard | Revert api modules; additive migrations only |
| 3 | Cut 1 mobile: auth screens, health sync, leaderboard UI | PR 3 | N/A (no runner — track risk) | Expo dev build manual QA matrix | Revert `apps/mobile` screens/lib |
| 4 | Cut 2: realtime gateway, location capture, live map | PR 4 | `pnpm --filter api test -- realtime` | Two devices, live position on map | Revert realtime module + mobile location/map |
| 5 | Cut 3: notifications, stats, history | PR 5 | `pnpm --filter api test -- notifications stats` | Push invite received on device | Revert notifications/stats modules + screens |

## Phase 1: Shared Foundation (prereq for both devs)

- [ ] 1.1 [Shared] Add `packages/*` to `pnpm-workspace.yaml`; scaffold `packages/contracts` (zod, vitest). Verify: `pnpm install` links workspace.
- [ ] 1.2 [Shared] Define DTOs + socket event zod schemas per design Contracts section; unit-test schema round-trips. Verify: `pnpm --filter contracts test` green.
- [ ] 1.3 [Shared] Pure `computeSamplingInterval({speed,lastMoveAt})` (3–5s moving / 30–60s idle) + RED unit tests. Verify: contracts test green.

## Phase 2: Cut 1 — Backend

- [ ] 2.1 [Backend] RED integration: register 201/409/400, login 200/401 (supertest + Testcontainers).
- [ ] 2.2 [Backend] GREEN: wire better-auth HTTP in `apps/api/src/modules/auth`; Nest session guard.
- [ ] 2.3 [Backend] RED: challenge create/join — join 403 non-invited, 409 over 20 members, invalid dates.
- [ ] 2.4 [Backend] GREEN: `challenges` module + entities (Challenge, Membership, Invite) + migrations.
- [ ] 2.5 [Backend] RED: step upsert idempotency (UNIQUE userId/challengeId/date) + leaderboard tie-break by joinedAt.
- [ ] 2.6 [Backend] GREEN: `steps` module — batch sync endpoint, Redis sorted-set `lb:{id}:{date}` with DB hydration.

## Phase 3: Cut 1 — Mobile (parallel with Phase 2 after 1.x)

- [ ] 3.1 [Mobile] Auth gate + register/login screens (expo-router), session in zustand `useAppStore`. Verify: manual login against local api.
- [ ] 3.2 [Mobile] `health-sync/` HealthKit/Health Connect readers + batch POST to steps endpoint. Verify: steps appear in leaderboard on QA device.
- [ ] 3.3 [Mobile] Challenge list/detail + daily leaderboard screen consuming contracts DTOs. Verify: two users see identical leaderboard.

## Phase 4: Cut 2 — Live GPS

- [ ] 4.1 [Backend] RED: socket join rejection for non-member; cross-room isolation; stale >60s. GREEN: `realtime` gateway, Redis adapter, ping pipeline, Position/ActivitySession entities.
- [ ] 4.2 [Mobile] `location/` background task (task-manager) consuming `computeSamplingInterval`; wire `lib/socket.ts` room events. Verify: pings hit Redis hashes.
- [ ] 4.3 [Mobile] Live map screen: own route + friend markers with reanimated interpolation; grey-out on stale. Verify: two devices see each other live.

## Phase 5: Cut 3 — Social

- [ ] 5.1 [Backend] RED+GREEN: `notifications` module (PushToken upsert, Expo dispatch on invite/start/end) + `stats` history/aggregates endpoints.
- [ ] 5.2 [Mobile] Push registration on app start (denied = no-op), deep-link to invite screen. Verify: invite push received.
- [ ] 5.3 [Mobile] History + stats screens. Verify: populated from endpoints.

## Phase 6: Verification

- [ ] 6.1 [Backend] `pnpm --filter api test` + `pnpm typecheck` green; Cut 1–3 success criteria from proposal checked.
- [ ] 6.2 [Shared] Update README/docs for dev setup; confirm additive-only migrations.
