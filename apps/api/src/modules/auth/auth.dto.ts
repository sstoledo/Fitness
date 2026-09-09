import { IsEmail, IsString, MinLength } from 'class-validator';

/**
 * HTTP bodies for the auth endpoints. These classes mirror the zod schemas
 * `RegisterDtoSchema` / `LoginDtoSchema` from `@fitness/contracts` so the
 * global ValidationPipe can enforce the same rules (and return 400s) before
 * better-auth is invoked. Keep them in sync with the contracts package.
 */
export class RegisterBodyDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsString()
  @MinLength(1)
  name!: string;
}

export class LoginBodyDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(1)
  password!: string;
}
