/* eslint-disable @typescript-eslint/require-await --
 * In-memory store: it implements the async ChallengesStore contract with
 * synchronous code, so the methods have no await by design.
 */
import { ForbiddenException, Injectable } from '@nestjs/common';
import {
  ChallengesStore,
  MAX_CHALLENGE_MEMBERS,
  type ChallengeRecord,
  type CreateChallengeInput,
  type CreateInviteInput,
  type InviteRecord,
  type JoinChallengeResult,
  type LeaderboardEntryRecord,
  type StepSyncEntryInput,
} from './challenges.store';
import { rankLeaderboard, type LeaderboardRow } from './leaderboard.ranking';
import { generateInviteToken } from './invite-token';

interface MemoryMembership {
  userId: string;
  role: 'owner' | 'member';
  /** ms epoch at join/create time — leaderboard tie-break (earliest first). */
  joinedAt: number;
  /**
   * Display name. The memory flavour is test-only and has no user-profile
   * table, so the bearer-token user id doubles as the name (the test guard
   * trusts any bearer and uses it as the session user id). The TypeORM
   * flavour joins the real `user` table instead.
   */
  name: string;
}

interface MemoryInvite {
  token: string;
  challengeId: string;
  status: 'pending' | 'accepted' | 'expired';
  expiresAt: Date;
}

interface MemoryChallengeRow {
  record: ChallengeRecord;
  memberships: MemoryMembership[];
  /**
   * Daily step entries per member: userId → (YYYY-MM-DD → steps). The shape
   * is per-user (not per-challenge) because the step count belongs to a
   * (user, challenge, date) triple — one user's sync must never overwrite
   * another member's entry for the same date (latent bug fixed in #13).
   */
  stepsByUser: Map<string, Map<string, number>>;
}

/**
 * In-memory challenges store — the default persistence of the plain
 * `ChallengesModule`, so the module (and the RED contract tests) bootstrap
 * without Postgres, exactly like the auth memory adapter.
 *
 * REMOVAL NOTE (DB-wiring task): once the TypeORM store covers every
 * scenario exercised in tests, delete this file and make
 * `ChallengesModule.forRoot({ persistence: 'typeorm' })` the only flavour.
 *
 * Deterministic invite-seeding rules (dev/test fixtures — the production
 * TypeORM store reads real `invite` rows instead):
 *
 * - Any token starting with `invite-` is treated as a valid *link invite*
 *   (inviteeEmail = null, per docs/DATABASE.md) for the target challenge.
 *   Link invites reference challenges shared by their creator, so an unknown
 *   challenge id is materialized on first join with one (fixture) member.
 * - Tokens starting with `full-invite-` additionally materialize the
 *   challenge AT capacity (MAX_CHALLENGE_MEMBERS), modelling the
 *   "challenge full" scenario.
 * - Any other token matches no invite → 'not-invited' (403).
 */
@Injectable()
export class InMemoryChallengesStore extends ChallengesStore {
  private readonly challenges = new Map<string, MemoryChallengeRow>();
  private readonly invites = new Map<string, MemoryInvite>();
  private nextId = 1;

  async createChallenge(input: CreateChallengeInput): Promise<ChallengeRecord> {
    const record: ChallengeRecord = {
      id: String(this.nextId++),
      name: input.name,
      type: input.type,
      status: 'pending',
      startDate: input.startDate,
      endDate: input.endDate,
      createdBy: input.createdBy,
      memberCount: 1,
    };
    this.challenges.set(record.id, {
      record,
      memberships: [
        {
          userId: input.createdBy,
          role: 'owner',
          joinedAt: Date.now(),
          name: input.createdBy,
        },
      ],
      stepsByUser: new Map(),
    });
    return record;
  }

  async listChallengesForUser(userId: string): Promise<ChallengeRecord[]> {
    return [...this.challenges.values()]
      .filter((row) => row.memberships.some((m) => m.userId === userId))
      .map((row) => row.record)
      .sort((a, b) => Number(b.id) - Number(a.id));
  }

  async createInvite(input: CreateInviteInput): Promise<InviteRecord> {
    const row = this.challenges.get(input.challengeId);
    if (!row) {
      throw new Error(`Challenge ${input.challengeId} not found`);
    }
    const invite: MemoryInvite = {
      token: generateInviteToken(),
      challengeId: input.challengeId,
      status: 'pending',
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    };
    this.invites.set(invite.token, invite);
    return {
      token: invite.token,
      challengeId: invite.challengeId,
      status: invite.status,
    };
  }

  async joinChallenge(input: {
    challengeId: string;
    userId: string;
    inviteToken: string;
  }): Promise<JoinChallengeResult> {
    const row = this.materializeChallenge(input.challengeId, input.inviteToken);
    if (!row) return { ok: false, reason: 'not-invited' };

    const invite = this.invites.get(input.inviteToken);
    if (!invite || invite.challengeId !== input.challengeId) {
      return { ok: false, reason: 'not-invited' };
    }
    if (
      invite.status !== 'pending' ||
      invite.expiresAt.getTime() <= Date.now()
    ) {
      return { ok: false, reason: 'not-invited' };
    }

    // Idempotent re-join: already a member → return as-is.
    if (row.memberships.some((m) => m.userId === input.userId)) {
      return { ok: true, challenge: row.record };
    }

    if (row.memberships.length >= MAX_CHALLENGE_MEMBERS) {
      return { ok: false, reason: 'full' };
    }

    row.memberships.push({
      userId: input.userId,
      role: 'member',
      joinedAt: Date.now(),
      name: input.userId,
    });
    row.record.memberCount = row.memberships.length;
    invite.status = 'accepted';
    return { ok: true, challenge: row.record };
  }

  async syncSteps(
    userId: string,
    challengeId: string,
    entries: StepSyncEntryInput[],
  ): Promise<{ entries: { date: string; steps: number }[] }> {
    const row = this.challenges.get(challengeId);
    // Unknown challenge id is not a membership either: same 403 semantics.
    if (!row || !row.memberships.some((m) => m.userId === userId)) {
      throw new ForbiddenException(
        'Only members can sync steps to a challenge.',
      );
    }
    for (const entry of entries) {
      let userSteps = row.stepsByUser.get(userId);
      if (!userSteps) {
        userSteps = new Map();
        row.stepsByUser.set(userId, userSteps);
      }
      userSteps.set(entry.date, entry.steps);
    }
    return {
      entries: entries.map((entry) => ({
        date: entry.date,
        steps: row.stepsByUser.get(userId)?.get(entry.date) ?? entry.steps,
      })),
    };
  }

  async getDailyLeaderboard(
    userId: string,
    challengeId: string,
    date: string,
  ): Promise<LeaderboardEntryRecord[]> {
    const row = this.challenges.get(challengeId);
    // Unknown challenge id is not a membership either: same 403 semantics as
    // syncSteps.
    if (!row || !row.memberships.some((m) => m.userId === userId)) {
      throw new ForbiddenException(
        'Only members can view the leaderboard of a challenge.',
      );
    }

    // Every member appears, even without a step entry for the date (steps 0).
    const rows: LeaderboardRow[] = row.memberships.map((membership) => ({
      userId: membership.userId,
      name: membership.name,
      steps: row.stepsByUser.get(membership.userId)?.get(date) ?? 0,
      joinedAt: membership.joinedAt,
    }));
    return rankLeaderboard(rows, userId);
  }

  /**
   * Applies the fixture-seeding rules: a known challenge is returned as-is;
   * an unknown one is materialized when the token is a recognizable link
   * invite (`invite-`, or `full-invite-` for the at-capacity fixture).
   * Returns null when the token grants nothing.
   */
  private materializeChallenge(
    challengeId: string,
    inviteToken: string,
  ): MemoryChallengeRow | null {
    const known = this.challenges.get(challengeId);
    if (known) return known;

    if (inviteToken.startsWith('full-invite-')) {
      const row = this.newFixtureChallenge(challengeId, MAX_CHALLENGE_MEMBERS);
      this.registerLinkInvite(row, inviteToken);
      return row;
    }
    if (inviteToken.startsWith('invite-')) {
      const row = this.newFixtureChallenge(challengeId, 1);
      this.registerLinkInvite(row, inviteToken);
      return row;
    }
    return null;
  }

  private newFixtureChallenge(
    challengeId: string,
    members: number,
  ): MemoryChallengeRow {
    const now = Date.now();
    const record: ChallengeRecord = {
      id: challengeId,
      name: `Shared challenge ${challengeId}`,
      type: 'step',
      status: 'pending',
      startDate: new Date(now - 24 * 60 * 60 * 1000),
      endDate: new Date(now + 7 * 24 * 60 * 60 * 1000),
      createdBy: 'fixture-owner',
      memberCount: members,
    };
    const memberships: MemoryMembership[] = Array.from(
      { length: members },
      (_, i) => ({
        userId: `fixture-member-${i + 1}`,
        role: i === 0 ? 'owner' : 'member',
        joinedAt: now + i,
        name: `fixture-member-${i + 1}`,
      }),
    );
    const row: MemoryChallengeRow = {
      record,
      memberships,
      stepsByUser: new Map(),
    };
    this.challenges.set(challengeId, row);
    return row;
  }

  private registerLinkInvite(row: MemoryChallengeRow, token: string): void {
    this.invites.set(token, {
      token,
      challengeId: row.record.id,
      status: 'pending',
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    });
  }
}
