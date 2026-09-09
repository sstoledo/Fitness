import { randomBytes } from 'node:crypto';

/**
 * Invite token generator. base64url keeps it URL-safe for the mobile
 * deep-link flow (`/challenges/join?challengeId=<id>&token=<token>`), 24
 * random bytes give ~192 bits of entropy, and 32 chars fits the
 * `invite.token` varchar(64) column with room to spare.
 */
export function generateInviteToken(): string {
  return randomBytes(24).toString('base64url');
}
