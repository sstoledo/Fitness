import {
  Inject,
  Injectable,
  Logger,
  OnApplicationShutdown,
} from '@nestjs/common';
import {
  rankLeaderboard,
  type LeaderboardEntryRecord,
  type LeaderboardRow,
} from './leaderboard.ranking';
import { REDIS_CLIENT, type RedisClient } from './redis.provider';

/**
 * Cache-aside layer for the daily leaderboard (issue #13, PR-B).
 *
 * Two payload keys per (challengeId, date), both with a 48h TTL:
 *
 * - Sorted set `lb:{challengeId}:{date}` — score = steps, member = userId.
 *   A zset cannot express the "ties break by earliest joinedAt" rule (tied
 *   scores sort lexicographically by member), so the tie-break inputs live in
 *   the meta hash and ranking ALWAYS goes through the shared pure
 *   `rankLeaderboard` from PR-A — the exact same code path the stores use.
 * - Hash `lb:meta:{challengeId}:{date}` — field = userId, value = JSON
 *   `{ j: joinedAtMs, n: name }` used to rebuild `LeaderboardRow`s on read.
 *
 * CONCURRENCY PROTOCOL (PR #28 review): Postgres is the only writer of
 * truth; Redis only ever holds hydrated snapshots guarded by two monotonic
 * counters:
 *
 * - `lb:ver:{challengeId}:{date}` — per-date VERSION, INCR'd on every
 *   invalidation of that date (syncs call `invalidateDates`, which DELs the
 *   payload keys and bumps the version in ONE atomic Lua script).
 * - `lbgen:{challengeId}` — per-challenge GENERATION, INCR'd on every
 *   roster change (`invalidateChallenge`), so even an in-flight hydration of
 *   a never-cached date aborts when a member joins mid-flight.
 *
 * Syncs NEVER write scores to Redis (they invalidate instead) — that kills
 * the cross-ordering race where two concurrent syncs commit PG in one order
 * and write Redis in the reverse order. Hydration (`set`) is CONDITIONAL: the
 * caller reads the current version+generation first (`readVersionToken`) and
 * the write Lua script re-checks both counters before writing; any
 * invalidation in between bumps a counter and the stale hydration is dropped
 * (the caller already holds the fresh DB rows to answer the request).
 *
 * The ver/gen counters intentionally carry NO TTL. They are tiny integers,
 * bounded by (challenges x challenge-days), and expiring them would open a
 * hole: if a ver key expired while its zset outlived it, a hydration that
 * read the token BEFORE an invalidation could observe `nil -> 0` afterwards
 * and be falsely authorized to write a stale snapshot. Never-expiring
 * counters keep the guard monotonic for the life of the challenge data.
 *
 * Every method swallows Redis errors (warn-logged) and degrades to null /
 * no-op: the cache is an optimization, Postgres is the source of truth.
 */
export const LEADERBOARD_TTL_SECONDS = 48 * 60 * 60; // 172800

const zsetKey = (challengeId: number, date: string): string =>
  `lb:${challengeId}:${date}`;
const metaKey = (challengeId: number, date: string): string =>
  `lb:meta:${challengeId}:${date}`;
const versionKey = (challengeId: number, date: string): string =>
  `lb:ver:${challengeId}:${date}`;
const generationKey = (challengeId: number): string => `lbgen:${challengeId}`;

/**
 * `@script` marker comments let hermetic test fakes dispatch on script
 * identity instead of parsing Lua; real Redis ignores them.
 */

/**
 * invalidateDates: KEYS arrive in triples [zset, meta, ver] — DEL the two
 * payload keys and INCR the version, atomically for every date in the batch.
 */
const INVALIDATE_DATES_LUA = `-- @script lb_invalidate_dates
for i = 1, #KEYS, 3 do
  redis.call('DEL', KEYS[i], KEYS[i + 1])
  redis.call('INCR', KEYS[i + 2])
end
return #KEYS / 3
`;

/**
 * Conditional hydration: KEYS = [zset, meta, ver, gen]; ARGV = [expectedVer,
 * expectedGen, ttlSeconds, then one (userId, score, metaJson) triple per row].
 * Writes ONLY when both counters still match the caller's token; otherwise
 * aborts with 0 and touches nothing. Empty rows mean "no members yet" — the
 * DEL still runs so a stale snapshot is replaced by an honest miss.
 */
const CONDITIONAL_SET_LUA = `-- @script lb_conditional_set
local version = tonumber(redis.call('GET', KEYS[3]) or '0')
local generation = tonumber(redis.call('GET', KEYS[4]) or '0')
if version ~= tonumber(ARGV[1]) or generation ~= tonumber(ARGV[2]) then
  return 0
end
redis.call('DEL', KEYS[1], KEYS[2])
local ttl = tonumber(ARGV[3])
local i = 4
while i <= #ARGV do
  redis.call('ZADD', KEYS[1], ARGV[i + 1], ARGV[i])
  redis.call('HSET', KEYS[2], ARGV[i], ARGV[i + 2])
  i = i + 3
end
if i > 4 then
  redis.call('EXPIRE', KEYS[1], ttl)
  redis.call('EXPIRE', KEYS[2], ttl)
end
return 1
`;

/**
 * invalidateChallenge batch: KEYS are matched zset/meta keys. Each key is
 * DEL'd and its per-date version INCR'd exactly once (zset and meta of the
 * same date derive the same ver key). The generation bump is a separate
 * unconditional INCR issued by the caller.
 */
const INVALIDATE_BATCH_LUA = `-- @script lb_invalidate_batch
local bumped = {}
for _, key in ipairs(KEYS) do
  redis.call('DEL', key)
  local suffix
  if string.sub(key, 1, 8) == 'lb:meta:' then
    suffix = string.sub(key, 9)
  else
    suffix = string.sub(key, 4)
  end
  local ver = 'lb:ver:' .. suffix
  if not bumped[ver] then
    bumped[ver] = true
    redis.call('INCR', ver)
  end
end
return #KEYS
`;

interface MetaPayload {
  j: number; // joinedAt as ms epoch — tie-break input for rankLeaderboard
  n: string; // display name
}

/**
 * Version token read before a conditional `set` — the hydration writes only
 * if both counters still hold these exact values when the Lua script runs.
 */
export interface LeaderboardVersionToken {
  version: number;
  generation: number;
}

function joinedAtMs(joinedAt: Date | number): number {
  return joinedAt instanceof Date ? joinedAt.getTime() : joinedAt;
}

/**
 * ioredis pipelines do NOT reject on per-command failures — `exec()` resolves
 * with `[error, result]` tuples (or null on a transaction-level abort), so a
 * failed ZADD/EXPIRE is invisible unless every tuple is inspected. Any
 * non-null error throws into the caller's catch/warn: a partially applied
 * pipeline must fail the WHOLE op rather than silently keep stale data alive
 * (PR #28 review).
 */
function ensurePipelineOk(
  replies: [Error | null, unknown][] | null,
): asserts replies is [Error | null, unknown][] {
  if (replies === null) {
    throw new Error('pipeline exec aborted (null replies)');
  }
  for (const [error] of replies) {
    if (error) throw error;
  }
}

@Injectable()
export class LeaderboardCache implements OnApplicationShutdown {
  private readonly logger = new Logger(LeaderboardCache.name);

  constructor(@Inject(REDIS_CLIENT) private readonly redis: RedisClient) {}

  /**
   * Returns the ranked leaderboard from cache, or null on any miss / error
   * (caller rehydrates from the DB). A zset member without its meta field is
   * treated as a miss — serving it would lose the name and the tie-break.
   * The requester's entry is marked `isRequester: true` when a
   * `requesterUserId` is given — the same contract as the DB path, so cache
   * hits never lose the PR-A requester marking.
   */
  async get(
    challengeId: number,
    date: string,
    requesterUserId?: string,
  ): Promise<LeaderboardEntryRecord[] | null> {
    try {
      const zkey = zsetKey(challengeId, date);
      const flat = await this.redis.zrevrange(zkey, 0, -1, 'WITHSCORES');
      if (flat.length === 0) return null;

      const meta = await this.redis.hgetall(metaKey(challengeId, date));
      const rows: LeaderboardRow[] = [];
      for (let i = 0; i < flat.length; i += 2) {
        const userId = flat[i];
        const rawMeta = meta[userId];
        if (!rawMeta) return null;
        const parsed = JSON.parse(rawMeta) as MetaPayload;
        rows.push({
          userId,
          name: parsed.n,
          steps: Number(flat[i + 1]),
          joinedAt: parsed.j,
        });
      }
      return rankLeaderboard(rows, requesterUserId);
    } catch (error) {
      this.warn('get', challengeId, date, error);
      return null;
    }
  }

  /**
   * Reads the current (version, generation) counters for one challenge-day
   * in a single pipeline. Pass the token to `set` so the hydration writes
   * only when no sync/invalidation landed in between (nil counters read as
   * 0, matching the Lua script's coercion). On any Redis error the token
   * `{ -1, -1 }` is returned: INCR never produces negative values, so the
   * conditional set can never match it and the hydration is safely skipped.
   */
  async readVersionToken(
    challengeId: number,
    date: string,
  ): Promise<LeaderboardVersionToken> {
    try {
      const pipeline = this.redis.pipeline();
      pipeline.get(versionKey(challengeId, date));
      pipeline.get(generationKey(challengeId));
      const replies = await pipeline.exec();
      ensurePipelineOk(replies);
      const toCounter = (value: unknown): number => {
        const parsed = Number(value ?? 0);
        return Number.isFinite(parsed) ? parsed : 0;
      };
      return {
        version: toCounter(replies[0]?.[1]),
        generation: toCounter(replies[1]?.[1]),
      };
    } catch (error) {
      this.warn('readVersionToken', challengeId, date, error);
      return { version: -1, generation: -1 };
    }
  }

  /**
   * Full hydration write (cache-aside fill), CONDITIONAL on the version
   * token: one Lua script DELs both keys, ZADD + HSETs all rows and re-arms
   * the TTL — but only when `lb:ver`/`lbgen` still equal `expected`. A sync
   * or roster change between `readVersionToken` and this call bumps a
   * counter and the stale snapshot is dropped untouched (the caller already
   * returns the DB rows, so the user is never served stale data). Empty rows
   * mean "no members yet" — just DEL (no keys are created).
   */
  async set(
    challengeId: number,
    date: string,
    rows: LeaderboardRow[],
    expected: LeaderboardVersionToken,
  ): Promise<void> {
    try {
      const args: (string | number)[] = [
        expected.version,
        expected.generation,
        LEADERBOARD_TTL_SECONDS,
      ];
      for (const row of rows) {
        const payload: MetaPayload = {
          j: joinedAtMs(row.joinedAt),
          n: row.name,
        };
        args.push(row.userId, row.steps, JSON.stringify(payload));
      }
      await this.redis.eval(
        CONDITIONAL_SET_LUA,
        4,
        zsetKey(challengeId, date),
        metaKey(challengeId, date),
        versionKey(challengeId, date),
        generationKey(challengeId),
        ...args,
      );
    } catch (error) {
      this.warn('set', challengeId, date, error);
    }
  }

  /**
   * Invalidation-based write-through for syncSteps (PR #28 review): the sync
   * NEVER writes scores to Redis. One Lua script DELs the zset+meta of every
   * synced date and INCRs its version, atomically. The next GET rehydrates
   * from the already-committed Postgres state, and any hydration that read
   * its version token before this call aborts in `set`. Errors are swallowed
   * like every other cache op.
   */
  async invalidateDates(challengeId: number, dates: string[]): Promise<void> {
    if (dates.length === 0) return;
    try {
      const keys: string[] = [];
      for (const date of dates) {
        keys.push(
          zsetKey(challengeId, date),
          metaKey(challengeId, date),
          versionKey(challengeId, date),
        );
      }
      await this.redis.eval(INVALIDATE_DATES_LUA, keys.length, ...keys);
    } catch (error) {
      this.warn('invalidateDates', challengeId, dates[0], error);
    }
  }

  /**
   * Best-effort invalidation of every cached leaderboard key for a
   * challenge — both `lb:{challengeId}:{date}` zsets and
   * `lb:meta:{challengeId}:{date}` meta hashes, across ALL dates. Called
   * AFTER a member-join transaction commits (never inside it): a concurrent
   * GET must rehydrate from the post-commit roster, not the pre-join one.
   *
   * SCAN cursor loop (MATCH per key family, COUNT 100) collects the keys,
   * then one Lua script per batch of 100 DELs each key and INCRs its
   * per-date version (atomic per batch). Finally `lbgen:{challengeId}` is
   * INCR'd UNCONDITIONALLY — even when SCAN found nothing — so an in-flight
   * hydration of a never-cached date (whose token predates the join) also
   * aborts instead of caching a pre-join roster. Errors are swallowed like
   * every other cache op — the cache is an optimization, Postgres is the
   * source of truth.
   */
  async invalidateChallenge(challengeId: number): Promise<void> {
    try {
      const keys = new Set<string>();
      for (const pattern of [
        `lb:${challengeId}:*`,
        `lb:meta:${challengeId}:*`,
      ]) {
        let cursor = '0';
        do {
          const [nextCursor, found] = await this.redis.scan(
            cursor,
            'MATCH',
            pattern,
            'COUNT',
            100,
          );
          for (const key of found) keys.add(key);
          cursor = nextCursor;
        } while (cursor !== '0');
      }
      const all = [...keys];
      for (let i = 0; i < all.length; i += 100) {
        const batch = all.slice(i, i + 100);
        await this.redis.eval(INVALIDATE_BATCH_LUA, batch.length, ...batch);
      }
      // Unconditional generation bump: see the docblock — it must run even
      // when no keys existed.
      await this.redis.incr(generationKey(challengeId));
    } catch (error) {
      // No date: this op spans every cached day of the challenge.
      this.warn('invalidateChallenge', challengeId, undefined, error);
    }
  }

  async onApplicationShutdown(): Promise<void> {
    // lazyConnect client: if it never connected there is no socket to close.
    try {
      if (this.redis.status === 'ready') {
        await this.redis.quit();
      } else {
        this.redis.disconnect();
      }
    } catch {
      this.redis.disconnect();
    }
  }

  private warn(
    operation: string,
    challengeId: number,
    date: string | undefined,
    error: unknown,
  ): void {
    const scope =
      date === undefined
        ? `challenge ${challengeId}`
        : `challenge ${challengeId}, ${date}`;
    this.logger.warn(
      `leaderboard cache ${operation} failed (${scope}) — falling back to the database: ${String(error)}`,
    );
  }
}
