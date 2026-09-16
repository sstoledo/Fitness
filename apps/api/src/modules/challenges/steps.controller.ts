import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { AuthSessionUser } from '../auth/session.guard';
import { ChallengesAuthGuard } from './challenges-auth.guard';
import { ChallengesService } from './challenges.service';
import { LeaderboardQueryDto, StepSyncBatchDto } from './steps.dto';

interface RequestWithUser {
  user: AuthSessionUser;
}

/**
 * Steps sync + daily leaderboard HTTP API (issues #12/#13, docs
 * CUT-1-BACKEND.md 2.5/2.6).
 *
 * - POST /api/challenges/:id/steps → 200 { entries: [{ date, steps }] }
 *   Idempotent upsert: one row per (user, challenge, date), guaranteed by
 *   the `stepEntry_user_challenge_date_uq` unique constraint — repeated
 *   syncs never create duplicates nor touch the stored value.
 *                                 → 401 without a session token
 *                                 → 403 when the user is not a member
 *                                 → 400 on malformed payloads
 *
 * - GET /api/challenges/:id/leaderboard?date=YYYY-MM-DD
 *                                 → 200 LeaderboardEntryDto[] (bare array)
 *   Daily ranking of all members by steps on the given calendar day
 *   (default: server UTC today). Ties share a rank (RANK() semantics) and
 *   order by earliest join. Members without steps for the date appear with
 *   steps 0. → 401 / 403 (non-member) / 400 (bad date).
 *
 * Same bearer-protection style as ChallengesController.
 */
@Controller('challenges')
@UseGuards(ChallengesAuthGuard)
export class StepsController {
  constructor(private readonly challenges: ChallengesService) {}

  @Post(':id/steps')
  @HttpCode(200)
  async syncSteps(
    @Req() request: RequestWithUser,
    @Param('id') challengeId: string,
    @Body() dto: StepSyncBatchDto,
  ) {
    // `request.user.id` is already the numeric-string domain id after the
    // guard reconciled the session (or the bearer token in memory mode).
    return this.challenges.syncSteps(request.user.id, challengeId, dto.entries);
  }

  @Get(':id/leaderboard')
  async getLeaderboard(
    @Req() request: RequestWithUser,
    @Param('id') challengeId: string,
    @Query() query: LeaderboardQueryDto,
  ) {
    return this.challenges.getDailyLeaderboard(
      request.user.id,
      challengeId,
      query.date,
    );
  }
}
