import { memoryAdapter } from '@better-auth/memory-adapter';
import { betterAuth as createBetterAuthInstance } from 'better-auth';
import { bearer } from 'better-auth/plugins';
import { Pool } from 'pg';

export type AuthStorage = 'memory' | 'postgres';

export interface BetterAuthConfig {
  storage: AuthStorage;
  databaseUrl?: string;
  database?: Pool;
  secret?: string;
}

export const authModels = {
  user: { modelName: 'authUser' },
  session: { modelName: 'authSession' },
  account: { modelName: 'authAccount' },
  verification: { modelName: 'authVerification' },
} as const;

export function createAuthPool(databaseUrl: string): Pool {
  if (!databaseUrl) {
    throw new Error(
      'DATABASE_URL is required for PostgreSQL-backed authentication.',
    );
  }

  return new Pool({ connectionString: databaseUrl, max: 10 });
}

export function createBetterAuth(config: BetterAuthConfig) {
  const secret = config.secret ?? process.env.BETTER_AUTH_SECRET;

  if (
    !secret ||
    secret === 'dev-secret-not-for-production' ||
    secret === 'change-me-in-prod' ||
    secret.length < 32
  ) {
    throw new Error(
      'BETTER_AUTH_SECRET must be configured with at least 32 non-placeholder characters.',
    );
  }

  const database =
    config.storage === 'postgres'
      ? (config.database ??
        createAuthPool(config.databaseUrl ?? process.env.DATABASE_URL ?? ''))
      : memoryAdapter({ user: [], session: [], account: [], verification: [] });

  return createBetterAuthInstance({
    appName: 'fitness',
    secret,
    database,
    ...(config.storage === 'postgres' ? authModels : {}),
    emailAndPassword: { enabled: true },
    plugins: [bearer()],
  });
}

/** Test-only auth instance. Production uses createBetterAuth with PostgreSQL. */
export const betterAuth = createBetterAuthInstance({
  appName: 'fitness',
  secret: process.env.BETTER_AUTH_SECRET ?? 'test-only-secret-please-change',
  database: memoryAdapter({
    user: [],
    session: [],
    account: [],
    verification: [],
  }),
  emailAndPassword: { enabled: true },
  plugins: [bearer()],
});
