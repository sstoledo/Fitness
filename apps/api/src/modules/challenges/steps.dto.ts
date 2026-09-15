import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsString,
  Matches,
  Min,
  ValidateNested,
} from 'class-validator';

/**
 * HTTP payload for the steps sync endpoint (issue #12).
 *
 * The wire contract lives in `@fitness/contracts` (`StepSyncBatchDtoSchema`);
 * these class-validator DTOs mirror it exactly so the global ValidationPipe
 * can reject malformed payloads before the service layer runs.
 */
export class StepSyncEntryDto {
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date!: string;

  @IsInt()
  @Min(0)
  steps!: number;
}

export class StepSyncBatchDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => StepSyncEntryDto)
  entries!: StepSyncEntryDto[];
}
