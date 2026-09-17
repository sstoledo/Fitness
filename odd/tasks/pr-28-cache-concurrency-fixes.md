# PR #28 — Leaderboard cache concurrency fixes

## Objective
Address the 4 blocking review comments on PR #28 (branch `feat/issue-13-leaderboard-redis`): all are consistency races between Postgres (source of truth) and the Redis leaderboard cache.

## Problems (from review)
1. `invalidateChallenge()` runs INSIDE the `joinChallenge` transaction (before commit) — a concurrent GET can rehydrate the cache with the pre-join roster and omit the new member for 48h. Must invalidate AFTER commit.
2. A hydration started before a sync can finish after it and overwrite the new score in Redis with a stale PG snapshot.
3. Two concurrent syncs can commit PG in one order and write Redis in the reverse order — Redis must accept only the newest version, or syncs must invalidate instead of writing unversioned values.
4. `pipeline.exec()` per-command errors are not inspected — ioredis returns `[err, result]` tuples without rejecting; a failed ZADD currently still re-arms the TTL of stale data.

## Design
- **Per-date version key** `lb:ver:{challengeId}:{date}` (INCR) + **per-challenge generation key** `lbgen:{challengeId}` (INCR).
- **Syncs never write scores to Redis.** `updateScores` is replaced by `invalidateDates(challengeId, dates)`: one Lua script (or per-date Lua) that DELs zset+meta and INCRs the version atomically. Fixes #3 (no score writes → no ordering) and arms the guard for #2.
- **Hydration (`set`) is conditional**: store reads current ver (+gen) before writing; `set` executes one Lua script that writes ONLY if `GET ver == expectedVer` AND `GET gen == expectedGen`, else aborts. A sync/invalidation in between bumps ver → stale hydration is dropped (caller already returns the DB rows). Fixes #2.
- **joinChallenge**: invalidation moves AFTER the transaction commits; `invalidateChallenge` SCANs existing date keys, DELs them + INCRs their ver (atomic Lua per batch), and INCRs `lbgen` so in-flight hydrations for never-cached dates also abort. Fixes #1 + residual roster race.
- **All `pipeline.exec()` results are scanned** for non-null `err` tuples; any error throws into the existing catch/warn (fail the whole op, never re-arm TTL on partial failure). Fixes #4.

## TDD / checks
- TDD: not configured for ODD — ordinary functional checks.
- Runner: `pnpm --filter api test`, `pnpm typecheck` (3 packages), integration spec with scratch DB+Redis if feasible.

## Tasks
- [x] T1: `leaderboard.cache.ts` — exec() tuple error guard; `invalidateDates` (Lua DEL+INCR ver); conditional `set` (ver+gen Lua guard); `invalidateChallenge` post-commit-safe (SCAN + Lua DEL+INCR ver + INCR gen); remove `updateScores`/`resolveName`.
- [x] T2: `challenges.typeorm.store.ts` — joinChallenge invalidates after commit; syncSteps calls `invalidateDates`; getDailyLeaderboard reads ver+gen and passes to `set`.
- [x] T3: tests — update `leaderboard.cache.spec.ts` (fake eval/pipeline), add concurrency-focused unit tests (stale hydration aborted by version bump, sync invalidates instead of writing, exec tuple error → warn + no write), adjust integration spec.
- [x] T4 — commit `e765cc6` (4 files, +525/-304); tests 73 pass / 6 skipped, typecheck 3/3.

## Progress
- 2026-09-17: T1–T4 done in commit e765cc6. Not pushed.

## Next step
Push `feat/issue-13-leaderboard-redis` to update PR #28 (user decision).
