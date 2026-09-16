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
 * (zadd/zrevrange/hgetall/hset/hexists/expire/exists/del/scan + pipeline).
 * No new dev dependency — the fake keeps the unit suite hermetic and proves
 * the exact Redis semantics the cache relies on (WITHSCORES interleave,
 * EXISTS gating, SCAN glob matches, TTL bookkeeping).
 */
class FakeRedis {
  readonly zsets = new Map<string, Map<string, number>>();
  readonly hashes = new Map<string, Map<string, string>>();
  readonly ttls = new Map<string, number>();
  /** Number of pipelines built — proves how many round-trips a call costs. */
  pipelineCalls = 0;

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

  /**
   * Single-page SCAN: the fake holds few keys, so one page reports every key
   * matching the pattern and closes the cursor ('0') — the cache's cursor
   * loop handles that identically to a multi-page real scan. COUNT is
   * accepted but ignored, matching real SCAN's "hint, not a guarantee".
   */
  async scan(
    cursor: number | string,
    match?: 'MATCH',
    pattern?: string,
    count?: 'COUNT',
    limit?: number | string,
  ): Promise<[string, string[]]> {
    void cursor;
    void match;
    void count;
    void limit;
    if (pattern === undefined) return ['0', []];
    const regex = new RegExp(
      `^${pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`,
    );
    const keys = new Set<string>([...this.zsets.keys(), ...this.hashes.keys()]);
    return ['0', [...keys].filter((key) => regex.test(key))];
  }

  pipeline(): FakePipeline {
    this.pipelineCalls += 1;
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
  // Commands are queued and only run on exec(), in order — mirroring how real
  // ioredis applies a pipeline atomically and returns one reply per command.
  private readonly commands: (() => Promise<unknown>)[] = [];

  constructor(private readonly redis: FakeRedis) {}

  zadd(key: string, score: number, member: string): this {
    this.commands.push(() => this.redis.zadd(key, score, member));
    return this;
  }
  hset(key: string, field: string, value: string): this {
    this.commands.push(() => this.redis.hset(key, field, value));
    return this;
  }
  hexists(key: string, field: string): this {
    this.commands.push(() => this.redis.hexists(key, field));
    return this;
  }
  exists(...keys: string[]): this {
    this.commands.push(() => this.redis.exists(...keys));
    return this;
  }
  expire(key: string, seconds: number): this {
    this.commands.push(() => this.redis.expire(key, seconds));
    return this;
  }
  del(...keys: string[]): this {
    this.commands.push(() => this.redis.del(...keys));
    return this;
  }

  /** Mirrors ioredis: replies are `[error, result]` tuples in command order. */
  async exec(): Promise<[Error | null, unknown][]> {
    const replies: [Error | null, unknown][] = [];
    for (const command of this.commands) {
      try {
        replies.push([null, await command()]);
      } catch (error) {
        replies.push([error as Error, null]);
      }
    }
    return replies;
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
      { userId: 'u2', name: 'Bob', steps: 9000, rank: 1, isRequester: false },
      { userId: 'u1', name: 'Alice', steps: 4000, rank: 2, isRequester: false },
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

  it('marks the requester entry when get() is given a requesterUserId', async () => {
    const fake = new FakeRedis();
    const cache = cacheWith(fake);
    await cache.set(CHALLENGE, DATE, [
      ...rows({ userId: 'u1', name: 'Alice', steps: 4000, joinedAt: 100 }),
      ...rows({ userId: 'u2', name: 'Bob', steps: 9000, joinedAt: 200 }),
    ]);

    // Cache hits must carry the PR-A requester contract just like the DB
    // path — a null requester would flip every entry to isRequester: false.
    const result = await cache.get(CHALLENGE, DATE, 'u1');
    expect(result?.find((entry) => entry.userId === 'u1')).toMatchObject({
      isRequester: true,
    });
    expect(result?.find((entry) => entry.userId === 'u2')).toMatchObject({
      isRequester: false,
    });

    // Without a requester the marking stays false for everyone.
    const unmarked = await cache.get(CHALLENGE, DATE);
    expect(unmarked?.every((entry) => !entry.isRequester)).toBe(true);
  });

  it('treats a member missing from the meta hash as a miss (null)', async () => {
    const fake = new FakeRedis();
    const cache = cacheWith(fake);
    await cache.set(CHALLENGE, DATE, rows({ userId: 'u1', steps: 100 }));
    // Simulate a partially-written key: meta field gone.
    fake.hashes.get(mkey)?.delete('u1');
    expect(await cache.get(CHALLENGE, DATE)).toBeNull();
  });

  it('swallows Redis errors: get returns null, set/updateScores do not throw', async () => {
    const fake = new FakeRedis();
    // A client whose zrevrange/pipeline blow up — everything else delegates
    // to the healthy fake (updateScores's probe pipeline throws first).
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
      cache.updateScores({
        challengeId: CHALLENGE,
        userId: 'u1',
        joinedAtMs: 100,
        entries: [{ date: DATE, steps: 10 }],
        resolveName: async () => 'One',
      }),
    ).resolves.toBeUndefined();
  });

  it('updateScores on a cold cache is a no-op: no key created, resolveName never called', async () => {
    const fake = new FakeRedis();
    const cache = cacheWith(fake);
    let resolveNameCalls = 0;

    await cache.updateScores({
      challengeId: CHALLENGE,
      userId: 'u1',
      joinedAtMs: 100,
      entries: [{ date: DATE, steps: 10_000 }],
      resolveName: async () => {
        resolveNameCalls += 1;
        return 'One';
      },
    });

    expect(resolveNameCalls).toBe(0);
    expect(await fake.exists(zkey)).toBe(0);
    expect(await fake.exists(mkey)).toBe(0);
    // One probe round-trip, zero writes — the DB fallback stays untouched.
    expect(fake.pipelineCalls).toBe(1);
  });

  it('updateScores updates existing keys in one batched write and refreshes the TTL', async () => {
    const fake = new FakeRedis();
    const cache = cacheWith(fake);
    await cache.set(CHALLENGE, DATE, rows({ userId: 'u1', steps: 100 }));

    // Simulate an aged key, then write through.
    fake.ttls.set(zkey, 60);
    fake.ttls.set(mkey, 60);
    const pipelinesBefore = fake.pipelineCalls;
    let resolveNameCalls = 0;

    await cache.updateScores({
      challengeId: CHALLENGE,
      userId: 'u1',
      joinedAtMs: 9999,
      entries: [{ date: DATE, steps: 10_000 }],
      resolveName: async () => {
        resolveNameCalls += 1;
        return 'User 1';
      },
    });

    expect((await fake.zrevrange(zkey, 0, -1, 'WITHSCORES'))[1]).toBe('10000');
    expect(fake.ttls.get(zkey)).toBe(LEADERBOARD_TTL_SECONDS);
    expect(fake.ttls.get(mkey)).toBe(LEADERBOARD_TTL_SECONDS);
    // Meta was already present → original joinedAt preserved, no profile query.
    const meta = JSON.parse(fake.hashes.get(mkey)!.get('u1')!) as {
      j: number;
    };
    expect(meta.j).toBe(1000);
    expect(resolveNameCalls).toBe(0);
    // Probe + write: exactly two pipelined round-trips for the batch.
    expect(fake.pipelineCalls - pipelinesBefore).toBe(2);
  });

  it('updateScores writes meta only when the field is missing, calling resolveName once', async () => {
    const fake = new FakeRedis();
    const cache = cacheWith(fake);
    // A hydrated zset whose meta field is gone (partial write): the batch
    // must repair the meta using resolveName, once for the whole payload.
    fake.zsets.set(zkey, new Map([['u1', 100]]));
    let resolveNameCalls = 0;

    await cache.updateScores({
      challengeId: CHALLENGE,
      userId: 'u1',
      joinedAtMs: 4242,
      entries: [{ date: DATE, steps: 5000 }],
      resolveName: async () => {
        resolveNameCalls += 1;
        return 'Fresh Name';
      },
    });

    expect(resolveNameCalls).toBe(1);
    expect(JSON.parse(fake.hashes.get(mkey)!.get('u1')!)).toEqual({
      j: 4242,
      n: 'Fresh Name',
    });
    expect((await fake.zrevrange(zkey, 0, -1, 'WITHSCORES'))[1]).toBe('5000');
  });

  it('updateScores updates every existing date in two round-trips (multi-date batch)', async () => {
    const fake = new FakeRedis();
    const cache = cacheWith(fake);
    const secondDate = '2026-09-15';
    const staleDate = '2026-09-14';
    await cache.set(CHALLENGE, DATE, rows({ userId: 'u1', steps: 100 }));
    await cache.set(CHALLENGE, secondDate, rows({ userId: 'u1', steps: 200 }));
    const pipelinesBefore = fake.pipelineCalls;

    await cache.updateScores({
      challengeId: CHALLENGE,
      userId: 'u1',
      joinedAtMs: 1000,
      entries: [
        { date: DATE, steps: 11_000 },
        { date: secondDate, steps: 22_000 },
        { date: staleDate, steps: 33_000 },
      ],
      resolveName: async () => 'User 1',
    });

    expect((await fake.zrevrange(zkey, 0, -1, 'WITHSCORES'))[1]).toBe('11000');
    expect(
      (
        await fake.zrevrange(
          `lb:${CHALLENGE}:${secondDate}`,
          0,
          -1,
          'WITHSCORES',
        )
      )[1],
    ).toBe('22000');
    // The never-hydrated date stays absent — the cold key is not created.
    expect(await fake.exists(`lb:${CHALLENGE}:${staleDate}`)).toBe(0);
    expect(await fake.exists(`lb:meta:${CHALLENGE}:${staleDate}`)).toBe(0);
    // Two round-trips no matter how many dates are in the payload.
    expect(fake.pipelineCalls - pipelinesBefore).toBe(2);
  });

  it('set with empty rows only deletes stale keys and creates nothing', async () => {
    const fake = new FakeRedis();
    const cache = cacheWith(fake);
    await cache.set(CHALLENGE, DATE, rows({ userId: 'u1', steps: 100 }));
    await cache.set(CHALLENGE, DATE, []);
    expect(await fake.exists(zkey, mkey)).toBe(0);
  });

  it('invalidateChallenge removes every lb and lb:meta key for the challenge', async () => {
    const fake = new FakeRedis();
    const cache = cacheWith(fake);
    await cache.set(CHALLENGE, DATE, rows({ userId: 'u1', steps: 100 }));
    await cache.set(CHALLENGE, '2026-09-15', rows({ userId: 'u1', steps: 50 }));

    await cache.invalidateChallenge(CHALLENGE);

    // Both key families and BOTH dates are gone — a member who joins after
    // hydration must not linger in any cached day of the challenge.
    expect(await fake.exists(zkey, mkey)).toBe(0);
    expect(await fake.exists('lb:7:2026-09-15', 'lb:meta:7:2026-09-15')).toBe(
      0,
    );
  });

  it('invalidateChallenge leaves sibling challenges and unrelated keys intact', async () => {
    const fake = new FakeRedis();
    const cache = cacheWith(fake);
    await cache.set(CHALLENGE, DATE, rows({ userId: 'u1', steps: 100 }));
    // Challenge 71 shares the 7 prefix — SCAN globs must NOT over-match it.
    await cache.set(71, DATE, rows({ userId: 'u2', steps: 200 }));
    await cache.set(99, DATE, rows({ userId: 'u3', steps: 300 }));
    fake.hashes.set('app:settings', new Map([['theme', 'dark']]));

    await cache.invalidateChallenge(CHALLENGE);

    expect(await fake.exists(zkey, mkey)).toBe(0);
    expect(await fake.exists('lb:71:2026-09-16', 'lb:meta:71:2026-09-16')).toBe(
      2,
    );
    expect(await fake.exists('lb:99:2026-09-16', 'lb:meta:99:2026-09-16')).toBe(
      2,
    );
    expect(fake.hashes.has('app:settings')).toBe(true);
  });

  it('invalidateChallenge swallows Redis errors (no throw)', async () => {
    const failing = new Proxy(new FakeRedis(), {
      get(target, prop) {
        if (prop === 'scan') {
          return () => {
            throw new Error('redis down');
          };
        }
        return Reflect.get(target, prop) as never;
      },
    }) as unknown as Redis;
    const cache = cacheWith(failing);

    await expect(cache.invalidateChallenge(CHALLENGE)).resolves.toBeUndefined();
  });
});
