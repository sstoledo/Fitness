import {
  Body,
  Controller,
  HttpCode,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { AuthSessionUser } from '../auth/session.guard';
import { ChallengesAuthGuard } from './challenges-auth.guard';
import { ChallengesService } from './challenges.service';
import { StepSyncBatchDto } from './steps.dto';

interface RequestWithUser {
  user: AuthSessionUser;
}

/**
 * Steps sync HTTP API (issue #12, docs CUT-1-BACKEND.md 2.5/2.6).
 *
 * - POST /api/challenges/:id/steps → 200 { entries: [{ date, steps }] }
 *   Idempotent upsert: one row per (user, challenge, date), guaranteed by
 *   the `stepEntry_user_challenge_date_uq` unique constraint — repeated
 *   syncs never create duplicates nor touch the stored value.
 *                                 → 401 without a session token
 *                                 → 403 when the user is not a member
 *                                 → 400 on malformed payloads
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
}
