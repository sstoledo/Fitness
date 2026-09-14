import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserProfile } from './entities/user-profile.entity';

/**
 * Reconciles better-auth sessions (string user ids in `authUser`) with the
 * numeric domain `user` profile table that the challenge/membership/invite
 * foreign keys reference.
 *
 * The challenges guard runs this after a session resolves, so a mobile user
 * who signed up through `/api/auth/register` gets a domain profile row the
 * first time they touch a challenges route. Lookup first, insert on miss —
 * safe under concurrent first requests because the email is UNIQUE: the
 * losing insert hits Postgres error 23505 and re-reads the winner's row.
 *
 * Profiles are created WITHOUT a password hash on purpose: better-auth owns
 * credentials in its own auth tables, so the domain field stays null.
 */
@Injectable()
export class DomainUserMapper {
  constructor(
    @InjectRepository(UserProfile)
    private readonly users: Repository<UserProfile>,
  ) {}

  /** Finds the domain user by email or creates one, then returns the row. */
  async toDomainUser(authUser: {
    id: string;
    email: string;
    name: string;
  }): Promise<{ id: number; email: string; name: string }> {
    const existing = await this.users.findOne({
      where: { email: authUser.email },
    });
    if (existing) {
      return { id: existing.id, email: existing.email, name: existing.name };
    }

    try {
      const created = await this.users.save(
        this.users.create({
          email: authUser.email,
          name: authUser.name,
          passwordHash: null,
        }),
      );
      return { id: created.id, email: created.email, name: created.name };
    } catch (error) {
      // Unique-email race: someone else inserted this email between our
      // findOne and insert. Re-read their row instead of surfacing a 500.
      const code = (error as { code?: unknown } | null)?.code;
      if (code === '23505') {
        const winner = await this.users.findOne({
          where: { email: authUser.email },
        });
        if (winner) {
          return { id: winner.id, email: winner.email, name: winner.name };
        }
      }
      throw error;
    }
  }
}
