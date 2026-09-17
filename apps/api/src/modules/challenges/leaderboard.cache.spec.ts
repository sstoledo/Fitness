import { Logger } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type Redis from 'ioredis';
import { LeaderboardCache, LEADERBOARD_TTL_SECONDS } from './leaderboard.cache';
import type { LeaderboardRow } from './leaderboard.ranking';

/* eslint-disable @typescript-eslint/require-await --
   FakeRedis mirrors ioredis's Promise-based command surface with synchronous
   in-memory Maps; awaiting its plain returns exercises the cache exactly
   like awaiting real Redis replies does. */

/**
 * Hand-rolled in-memory fake of the slice of ioredis the cache uses
 * (zadd/zrevrange/hgetall/hset/expire/exists/del/scan/get/incr/eval +
 * pipeline). No new dev dependency — the fake keeps the unit suite hermetic
 * and proves the exact Redis semantics the cache relies on (WITHSCORES
 * interleave, SCAN glob matches, TTL bookkeeping, and the three Lua scripts'
 * documented semantics, dispatched deterministically via their `@script`
 * marker comment instead of parsing Lua).
 */
class FakeRedis {
  readonly zsets = new Map<string, Map<string, number>>();
  readonly hashes = new Map<string, Map<string, string>>();
  readonly strings = new Map<string, string>();
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

  async get(key: string): Promise<string | null> {
    return this.strings.get(key) ?? null;
  }

  async incr(key: string): Promise<number> {
    const next = Number(this.strings.get(key) ?? '0') + 1;
    this.strings.set(key, String(next));
    return next;
  }

  async expire(key: string, seconds: number): Promise<number> {
    if (
      !this.zsets.has(key) &&
      !this.hashes.has(key) &&
      !this.strings.has(key)
    ) {
      return 0;
    }
    this.ttls.set(key, seconds);
    return 1;
  }

  async exists(...keys: string[]): Promise<number> {
    return keys.filter(
      (k) => this.zsets.has(k) || this.hashes.has(k) || this.strings.has(k),
    ).length;
  }

  async del(...keys: string[]): Promise<number> {
    let removed = 0;
    for (const key of keys) {
      if (this.zsets.delete(key)) removed++;
      if (this.hashes.delete(key)) removed++;
      if (this.strings.delete(key)) removed++;
      this.ttls.delete(key);
    }
    return removed;
  }

  /**
   * Deterministic stand-in for Redis Lua execution: dispatches on the
   * `@script` marker comment each script carries and applies the documented
   * semantics against the in-memory maps. Real Redis runs the actual Lua;
   * both paths must stay behaviorally identical.
   */
  async eval(
    script: string,
    numKeys: number,
    ...args: (string | number)[]
  ): Promise<unknown> {
    const keys = args.slice(0, numKeys).map(String);
    const rest = args.slice(numKeys).map(String);

    if (script.includes('lb_invalidate_dates')) {
      // KEYS arrive in triples [zset, meta, ver].
      for (let i = 0; i < keys.length; i += 3) {
        await this.del(keys[i], keys[i + 1]);
        await this.incr(keys[i + 2]);
      }
      return keys.length / 3;
    }

    if (script.includes('lb_conditional_set')) {
      // KEYS = [zset, meta, ver, gen]; ARGV = [ver, gen, ttl, triples...].
      const [expectedVer, expectedGen, ttl] = rest;
      const version = Number(this.strings.get(keys[2]) ?? '0');
      const generation = Number(this.strings.get(keys[3]) ?? '0');
      if (version !== Number(expectedVer) || generation !== Number(expectedGen)) {
        return 0;
      }
      await this.del(keys[0], keys[1]);
      let wrote = false;
      for (let i = 3; i < rest.length; i += 3) {
        await this.zadd(keys[0], Number(rest[i + 1]), rest[i]);
        await this.hset(keys[1], rest[i], rest[i + 2]);
        wrote = true;
      }
      if (wrote) {
        await this.expire(keys[0], Number(ttl));
        await this.expire(keys[1], Number(ttl));
      }
      return 1;
    }

    if (script.includes('lb_invalidate_batch')) {
      const bumped = new Set<string>();
      for (const key of keys) {
        await this.del(key);
        const suffix = key.startsWith('lb:meta:') ? key.slice(8) : key.slice(3);
        const ver = `lb:ver:${suffix}`;
        if (!bumped.has(ver)) {
          bumped.add(ver);
          await this.incr(ver);
        }
      }
      return keys.length;
    }

    throw new Error(`FakeRedis: unknown Lua script: ${script}`);
  }

  /**
   * Single-page SCAN: the fake holds few keys, so one page reports every key
   * matching the pattern and closes the cursor ('0') — the cache's cursor
   * loop handles that identically to a multi-page real scan. COUNT is
   * accepted but ignored, matching real SCAN's "hint, not a guarantee". Only
   * payload keys (zsets + hashes) are keyspace-visible to the cache's SCAN:
   * ver/gen counters never match the `lb:{id}:*` / `lb:meta:{id}:*` globs.
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

  get(key: string): this {
    this.commands.push(() => this.redis.get(key));
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
const vkey = `lb:ver:${CHALLENGE}:${DATE}`;
const gkey = `lbgen:${CHALLENGE}`;

/** Fresh-fake counters: no ver/gen keys exist yet, so both read as 0. */
const TOKEN0 = { version: 0, generation: 0 };

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
    await cache.set(
      CHALLENGE,
      DATE,
      [
        ...rows({ userId: 'u1', name: 'Alice', steps: 4000, joinedAt: 100 }),
        ...rows({ userId: 'u2', name: 'Bob', steps: 9000, joinedAt: 200 }),
      ],
      TOKEN0,
    );

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
    await cache.set(
      CHALLENGE,
      DATE,
      [
        ...rows({ userId: 'u-late', name: 'Late', steps: 100, joinedAt: 500 }),
        ...rows({ userId: 'u-early', name: 'Early', steps: 100, joinedAt: 100 }),
        ...rows({ userId: 'u-mid', name: 'Mid', steps: 300, joinedAt: 300 }),
      ],
      TOKEN0,
    );

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
    await cache.set(
      CHALLENGE,
      DATE,
      [
        ...rows({ userId: 'u1', name: 'Alice', steps: 4000, joinedAt: 100 }),
        ...rows({ userId: 'u2', name: 'Bob', steps: 9000, joinedAt: 200 }),
      ],
      TOKEN0,
    );

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
    await cache.set(CHALLENGE, DATE, rows({ userId: 'u1', steps: 100 }), TOKEN0);
    // Simulate a partially-written key: meta field gone.
    fake.hashes.get(mkey)?.delete('u1');
    expect(await cache.get(CHALLENGE, DATE)).toBeNull();
  });

  it('swallows Redis errors: get/set/invalidateDates never throw', async () => {
    const fake = new FakeRedis();
    // A client whose zrevrange/eval blow up — everything else delegates to
    // the healthy fake.
    const failing = new Proxy(fake, {
      get(target, prop) {
        if (prop === 'zrevrange' || prop === 'eval') {
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
      cache.set(CHALLENGE, DATE, rows({ steps: 1 }), TOKEN0),
    ).resolves.toBeUndefined();
    await expect(
      cache.invalidateDates(CHALLENGE, [DATE]),
    ).resolves.toBeUndefined();
  });

  it('invalidateDates removes the daily keys and bumps the per-date version', async () => {
    const fake = new FakeRedis();
    const cache = cacheWith(fake);
    await cache.set(CHALLENGE, DATE, rows({ userId: 'u1', steps: 100 }), TOKEN0);
    expect(await fake.exists(zkey, mkey)).toBe(2);

    await cache.invalidateDates(CHALLENGE, [DATE]);

    // Payload keys gone; the version counter was bumped from nil to 1.
    expect(await fake.exists(zkey, mkey)).toBe(0);
    expect(await fake.get(vkey)).toBe('1');

    // A second sync bumps the version again even though no keys existed —
    // the counter is the guard, not the payload.
    await cache.invalidateDates(CHALLENGE, [DATE]);
    expect(await fake.get(vkey)).toBe('2');
  });

  it('conditional set aborts when the version was bumped after the token was read', async () => {
    const fake = new FakeRedis();
    const cache = cacheWith(fake);

    // Hydration flow: token read → sync lands in between (bumps ver) → set.
    const staleToken = await cache.readVersionToken(CHALLENGE, DATE);
    expect(staleToken).toEqual(TOKEN0);
    await cache.invalidateDates(CHALLENGE, [DATE]);

    // The stale hydration is dropped: no keys written at all.
    await cache.set(
      CHALLENGE,
      DATE,
      rows({ userId: 'u1', steps: 100 }),
      staleToken,
    );
    expect(await fake.exists(zkey, mkey)).toBe(0);

    // A fresh token matches the bumped counter and the write goes through.
    const freshToken = await cache.readVersionToken(CHALLENGE, DATE);
    expect(freshToken).toEqual({ version: 1, generation: 0 });
    await cache.set(
      CHALLENGE,
      DATE,
      rows({ userId: 'u1', steps: 100 }),
      freshToken,
    );
    expect(await fake.exists(zkey, mkey)).toBe(2);
  });

  it('conditional set aborts when the generation was bumped (roster change mid-hydration)', async () => {
    const fake = new FakeRedis();
    const cache = cacheWith(fake);

    const staleToken = await cache.readVersionToken(CHALLENGE, DATE);
    await cache.invalidateChallenge(CHALLENGE); // bumps lbgen only, no keys

    await cache.set(
      CHALLENGE,
      DATE,
      rows({ userId: 'u1', steps: 100 }),
      staleToken,
    );
    expect(await fake.exists(zkey, mkey)).toBe(0);
  });

  it('a pipeline tuple error in readVersionToken warns and yields a never-matching token', async () => {
    const fake = new FakeRedis();
    // Pipeline whose exec resolves with a per-command error tuple — ioredis
    // does NOT reject on these, so only the explicit tuple inspection can
    // catch them.
    const broken = new Proxy(fake, {
      get(target, prop) {
        if (prop === 'pipeline') {
          return () => ({
            get() {
              return this;
            },
            exec: async (): Promise<[Error | null, unknown][]> => [
              [new Error('boom'), null],
              [null, '0'],
            ],
          });
        }
        return Reflect.get(target, prop) as never;
      },
    }) as unknown as Redis;
    const warnSpy = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
    const cache = cacheWith(broken);

    const token = await cache.readVersionToken(CHALLENGE, DATE);

    expect(token).toEqual({ version: -1, generation: -1 });
    expect(warnSpy).toHaveBeenCalledOnce();

    // A set with the poisoned token can never match real counters (INCR
    // never goes negative): the op fails as a whole and nothing is written
    // — no payload keys, no TTL re-armed over stale data.
    await cache.set(CHALLENGE, DATE, rows({ userId: 'u1', steps: 100 }), token);
    expect(await fake.exists(zkey, mkey)).toBe(0);
    expect(fake.ttls.has(zkey)).toBe(false);
    warnSpy.mockRestore();
  });

  it('set with empty rows only deletes stale keys and creates nothing', async () => {
    const fake = new FakeRedis();
    const cache = cacheWith(fake);
    await cache.set(CHALLENGE, DATE, rows({ userId: 'u1', steps: 100 }), TOKEN0);
    await cache.set(CHALLENGE, DATE, [], TOKEN0);
    expect(await fake.exists(zkey, mkey)).toBe(0);
  });

  it('invalidateChallenge removes every lb and lb:meta key for the challenge and bumps versions', async () => {
    const fake = new FakeRedis();
    const cache = cacheWith(fake);
    await cache.set(CHALLENGE, DATE, rows({ userId: 'u1', steps: 100 }), TOKEN0);
    await cache.set(
      CHALLENGE,
      '2026-09-15',
      rows({ userId: 'u1', steps: 50 }),
      TOKEN0,
    );

    await cache.invalidateChallenge(CHALLENGE);

    // Both key families and BOTH dates are gone — a member who joins after
    // hydration must not linger in any cached day of the challenge.
    expect(await fake.exists(zkey, mkey)).toBe(0);
    expect(await fake.exists('lb:7:2026-09-15', 'lb:meta:7:2026-09-15')).toBe(
      0,
    );
    // Each date's version was bumped exactly once (zset+meta share the ver).
    expect(await fake.get(vkey)).toBe('1');
    expect(await fake.get('lb:ver:7:2026-09-15')).toBe('1');
    // And the challenge generation moved, so in-flight hydrations abort.
    expect(await fake.get(gkey)).toBe('1');
  });

  it('invalidateChallenge bumps the generation even when no keys are cached', async () => {
    const fake = new FakeRedis();
    const cache = cacheWith(fake);

    await cache.invalidateChallenge(CHALLENGE);

    // Zero matched keys, yet the generation must move: a hydration that
    // read its token before a member joined would otherwise write a
    // pre-join roster for a never-cached date.
    expect(await fake.get(gkey)).toBe('1');
    expect(await fake.exists(zkey, mkey)).toBe(0);
  });

  it('invalidateChallenge leaves sibling challenges and unrelated keys intact', async () => {
    const fake = new FakeRedis();
    const cache = cacheWith(fake);
    await cache.set(CHALLENGE, DATE, rows({ userId: 'u1', steps: 100 }), TOKEN0);
    // Challenge 71 shares the 7 prefix — SCAN globs must NOT over-match it.
    await cache.set(71, DATE, rows({ userId: 'u2', steps: 200 }), TOKEN0);
    await cache.set(99, DATE, rows({ userId: 'u3', steps: 300 }), TOKEN0);
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
    // Sibling generations untouched.
    expect(await fake.get('lbgen:71')).toBeNull();
    expect(await fake.get('lbgen:99')).toBeNull();
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
