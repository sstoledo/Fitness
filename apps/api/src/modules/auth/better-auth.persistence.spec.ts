import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { AuthModule } from './auth.module';
import { createBetterAuth } from './better-auth';

type AuthOptions = {
  database?: unknown;
  secret?: string;
  user?: { modelName?: string };
  session?: { modelName?: string };
  account?: { modelName?: string };
  verification?: { modelName?: string };
};

type AuthProvider = {
  provide: string;
  useFactory?: unknown;
};

const authOptions = createBetterAuth({
  storage: 'postgres',
  database: {
    connect: () => Promise.resolve(undefined),
    end: () => Promise.resolve(undefined),
  } as never,
  secret: 'test-secret-with-more-than-32-characters',
}).options as AuthOptions;

describe('Better Auth PostgreSQL boundary', () => {
  it('rejects missing PostgreSQL configuration', () => {
    expect(() =>
      createBetterAuth({
        storage: 'postgres',
        secret: 'test-secret-with-more-than-32-characters',
      }),
    ).toThrow('DATABASE_URL');
  });

  it('rejects missing or short secrets', () => {
    expect(() =>
      createBetterAuth({
        storage: 'postgres',
        databaseUrl: 'postgres://local',
        secret: 'short',
      }),
    ).toThrow('BETTER_AUTH_SECRET');
  });

  it('uses a PostgreSQL pool with an explicit lifecycle API', () => {
    const database = authOptions.database as {
      connect?: unknown;
      end?: unknown;
    };

    expect(typeof database.connect).toBe('function');
    expect(typeof database.end).toBe('function');
  });

  it('uses auth-owned table names that do not collide with the domain user table', () => {
    expect(authOptions.user?.modelName).toBe('authUser');
    expect(authOptions.session?.modelName).toBe('authSession');
    expect(authOptions.account?.modelName).toBe('authAccount');
    expect(authOptions.verification?.modelName).toBe('authVerification');
  });

  it('does not use the development fallback secret', () => {
    expect(authOptions.secret).toBeDefined();
    expect(authOptions.secret).not.toBe('dev-secret-not-for-production');
  });

  it('registers Better Auth through a factory provider for controlled shutdown', () => {
    const providers = AuthModule.forRoot({ storage: 'postgres' })
      .providers as AuthProvider[];
    const authProvider = providers.find(
      (provider) => provider.provide === 'BETTER_AUTH',
    );

    expect(authProvider).toBeDefined();
    expect(typeof authProvider?.useFactory).toBe('function');
  });
});
