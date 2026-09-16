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
 * Two keys per (challengeId, date), both with a 48h TTL:
 *
 * - Sorted set `lb:{challengeId}:{date}` — score = steps, member = userId.
 *   A zset cannot express the "ties break by earliest joinedAt" rule (tied
 *   scores sort lexicographically by member), so the tie-break inputs live in
 *   the meta hash and ranking ALWAYS goes through the shared pure
 *   `rankLeaderboard` from PR-A — the exact same code path the stores use.
 * - Hash `lb:meta:{challengeId}:{date}` — field = userId, value = JSON
 *   `{ j: joinedAtMs, n: name }` used to rebuild `LeaderboardRow`s on read.
 *
 * Every method swallows Redis errors (warn-logged) and degrades to null /
 * no-op: the cache is an optimization, Postgres is the source of truth.
 */
export const LEADERBOARD_TTL_SECONDS = 48 * 60 * 60; // 172800

const zsetKey = (challengeId: number, date: string): string =>
  `lb:${challengeId}:${date}`;
const metaKey = (challengeId: number, date: string): string =>
  `lb:meta:${challengeId}:${date}`;

interface MetaPayload {
  j: number; // joinedAt as ms epoch — tie-break input for rankLeaderboard
  n: string; // display name
}

function joinedAtMs(joinedAt: Date | number): number {
  return joinedAt instanceof Date ? joinedAt.getTime() : joinedAt;
}

/** Pipeline replies are `[error, result]` tuples; results arrive as unknown. */
function replyCount(reply: [Error | null, unknown] | undefined): number {
  const result = reply?.[1];
  return typeof result === 'number' ? result : 0;
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
   * Full hydration write (cache-aside fill). Clean slate: DEL both keys
   * first, then ZADD + HSET all rows and re-arm the TTL. Empty rows mean
   * "no members yet" — just DEL (no keys are created).
   */
  async set(
    challengeId: number,
    date: string,
    rows: LeaderboardRow[],
  ): Promise<void> {
    try {
      const zkey = zsetKey(challengeId, date);
      const mkey = metaKey(challengeId, date);
      const pipeline = this.redis.pipeline();
      pipeline.del(zkey, mkey);
      if (rows.length > 0) {
        for (const row of rows) {
          pipeline.zadd(zkey, row.steps, row.userId);
          const payload: MetaPayload = {
            j: joinedAtMs(row.joinedAt),
            n: row.name,
          };
          pipeline.hset(mkey, row.userId, JSON.stringify(payload));
        }
        pipeline.expire(zkey, LEADERBOARD_TTL_SECONDS);
        pipeline.expire(mkey, LEADERBOARD_TTL_SECONDS);
      }
      await pipeline.exec();
    } catch (error) {
      this.warn('set', challengeId, date, error);
    }
  }

  /**
   * Best-effort invalidation of every cached leaderboard key for a
   * challenge — both `lb:{challengeId}:{date}` zsets and
   * `lb:meta:{challengeId}:{date}` meta hashes, across ALL dates. Called
   * when a member joins: a hydrated zset only holds the members present at
   * hydration time, so without the invalidate the new member would stay
   * omitted from cached responses until the 48h TTL expired or they synced
   * steps. SCAN cursor loop (MATCH per key family, COUNT 100) collects the
   * keys, then DEL removes them in batches of 100. Errors are swallowed
   * like every other cache op — the cache is an optimization, Postgres is
   * the source of truth.
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
        await this.redis.del(...all.slice(i, i + 100));
      }
    } catch (error) {
      // No date: this op spans every cached day of the challenge.
      this.warn('invalidateChallenge', challengeId, undefined, error);
    }
  }

  /**
   * Write-through batch for syncSteps: updates EXISTING daily keys only (a
   * key that was never hydrated has nothing to update — the next GET fills
   * it from the DB). Two round-trips total regardless of entry count: one
   * pipelined probe (zset exists + meta-field hexists per date), then one
   * pipelined write. The meta field is written only when missing so re-syncs
   * never overwrite the original joinedAt; TTL re-armed on both keys. The
   * `resolveName` callback runs ONLY when at least one existing key needs a
   * new meta field — never on a cold cache (no wasted profile query).
   * Errors are swallowed like every other cache op.
   */
  async updateScores(input: {
    challengeId: number;
    userId: string;
    joinedAtMs: number;
    entries: { date: string; steps: number }[];
    resolveName: () => Promise<string | undefined>;
  }): Promise<void> {
    const { challengeId, userId, joinedAtMs, entries } = input;
    try {
      // RTT #1: probe every date in one pipeline. `hexists` on a missing hash
      // returns 0 without creating it, so a cold cache creates nothing.
      const probe = this.redis.pipeline();
      for (const entry of entries) {
        probe.exists(zsetKey(challengeId, entry.date));
        probe.hexists(metaKey(challengeId, entry.date), userId);
      }
      const probeResults = await probe.exec();
      if (!probeResults) return;

      const existing: { date: string; steps: number; needsMeta: boolean }[] =
        [];
      for (let i = 0; i < entries.length; i += 1) {
        if (replyCount(probeResults[i * 2]) === 0) continue;
        existing.push({
          date: entries[i].date,
          steps: entries[i].steps,
          needsMeta: replyCount(probeResults[i * 2 + 1]) === 0,
        });
      }
      // Cold cache: nothing hydrated for these dates — zero writes, zero DB.
      if (existing.length === 0) return;

      // The profile lookup is lazy: only a missing meta field needs the name.
      const name = existing.some((entry) => entry.needsMeta)
        ? ((await input.resolveName()) ?? '')
        : '';

      // RTT #2: one pipelined write covering every existing date.
      const write = this.redis.pipeline();
      for (const entry of existing) {
        const zkey = zsetKey(challengeId, entry.date);
        const mkey = metaKey(challengeId, entry.date);
        write.zadd(zkey, entry.steps, userId);
        if (entry.needsMeta) {
          const payload: MetaPayload = { j: joinedAtMs, n: name };
          write.hset(mkey, userId, JSON.stringify(payload));
        }
        write.expire(zkey, LEADERBOARD_TTL_SECONDS);
        write.expire(mkey, LEADERBOARD_TTL_SECONDS);
      }
      await write.exec();
    } catch (error) {
      this.warn('updateScores', challengeId, entries[0]?.date, error);
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
