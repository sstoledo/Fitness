import {
  IsDateString,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

/**
 * HTTP payloads for the challenges endpoints (Cut 1, task #9).
 *
 * The wire contract lives in `@fitness/contracts` (zod) and is what the
 * mobile client validates against; these class-validator DTOs mirror it so
 * the global ValidationPipe can reject malformed payloads before the
 * service layer runs.
 */
export class CreateChallengeDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @IsIn(['step', 'run', 'walk', 'bike'])
  type!: string;

  @IsDateString()
  startDate!: string;

  @IsDateString()
  endDate!: string;
}

export class JoinChallengeDto {
  @IsString()
  @MinLength(1)
  inviteToken!: string;
}

export class CreateInviteDto {
  /** Optional: restrict the invite to one email. Omit for a link invite. */
  @IsOptional()
  @IsEmail()
  inviteeEmail?: string;
}
