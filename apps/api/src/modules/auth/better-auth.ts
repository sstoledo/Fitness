import { memoryAdapter } from '@better-auth/memory-adapter';
import { betterAuth as createBetterAuth } from 'better-auth';
import { bearer } from 'better-auth/plugins';

/**
 * Minimal better-auth instance (email/password only, bearer transport).
 *
 * Storage decision (Cut 1, task #5): users and sessions live in a process
 * memory adapter until the better-auth schema migrations land (a later Cut 1
 * task). This keeps AuthModule fully isolated — `pnpm --filter api test`
 * builds the module alone, without Postgres — exactly as the RED tests of
 * task #3 require. Consequence: registrations and sessions are lost on every
 * API restart, which is acceptable for local development and is replaced by
 * the database-backed adapter in the migrations task. Do NOT enable
 * `synchronize` to work around this.
 *
 * Transport decision: the mobile client (React Native) sends the session
 * token as `Authorization: Bearer <token>`. The bearer plugin converts that
 * header into better-auth's internal session cookie so session-scoped
 * endpoints (get-session / sign-out) work without cookie jars.
 */
export const betterAuth = createBetterAuth({
  appName: 'fitness',
  secret: process.env.BETTER_AUTH_SECRET ?? 'dev-secret-not-for-production',
  database: memoryAdapter({
    user: [],
    session: [],
    account: [],
    verification: [],
  }),
  emailAndPassword: {
    enabled: true,
  },
  plugins: [bearer()],
});
