/**
 * Persistence boundary for the challenges module (Cut 1, task #9).
 *
 * DECISION — how the RED contract tests pass without Postgres:
 *
 * The RED suite (`challenges.controller.spec.ts`) compiles
 * `ChallengesModule` alone, so the module must not touch TypeORM at import
 * or bootstrap time. Following the same precedent as the auth memory
 * adapter (see better-auth.ts), persistence sits behind this `ChallengesStore`
 * abstraction with two implementations:
 *
 * - `InMemoryChallengesStore` — the DEFAULT provider of the plain
 *   `ChallengesModule`. It keeps challenges/memberships/invites in process
 *   memory and implements deterministic invite-seeding rules so the RED
 *   contract scenarios (invited join, 403, 409-at-capacity) run without a
 *   database. It is a test/dev double, marked with a REMOVAL NOTE below.
 * - `TypeOrmChallengesStore` — the production implementation, wired by
 *   `ChallengesModule.forRoot({ persistence: 'typeorm' })`, which the
 *   AppModule uses together with the additive migration
 *   `src/migrations/*-ChallengesSchema.ts`.
 *
 * `pnpm --filter api test` therefore keeps working without Postgres, and
 * the running API persists through TypeORM with `synchronize: false`.
 */

/** Business rule from the spec: at most 20 members per challenge. */
export const MAX_CHALLENGE_MEMBERS = 20;

/** Challenge shape exposed by the service/API layer (string ids per contracts). */
export interface ChallengeRecord {
  id: string;
  name: string;
  type: string;
  status: string;
  startDate: Date;
  endDate: Date;
  createdBy: string;
  memberCount: number;
}

export interface CreateChallengeInput {
  name: string;
  type: string;
  startDate: Date;
  endDate: Date;
  /** Session user id (string). */
  createdBy: string;
}

export interface CreateInviteInput {
  challengeId: string;
  inviterId: string;
  inviteeEmail?: string | null;
}

export interface InviteRecord {
  token: string;
  challengeId: string;
  status: 'pending' | 'accepted' | 'expired';
}

export type JoinChallengeResult =
  | { ok: true; challenge: ChallengeRecord }
  | { ok: false; reason: 'not-invited' | 'full' };

export abstract class ChallengesStore {
  abstract createChallenge(
    input: CreateChallengeInput,
  ): Promise<ChallengeRecord>;

  /** Challenges the user is a member of, most recently created first. */
  abstract listChallengesForUser(userId: string): Promise<ChallengeRecord[]>;

  abstract createInvite(input: CreateInviteInput): Promise<InviteRecord>;

  /**
   * Joins a user to a challenge through an invite token.
   *
   * Implementations MUST enforce, atomically where possible:
   * 1. a pending, unexpired invite with this token exists for the challenge
   *    (link invites have no invitee restriction) — otherwise 'not-invited';
   * 2. the challenge is below MAX_CHALLENGE_MEMBERS — otherwise 'full';
   * 3. joining twice is idempotent (returns the challenge, no duplicate row).
   */
  abstract joinChallenge(input: {
    challengeId: string;
    userId: string;
    inviteToken: string;
  }): Promise<JoinChallengeResult>;
}
