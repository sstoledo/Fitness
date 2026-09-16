import type { FactoryProvider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

/**
 * Connection string used when `REDIS_URL` is not configured. Exported so the
 * provider and the integration spec's probe client share a single source of
 * truth instead of hardcoding the same literal twice (issue #28 review,
 * R2-002).
 */
export const DEFAULT_REDIS_URL = 'redis://localhost:6379';

/**
 * Redis client provider for the challenges module (issue #13, PR-B).
 *
 * Injected as the `REDIS_CLIENT` token and consumed by `LeaderboardCache`.
 * `lazyConnect` is deliberate: module bootstrap never blocks on (or fails
 * because of) an unreachable Redis — the cache layer swallows connection
 * errors and the DB remains the source of truth.
 *
 * Fail-fast over queueing (issue #28 review, R4-001): `enableOfflineQueue:
 * false` rejects every command immediately while the client is not connected
 * instead of parking it in an offline queue until a connection attempt
 * settles. `retryStrategy` is bounded to 3 attempts (200ms * attempts, capped
 * at 1s) and then returns `null`, which stops reconnecting for good. Together
 * with the low `connectTimeout` / `maxRetriesPerRequest` caps, an unreachable
 * Redis degrades to the DB fallback in milliseconds rather than delaying the
 * request path by a full connection cycle.
 */
export const REDIS_CLIENT = 'REDIS_CLIENT';

export type RedisClient = Redis;

export const redisProvider: FactoryProvider = {
  provide: REDIS_CLIENT,
  inject: [ConfigService],
  useFactory: (config: ConfigService): RedisClient =>
    new Redis(config.get<string>('REDIS_URL') ?? DEFAULT_REDIS_URL, {
      lazyConnect: true,
      maxRetriesPerRequest: 2,
      connectTimeout: 2000,
      enableOfflineQueue: false,
      retryStrategy: (times: number) =>
        times > 3 ? null : Math.min(times * 200, 1000),
    }),
};
