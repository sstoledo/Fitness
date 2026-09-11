import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import {
  ChallengesStore,
  MAX_CHALLENGE_MEMBERS,
  type ChallengeRecord,
  type CreateChallengeInput,
  type CreateInviteInput,
  type InviteRecord,
  type JoinChallengeResult,
} from './challenges.store';
import { Challenge } from './entities/challenge.entity';
import { Invite } from './entities/invite.entity';
import { Membership } from './entities/membership.entity';
import { generateInviteToken } from './invite-token';

const INVITE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Production challenges persistence over Postgres (Cut 1, task #9).
 *
 * Wired only by `ChallengesModule.forRoot({ persistence: 'typeorm' })`; the
 * plain module uses the in-memory store so tests keep running without a
 * database. `joinChallenge` runs in a transaction so the invite check, the
 * capacity check and the membership insert are atomic.
 *
 * USER-ID NOTE: the schema stores int user ids (docs/DATABASE.md) while the
 * session still comes from the better-auth memory adapter with opaque
 * string ids. This store maps with `Number(userId)` and rejects non-numeric
 * ids until the auth database reconciliation task lands.
 */
@Injectable()
export class TypeOrmChallengesStore extends ChallengesStore {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(Challenge)
    private readonly challenges: Repository<Challenge>,
    @InjectRepository(Membership)
    private readonly memberships: Repository<Membership>,
    @InjectRepository(Invite) private readonly invites: Repository<Invite>,
  ) {
    super();
  }

  async createChallenge(input: CreateChallengeInput): Promise<ChallengeRecord> {
    const createdById = this.toNumericId(input.createdBy);

    return this.dataSource.transaction(async (em) => {
      const challenge = await em.getRepository(Challenge).save(
        em.getRepository(Challenge).create({
          name: input.name,
          type: input.type,
          status: 'pending',
          startDate: input.startDate,
          endDate: input.endDate,
          createdById,
        }),
      );
      await em.getRepository(Membership).save(
        em.getRepository(Membership).create({
          userId: createdById,
          challengeId: challenge.id,
          role: 'owner',
        }),
      );
      return this.toRecord(challenge, 1);
    });
  }

  async listChallengesForUser(userId: string): Promise<ChallengeRecord[]> {
    const numericUserId = this.toNumericId(userId);
    const rows = await this.dataSource
      .getRepository(Challenge)
      .createQueryBuilder('challenge')
      .innerJoin(
        Membership,
        'membership',
        'membership."challengeId" = challenge.id',
      )
      .where('membership."userId" = :userId', { userId: numericUserId })
      .orderBy('challenge.id', 'DESC')
      .getMany();

    const counts = await this.memberCounts(rows.map((row) => row.id));
    return rows.map((row) => this.toRecord(row, counts.get(row.id) ?? 0));
  }

  async createInvite(input: CreateInviteInput): Promise<InviteRecord> {
    const challengeId = this.toNumericId(input.challengeId);
    const inviterId = this.toNumericId(input.inviterId);

    const membership = await this.memberships.findOneBy({
      challengeId,
      userId: inviterId,
    });
    if (!membership) {
      throw new BadRequestException('Only members can invite to a challenge.');
    }

    const token = generateInviteToken();
    const invite = await this.invites.save(
      this.invites.create({
        challengeId,
        inviterId,
        inviteeEmail: input.inviteeEmail ?? null,
        token,
        status: 'pending',
        expiresAt: new Date(Date.now() + INVITE_TTL_MS),
      }),
    );
    return {
      token: invite.token,
      challengeId: String(invite.challengeId),
      status: 'pending',
    };
  }

  async joinChallenge(input: {
    challengeId: string;
    userId: string;
    inviteToken: string;
  }): Promise<JoinChallengeResult> {
    const challengeId = this.toNumericId(input.challengeId);
    const userId = this.toNumericId(input.userId);

    return this.dataSource.transaction(
      async (em): Promise<JoinChallengeResult> => {
        const memberships = em.getRepository(Membership);
        const invites = em.getRepository(Invite);
        const challenges = em.getRepository(Challenge);

        const challenge = await challenges.findOneBy({ id: challengeId });
        if (!challenge) return { ok: false, reason: 'not-invited' };

        const invite = await invites
          .createQueryBuilder('invite')
          .setLock('pessimistic_write')
          .where('invite."challengeId" = :challengeId', { challengeId })
          .andWhere('invite.token = :token', { token: input.inviteToken })
          .andWhere('invite.status = :status', { status: 'pending' })
          .andWhere('invite."expiresAt" > :now', { now: new Date() })
          .getOne();
        if (!invite) return { ok: false, reason: 'not-invited' };

        // Idempotent re-join.
        const existing = await memberships.findOneBy({ challengeId, userId });
        if (existing) {
          const count = await memberships.countBy({ challengeId });
          return { ok: true, challenge: this.toRecord(challenge, count) };
        }

        const memberCount = await memberships.countBy({ challengeId });
        if (memberCount >= MAX_CHALLENGE_MEMBERS) {
          return { ok: false, reason: 'full' };
        }

        await memberships.save(
          memberships.create({ userId, challengeId, role: 'member' }),
        );
        await invites.update(invite.id, { status: 'accepted' });
        return {
          ok: true,
          challenge: this.toRecord(challenge, memberCount + 1),
        };
      },
    );
  }

  private async memberCounts(
    challengeIds: number[],
  ): Promise<Map<number, number>> {
    if (challengeIds.length === 0) return new Map();
    const rows: { challengeId: number; count: string }[] = await this.dataSource
      .getRepository(Membership)
      .createQueryBuilder('membership')
      .select('membership."challengeId"', 'challengeId')
      .addSelect('COUNT(*)', 'count')
      .where('membership."challengeId" IN (:...challengeIds)', { challengeIds })
      .groupBy('membership."challengeId"')
      .getRawMany();
    return new Map(rows.map((row) => [row.challengeId, Number(row.count)]));
  }

  private toRecord(challenge: Challenge, memberCount: number): ChallengeRecord {
    return {
      id: String(challenge.id),
      name: challenge.name,
      type: challenge.type,
      status: challenge.status,
      startDate: challenge.startDate,
      endDate: challenge.endDate,
      createdBy: String(challenge.createdById),
      memberCount,
    };
  }

  private toNumericId(userId: string): number {
    const numeric = Number(userId);
    if (!Number.isInteger(numeric) || numeric <= 0) {
      throw new BadRequestException(
        'Database-backed challenges require a numeric user id; the better-auth memory session is not reconciled with the domain user table yet.',
      );
    }
    return numeric;
  }
}
