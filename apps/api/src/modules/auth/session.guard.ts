import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Auth } from 'better-auth';

export interface AuthSessionUser {
  id: string;
  email: string;
  name: string;
}

/**
 * Validates the bearer session token on protected routes (`/api/auth/logout`,
 * `/api/auth/session`, and later the challenges module). The bearer plugin on
 * the better-auth instance converts the `Authorization` header into the
 * internal session cookie, so a plain Headers object is enough to resolve
 * the session. A missing, invalid, or expired token is always a bare 401 —
 * the mobile client treats it as "clear the local session and re-login".
 */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(@Inject('BETTER_AUTH') private readonly auth: Auth) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{ headers: { authorization?: string }; user?: AuthSessionUser }>();
    const authorization = request.headers.authorization;

    if (typeof authorization !== 'string' || authorization.length === 0) {
      throw new UnauthorizedException();
    }

    const session = await this.auth.api.getSession({
      headers: new Headers({ authorization }),
    });

    if (!session) {
      throw new UnauthorizedException();
    }

    request.user = { id: session.user.id, email: session.user.email, name: session.user.name };
    return true;
  }
}
