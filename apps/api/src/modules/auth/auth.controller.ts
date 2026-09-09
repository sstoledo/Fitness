import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Inject,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { APIError, type Auth } from 'better-auth';
import { LoginBodyDto, RegisterBodyDto } from './auth.dto';
import { SessionGuard, type AuthSessionUser } from './session.guard';

interface PublicUser {
  id: string;
  email: string;
  name: string;
}

function toPublicUser(user: AuthSessionUser): PublicUser {
  return { id: user.id, email: user.email, name: user.name };
}

/**
 * Maps a better-auth APIError to an HttpException, preserving the HTTP
 * status (e.g. 409 for a duplicate email on register). better-auth errors
 * carry the payload in `body` — usually `{ message, ... }` — so the client
 * gets a readable `message` field in the response.
 */
function mapAuthError(error: unknown): HttpException {
  if (error instanceof APIError) {
    const body = error.body as { message?: unknown; code?: unknown } | string | undefined;
    const message =
      typeof body === 'string'
        ? body
        : typeof body?.message === 'string'
          ? body.message
          : error.message;
    // better-auth reports a duplicate email as 422 UNPROCESSABLE_ENTITY; the
    // contract (and the mobile client) expects 409 for a conflicting email.
    if (typeof body === 'object' && body !== null && typeof body.code === 'string' && body.code.startsWith('USER_ALREADY_EXISTS')) {
      return new HttpException(message || 'Email already in use', HttpStatus.CONFLICT);
    }
    const status = Number(error.status);
    if (Number.isInteger(status) && status >= 400 && status < 600) {
      return new HttpException(message || 'Request failed', status);
    }
  }
  throw error;
}

/**
 * Auth HTTP contract (Cut 1, task #5). Bearer-token transport, shapes locked
 * by the mobile api client and the RED tests of task #3:
 *
 * - POST /api/auth/register → 201 { token, user } · 400 validation · 409 dup
 * - POST /api/auth/login    → 200 { token, user } · 401 generic "invalid
 *   credentials" — identical for a wrong password and an unknown email so
 *   the API never reveals which field failed
 * - POST /api/auth/logout   → 204 (bearer) — session invalidated server-side
 * - GET  /api/auth/session  → 200 { user } (bearer) — 401 clears the client
 */
@Controller('auth')
export class AuthController {
  constructor(@Inject('BETTER_AUTH') private readonly auth: Auth) {}

  @Post('register')
  async register(@Body() dto: RegisterBodyDto) {
    try {
      const { token, user } = await this.auth.api.signUpEmail({
        body: { name: dto.name, email: dto.email, password: dto.password },
      });
      if (!token) {
        throw new HttpException('Failed to create session', HttpStatus.INTERNAL_SERVER_ERROR);
      }
      return { token, user: toPublicUser(user) };
    } catch (error) {
      throw mapAuthError(error);
    }
  }

  @Post('login')
  @HttpCode(200)
  async login(@Body() dto: LoginBodyDto) {
    try {
      const { token, user } = await this.auth.api.signInEmail({
        body: { email: dto.email, password: dto.password },
      });
      if (!token) {
        throw new HttpException('Failed to create session', HttpStatus.INTERNAL_SERVER_ERROR);
      }
      return { token, user: toPublicUser(user) };
    } catch (error) {
      if (error instanceof APIError) {
        // Any credential failure (wrong password, unknown email, unverified
        // account) collapses into the same generic 401 — never leak which
        // field was wrong.
        throw new UnauthorizedException('Invalid credentials');
      }
      throw error;
    }
  }

  @Post('logout')
  @HttpCode(204)
  @UseGuards(SessionGuard)
  async logout(@Req() request: { headers: Record<string, string | string[] | undefined> }) {
    const authorization = request.headers.authorization;
    if (typeof authorization === 'string') {
      // Best-effort server-side invalidation: the contract promises a bare
      // 204 even if the session is already gone.
      await this.auth.api
        .signOut({ headers: new Headers({ authorization }) })
        .catch(() => undefined);
    }
  }

  @Get('session')
  @UseGuards(SessionGuard)
  session(@Req() request: { user?: AuthSessionUser }) {
    return { user: toPublicUser(request.user as AuthSessionUser) };
  }
}
