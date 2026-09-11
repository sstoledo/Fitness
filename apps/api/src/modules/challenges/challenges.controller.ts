import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { AuthSessionUser } from '../auth/session.guard';
import { ChallengesAuthGuard } from './challenges-auth.guard';
import {
  CreateChallengeDto,
  CreateInviteDto,
  JoinChallengeDto,
} from './challenges.dto';
import { ChallengesService } from './challenges.service';

interface RequestWithUser {
  user: AuthSessionUser;
}

/**
 * Challenges HTTP API (Cut 1, task #9 — GREEN).
 *
 * Contract (RED tests of task #7 + step-challenges spec):
 * - POST /api/challenges            → 201 { challenge } (creator is first member)
 * - POST /api/challenges            → 400 when endDate is not after startDate
 * - GET  /api/challenges            → 200 { challenges } (member-scoped list)
 * - POST /api/challenges/:id/invites → 201 { invite: { token } } (member flow)
 * - POST /api/challenges/:id/join   → 200 { challenge } (bearer + inviteToken)
 *                                   → 401 without a session token
 *                                   → 403 when the user has no invite
 *                                   → 409 when the challenge is full (max 20)
 *
 * All routes are bearer-protected via ChallengesAuthGuard.
 */
@Controller('challenges')
@UseGuards(ChallengesAuthGuard)
export class ChallengesController {
  constructor(private readonly challenges: ChallengesService) {}

  @Post()
  async create(
    @Req() request: RequestWithUser,
    @Body() body: CreateChallengeDto,
  ) {
    const challenge = await this.challenges.createChallenge(request.user, body);
    return { challenge };
  }

  @Get()
  async list(@Req() request: RequestWithUser) {
    const challenges = await this.challenges.listChallenges(request.user);
    return { challenges };
  }

  @Post(':id/invites')
  async invite(
    @Req() request: RequestWithUser,
    @Param('id') challengeId: string,
    @Body() body: CreateInviteDto,
  ) {
    return this.challenges.createInvite(
      request.user,
      challengeId,
      body.inviteeEmail,
    );
  }

  @Post(':id/join')
  @HttpCode(200)
  async join(
    @Req() request: RequestWithUser,
    @Param('id') challengeId: string,
    @Body() body: JoinChallengeDto,
  ) {
    const challenge = await this.challenges.joinChallenge(
      request.user,
      challengeId,
      body.inviteToken,
    );
    return { challenge };
  }
}
