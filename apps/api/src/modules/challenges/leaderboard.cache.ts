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

@Injectable()
export class LeaderboardCache implements OnApplicationShutdown {
  private readonly logger = new Logger(LeaderboardCache.name);

  constructor(@Inject(REDIS_CLIENT) private readonly redis: RedisClient) {}

  /**
   * Returns the ranked leaderboard from cache, or null on any miss / error
   * (caller rehydrates from the DB). A zset member without its meta field is
   * treated as a miss — serving it would lose the name and the tie-break.
   */
  async get(
    challengeId: number,
    date: string,
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
      return rankLeaderboard(rows);
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
   * Write-through for syncSteps. Only touches EXISTING keys — if the
   * leaderboard was never hydrated there is nothing to update (the next GET
   * fills it from the DB). Meta is written only when the field is missing so
   * re-syncs never overwrite the original joinedAt. Refreshes the TTL on both
   * keys.
   */
  async updateScore(
    challengeId: number,
    date: string,
    userId: string,
    steps: number,
    meta?: { joinedAtMs: number; name: string },
  ): Promise<void> {
    try {
      const zkey = zsetKey(challengeId, date);
      const mkey = metaKey(challengeId, date);
      if ((await this.redis.exists(zkey)) === 0) return;

      const pipeline = this.redis.pipeline();
      pipeline.zadd(zkey, steps, userId);
      if (meta && (await this.redis.hexists(mkey, userId)) === 0) {
        const payload: MetaPayload = { j: meta.joinedAtMs, n: meta.name };
        pipeline.hset(mkey, userId, JSON.stringify(payload));
      }
      pipeline.expire(zkey, LEADERBOARD_TTL_SECONDS);
      pipeline.expire(mkey, LEADERBOARD_TTL_SECONDS);
      await pipeline.exec();
    } catch (error) {
      this.warn('updateScore', challengeId, date, error);
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
    date: string,
    error: unknown,
  ): void {
    this.logger.warn(
      `leaderboard cache ${operation} failed (challenge ${challengeId}, ${date}) — falling back to the database: ${String(error)}`,
    );
  }
}
