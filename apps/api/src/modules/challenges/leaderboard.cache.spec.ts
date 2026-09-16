import { describe, expect, it } from 'vitest';
import type Redis from 'ioredis';
import { LeaderboardCache, LEADERBOARD_TTL_SECONDS } from './leaderboard.cache';
import type { LeaderboardRow } from './leaderboard.ranking';

/* eslint-disable @typescript-eslint/require-await --
   FakeRedis mirrors ioredis's Promise-based command surface with synchronous
   in-memory Maps; awaiting its plain returns exercises the cache exactly
   like awaiting real Redis replies does. */

/**
 * Hand-rolled in-memory fake of the slice of ioredis the cache uses
 * (zadd/zrevrange/hgetall/hset/hexists/expire/exists/del + pipeline). No new
 * dev dependency — the fake keeps the unit suite hermetic and proves the
 * exact Redis semantics the cache relies on (WITHSCORES interleave, EXISTS
 * gating, TTL bookkeeping).
 */
class FakeRedis {
  readonly zsets = new Map<string, Map<string, number>>();
  readonly hashes = new Map<string, Map<string, string>>();
  readonly ttls = new Map<string, number>();

  private zset(key: string): Map<string, number> {
    let z = this.zsets.get(key);
    if (!z) {
      z = new Map();
      this.zsets.set(key, z);
    }
    return z;
  }

  private hash(key: string): Map<string, string> {
    let h = this.hashes.get(key);
    if (!h) {
      h = new Map();
      this.hashes.set(key, h);
    }
    return h;
  }

  async zadd(key: string, score: number, member: string): Promise<number> {
    const z = this.zset(key);
    const isNew = !z.has(member);
    z.set(member, score);
    return isNew ? 1 : 0;
  }

  /** Mirrors ioredis: with WITHSCORES the reply is [member, score, ...]. */
  async zrevrange(
    key: string,
    start: number,
    stop: number,
    withscores?: 'WITHSCORES',
  ): Promise<string[]> {
    const z = this.zsets.get(key);
    if (!z) return [];
    const entries = [...z.entries()].sort((a, b) =>
      b[1] !== a[1] ? b[1] - a[1] : a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0,
    );
    const sliced = entries.slice(
      Math.max(start, 0),
      stop === -1 ? undefined : stop + 1,
    );
    if (withscores !== 'WITHSCORES') return sliced.map(([member]) => member);
    const flat: string[] = [];
    for (const [member, score] of sliced) {
      flat.push(member, String(score));
    }
    return flat;
  }

  async hgetall(key: string): Promise<Record<string, string>> {
    return Object.fromEntries(this.hashes.get(key) ?? []);
  }

  async hset(key: string, field: string, value: string): Promise<number> {
    const h = this.hash(key);
    const isNew = !h.has(field);
    h.set(field, value);
    return isNew ? 1 : 0;
  }

  async hexists(key: string, field: string): Promise<number> {
    return this.hashes.get(key)?.has(field) ? 1 : 0;
  }

  async expire(key: string, seconds: number): Promise<number> {
    if (!this.zsets.has(key) && !this.hashes.has(key)) return 0;
    this.ttls.set(key, seconds);
    return 1;
  }

  async exists(...keys: string[]): Promise<number> {
    return keys.filter((k) => this.zsets.has(k) || this.hashes.has(k)).length;
  }

  async del(...keys: string[]): Promise<number> {
    let removed = 0;
    for (const key of keys) {
      if (this.zsets.delete(key)) removed++;
      if (this.hashes.delete(key)) removed++;
      this.ttls.delete(key);
    }
    return removed;
  }

  pipeline(): FakePipeline {
    return new FakePipeline(this);
  }

  // LeaderboardCache calls these on shutdown; harmless in the fake.
  get status(): string {
    return 'ready';
  }
  async quit(): Promise<void> {}
  disconnect(): void {}
}

class FakePipeline {
  constructor(private readonly redis: FakeRedis) {}

  zadd(key: string, score: number, member: string): this {
    void this.redis.zadd(key, score, member);
    return this;
  }
  hset(key: string, field: string, value: string): this {
    void this.redis.hset(key, field, value);
    return this;
  }
  expire(key: string, seconds: number): this {
    void this.redis.expire(key, seconds);
    return this;
  }
  del(...keys: string[]): this {
    void this.redis.del(...keys);
    return this;
  }
  async exec(): Promise<unknown[]> {
    return [];
  }
}

const cacheWith = (client: FakeRedis | Redis): LeaderboardCache =>
  new LeaderboardCache(client as unknown as Redis);

const CHALLENGE = 7;
const DATE = '2026-09-16';
const zkey = `lb:${CHALLENGE}:${DATE}`;
const mkey = `lb:meta:${CHALLENGE}:${DATE}`;

const rows = (...overrides: Partial<LeaderboardRow>[]): LeaderboardRow[] =>
  overrides.map((row, i) => ({
    userId: `u${i + 1}`,
    name: `User ${i + 1}`,
    steps: 0,
    joinedAt: 1000 * (i + 1),
    ...row,
  }));

describe('LeaderboardCache', () => {
  it('returns null when no cached keys exist (miss)', async () => {
    const cache = cacheWith(new FakeRedis());
    expect(await cache.get(CHALLENGE, DATE)).toBeNull();
  });

  it('round-trips set → get with ranked entries in order', async () => {
    const fake = new FakeRedis();
    const cache = cacheWith(fake);
    await cache.set(CHALLENGE, DATE, [
      ...rows({ userId: 'u1', name: 'Alice', steps: 4000, joinedAt: 100 }),
      ...rows({ userId: 'u2', name: 'Bob', steps: 9000, joinedAt: 200 }),
    ]);

    expect(await cache.get(CHALLENGE, DATE)).toEqual([
      { userId: 'u2', name: 'Bob', steps: 9000, rank: 1 },
      { userId: 'u1', name: 'Alice', steps: 4000, rank: 2 },
    ]);
    expect(fake.ttls.get(zkey)).toBe(LEADERBOARD_TTL_SECONDS);
    expect(fake.ttls.get(mkey)).toBe(LEADERBOARD_TTL_SECONDS);
  });

  it('breaks zset score ties by earliest joinedAt from the meta hash (shared rank)', async () => {
    const fake = new FakeRedis();
    const cache = cacheWith(fake);
    // ZSET TIE SEMANTICS: equal scores sort lexicographically by member, so
    // a raw zset read would order u-late before u-early. The cache must
    // re-rank via rankLeaderboard using meta.j — this test proves the
    // tie-break survives the cache round-trip exactly like the DB path.
    await cache.set(CHALLENGE, DATE, [
      ...rows({ userId: 'u-late', name: 'Late', steps: 100, joinedAt: 500 }),
      ...rows({ userId: 'u-early', name: 'Early', steps: 100, joinedAt: 100 }),
      ...rows({ userId: 'u-mid', name: 'Mid', steps: 300, joinedAt: 300 }),
    ]);

    const result = await cache.get(CHALLENGE, DATE);
    expect(result?.map((entry) => entry.userId)).toEqual([
      'u-mid',
      'u-early',
      'u-late',
    ]);
    expect(result?.map((entry) => entry.rank)).toEqual([1, 2, 2]);
  });

  it('treats a member missing from the meta hash as a miss (null)', async () => {
    const fake = new FakeRedis();
    const cache = cacheWith(fake);
    await cache.set(CHALLENGE, DATE, rows({ userId: 'u1', steps: 100 }));
    // Simulate a partially-written key: meta field gone.
    fake.hashes.get(mkey)?.delete('u1');
    expect(await cache.get(CHALLENGE, DATE)).toBeNull();
  });

  it('swallows Redis errors: get returns null, set/updateScore do not throw', async () => {
    const fake = new FakeRedis();
    // A client whose zrevrange/pipeline blow up — everything else delegates
    // to the healthy fake (updateScore's EXISTS check still succeeds).
    const failing = new Proxy(fake, {
      get(target, prop) {
        if (prop === 'zrevrange' || prop === 'pipeline') {
          return () => {
            throw new Error('redis down');
          };
        }
        return Reflect.get(target, prop) as never;
      },
    }) as unknown as Redis;
    const cache = cacheWith(failing);

    expect(await cache.get(CHALLENGE, DATE)).toBeNull();
    await expect(
      cache.set(CHALLENGE, DATE, rows({ steps: 1 })),
    ).resolves.toBeUndefined();
    await expect(
      cache.updateScore(CHALLENGE, DATE, 'u1', 10, {
        joinedAtMs: 100,
        name: 'One',
      }),
    ).resolves.toBeUndefined();
  });

  it('updateScore on a missing key is a no-op (no key is created)', async () => {
    const fake = new FakeRedis();
    const cache = cacheWith(fake);
    await cache.updateScore(CHALLENGE, DATE, 'u1', 10_000, {
      joinedAtMs: 100,
      name: 'One',
    });
    expect(await fake.exists(zkey)).toBe(0);
    expect(await fake.exists(mkey)).toBe(0);
  });

  it('updateScore on an existing key updates the score and refreshes the TTL', async () => {
    const fake = new FakeRedis();
    const cache = cacheWith(fake);
    await cache.set(CHALLENGE, DATE, rows({ userId: 'u1', steps: 100 }));

    // Simulate an aged key, then write through.
    fake.ttls.set(zkey, 60);
    fake.ttls.set(mkey, 60);
    await cache.updateScore(CHALLENGE, DATE, 'u1', 10_000, {
      joinedAtMs: 100,
      name: 'User 1',
    });

    expect((await fake.zrevrange(zkey, 0, -1, 'WITHSCORES'))[1]).toBe('10000');
    expect(fake.ttls.get(zkey)).toBe(LEADERBOARD_TTL_SECONDS);
    expect(fake.ttls.get(mkey)).toBe(LEADERBOARD_TTL_SECONDS);
    // Meta was already present → original joinedAt preserved.
    const meta = JSON.parse(fake.hashes.get(mkey)!.get('u1')!) as {
      j: number;
    };
    expect(meta.j).toBe(1000);
  });

  it('set with empty rows only deletes stale keys and creates nothing', async () => {
    const fake = new FakeRedis();
    const cache = cacheWith(fake);
    await cache.set(CHALLENGE, DATE, rows({ userId: 'u1', steps: 100 }));
    await cache.set(CHALLENGE, DATE, []);
    expect(await fake.exists(zkey, mkey)).toBe(0);
  });
});
