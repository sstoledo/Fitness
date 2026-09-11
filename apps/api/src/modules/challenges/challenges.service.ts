import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { AuthSessionUser } from '../auth/session.guard';
import { ChallengesStore } from './challenges.store';

/**
 * Wire shape of `ChallengeDto` from `@fitness/contracts`. The api does not
 * import the package: its compiled declarations use extensionless relative
 * imports, which this app's `module: nodenext` tsconfig rejects (the mobile
 * app resolves it through bundler resolution). Keep this interface in sync
 * with `ChallengeDtoSchema` — string ids/dates, per the contracts package.
 */
export interface ChallengeDto {
  id: string;
  name: string;
  type: 'step' | 'run' | 'walk' | 'bike';
  status: 'pending' | 'active' | 'ended';
  startDate: string;
  endDate: string;
  createdBy: string;
  memberCount: number;
}

/**
 * Challenges application service (Cut 1, task #9).
 *
 * Holds the business rules that are independent of persistence:
 * date validation on create, invite generation (owner flow from
 * docs/CUT-1-BACKEND.md 2.4) and the join orchestration with its
 * 403-not-invited / 409-full semantics. Capacity and invite validity
 * themselves are enforced inside the store (atomic with the write).
 */
@Injectable()
export class ChallengesService {
  constructor(private readonly store: ChallengesStore) {}

  async createChallenge(
    user: AuthSessionUser,
    input: { name: string; type: string; startDate: string; endDate: string },
  ): Promise<ChallengeDto> {
    const startDate = new Date(input.startDate);
    const endDate = new Date(input.endDate);
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
      throw new BadRequestException(
        'startDate and endDate must be valid ISO-8601 datetimes.',
      );
    }
    if (endDate.getTime() <= startDate.getTime()) {
      throw new BadRequestException('endDate must be after startDate');
    }

    const record = await this.store.createChallenge({
      name: input.name,
      type: input.type,
      startDate,
      endDate,
      createdBy: user.id,
    });
    return this.toDto(record);
  }

  /** Challenges the session user belongs to (drives the mobile list screen). */
  async listChallenges(user: AuthSessionUser): Promise<ChallengeDto[]> {
    const records = await this.store.listChallengesForUser(user.id);
    return records.map((record) => this.toDto(record));
  }

  /** Owner flow: generates the invite token the creator shares with friends. */
  async createInvite(
    user: AuthSessionUser,
    challengeId: string,
    inviteeEmail?: string,
  ): Promise<{ invite: { token: string } }> {
    const invite = await this.store.createInvite({
      challengeId,
      inviterId: user.id,
      inviteeEmail: inviteeEmail ?? null,
    });
    return { invite: { token: invite.token } };
  }

  async joinChallenge(
    user: AuthSessionUser,
    challengeId: string,
    inviteToken: string,
  ): Promise<ChallengeDto> {
    const result = await this.store.joinChallenge({
      challengeId,
      userId: user.id,
      inviteToken,
    });
    if (!result.ok) {
      if (result.reason === 'full') {
        throw new ConflictException('This challenge is full (20/20 members).');
      }
      throw new ForbiddenException('You are not invited to this challenge.');
    }
    return this.toDto(result.challenge);
  }

  private toDto(record: {
    id: string;
    name: string;
    type: string;
    status: string;
    startDate: Date;
    endDate: Date;
    createdBy: string;
    memberCount: number;
  }): ChallengeDto {
    return {
      id: record.id,
      name: record.name,
      type: record.type as ChallengeDto['type'],
      status: record.status as ChallengeDto['status'],
      startDate: record.startDate.toISOString(),
      endDate: record.endDate.toISOString(),
      createdBy: record.createdBy,
      memberCount: record.memberCount,
    };
  }
}
