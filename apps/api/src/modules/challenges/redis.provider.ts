import type { FactoryProvider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

/**
 * Redis client provider for the challenges module (issue #13, PR-B).
 *
 * Injected as the `REDIS_CLIENT` token and consumed by `LeaderboardCache`.
 * `lazyConnect` is deliberate: module bootstrap never blocks on (or fails
 * because of) an unreachable Redis — the cache layer swallows connection
 * errors and the DB remains the source of truth. `maxRetriesPerRequest` and
 * `connectTimeout` are capped low so a slow/dead Redis fails fast per command
 * instead of queueing unbounded retries behind the request path.
 */
export const REDIS_CLIENT = 'REDIS_CLIENT';

export type RedisClient = Redis;

export const redisProvider: FactoryProvider = {
  provide: REDIS_CLIENT,
  inject: [ConfigService],
  useFactory: (config: ConfigService): RedisClient =>
    new Redis(config.get<string>('REDIS_URL') ?? 'redis://localhost:6379', {
      lazyConnect: true,
      maxRetriesPerRequest: 2,
      connectTimeout: 2000,
    }),
};
