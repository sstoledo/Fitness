import { betterAuth as createBetterAuth } from 'better-auth';

/**
 * Minimal better-auth instance (email/password only).
 *
 * The HTTP integration with NestJS (handlers for sign-up, sign-in, session,
 * etc.) is intentionally NOT wired yet — it belongs to a future task.
 * This module only exports the configured instance so the wiring task can
 * consume it without reconfiguring the library.
 */
export const betterAuth = createBetterAuth({
  appName: 'fitness',
  secret: process.env.BETTER_AUTH_SECRET ?? 'dev-secret-not-for-production',
  emailAndPassword: {
    enabled: true,
  },
});