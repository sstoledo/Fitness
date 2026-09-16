import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsString,
  Matches,
  Max,
  Min,
  registerDecorator,
  ValidateNested,
  ValidatorConstraint,
  type ValidationArguments,
  type ValidatorConstraintInterface,
} from 'class-validator';

/**
 * Rejects strings that look like YYYY-MM-DD but name an impossible calendar
 * date (e.g. 2026-02-30 or 2026-99-99) — the @Matches regex alone cannot tell.
 * Same round-trip rule as the contract's `.refine()` in
 * `@fitness/contracts` (`StepSyncBatchDtoSchema`).
 */
@ValidatorConstraint({ name: 'IsCalendarDate' })
export class IsCalendarDateConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return false;
    }
    const year = Number(value.slice(0, 4));
    const month = Number(value.slice(5, 7));
    const day = Number(value.slice(8, 10));
    const parsed = new Date(Date.UTC(year, month - 1, day));
    return (
      parsed.getUTCFullYear() === year &&
      parsed.getUTCMonth() === month - 1 &&
      parsed.getUTCDate() === day
    );
  }

  defaultMessage(_args: ValidationArguments): string {
    return 'date must be a real calendar date (YYYY-MM-DD)';
  }
}

export function IsCalendarDate() {
  return function (object: object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName,
      validator: IsCalendarDateConstraint,
    });
  };
}

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
  @IsCalendarDate()
  date!: string;

  @IsInt()
  @Min(0)
  // 2147483647 is the PostgreSQL int maximum for the steps column.
  @Max(2147483647)
  steps!: number;
}

export class StepSyncBatchDto {
  @IsArray()
  @ArrayMinSize(1)
  // Mirrors the contract's .max(31): a month of daily syncs; bigger batches
  // only mean abuse or a bug, and would bloat the upsert + read-back query.
  @ArrayMaxSize(31)
  @ValidateNested({ each: true })
  @Type(() => StepSyncEntryDto)
  entries!: StepSyncEntryDto[];
}
