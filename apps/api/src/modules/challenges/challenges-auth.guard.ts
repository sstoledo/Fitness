import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  Optional,
  UnauthorizedException,
} from '@nestjs/common';
import type { Auth } from 'better-auth';
import type { AuthSessionUser } from '../auth/session.guard';

/**
 * Authentication for the challenges routes (Cut 1, task #9).
 *
 * Two modes, mirroring the persistence split of this module:
 *
 * - Production (`ChallengesModule.forRoot({ persistence: 'typeorm' })`
 *   imports AuthModule): the better-auth instance is injected and the bearer
 *   token is validated exactly like the auth module's SessionGuard.
 * - Isolated/tests (plain `ChallengesModule`): no BETTER_AUTH provider
 *   exists, so any non-empty bearer is trusted and the token itself becomes
 *   the session user id. This keeps the RED contract tests database- and
 *   auth-adapter-free, same trade-off as the auth memory adapter.
 *
 * A missing Authorization header is always a bare 401 — the mobile client
 * treats it as "clear the local session and re-login".
 */
@Injectable()
export class ChallengesAuthGuard implements CanActivate {
  constructor(
    @Optional() @Inject('BETTER_AUTH') private readonly auth?: Auth,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{
      headers: { authorization?: string };
      user?: AuthSessionUser;
    }>();
    const authorization = request.headers.authorization;

    if (typeof authorization !== 'string' || authorization.length === 0) {
      throw new UnauthorizedException();
    }

    if (!this.auth) {
      // Isolated/test mode: trust the bearer, use it as the user id.
      const id = authorization.replace(/^Bearer\s+/i, '');
      request.user = { id, email: '', name: 'Test User' };
      return true;
    }

    const session = await this.auth.api.getSession({
      headers: new Headers({ authorization }),
    });
    if (!session) {
      throw new UnauthorizedException();
    }

    request.user = {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name,
    };
    return true;
  }
}
