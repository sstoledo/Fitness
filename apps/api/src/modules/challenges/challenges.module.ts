import { DynamicModule, Module, Type } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ChallengesAuthGuard } from './challenges-auth.guard';
import { ChallengesController } from './challenges.controller';
import { InMemoryChallengesStore } from './challenges.memory.store';
import { ChallengesService } from './challenges.service';
import { ChallengesStore } from './challenges.store';
import { TypeOrmChallengesStore } from './challenges.typeorm.store';
import { DomainUserMapper } from './domain-user.mapper';
import { Challenge } from './entities/challenge.entity';
import { Invite } from './entities/invite.entity';
import { Membership } from './entities/membership.entity';
import { UserProfile } from './entities/user-profile.entity';

export const CHALLENGE_ENTITIES = [Challenge, Membership, Invite, UserProfile];

export interface ChallengesModuleOptions {
  /**
   * 'memory' (default): in-memory store + trust-bearer auth fallback — no
   * database required. Used by the plain `ChallengesModule` in tests.
   * 'typeorm': Postgres-backed store + real session validation. Used by
   * AppModule in production; the single postgres BETTER_AUTH instance comes
   * from the global AuthModule.forRoot({ storage: 'postgres' }) (wired in
   * AppModule, not imported here) and DomainUserMapper reconciles the
   * session id against the numeric domain `user` table.
   */
  persistence?: 'memory' | 'typeorm';
}

/**
 * Challenges module (Cut 1, task #9 — GREEN).
 *
 * The plain class is the memory flavour so the RED contract tests keep
 * compiling `ChallengesModule` alone without Postgres; AppModule opts into
 * persistence explicitly:
 *
 *     ChallengesModule.forRoot({ persistence: 'typeorm' })
 *
 * Entities live here (autoLoadEntities picks them up for migrations) and
 * the additive migration in `src/migrations/` creates the schema — with
 * `synchronize: false` always.
 */
@Module({
  controllers: [ChallengesController],
  providers: [
    ChallengesService,
    ChallengesAuthGuard,
    { provide: ChallengesStore, useClass: InMemoryChallengesStore },
  ],
})
export class ChallengesModule {
  static forRoot(options: ChallengesModuleOptions = {}): DynamicModule {
    const persistence = options.persistence ?? 'memory';
    if (persistence === 'memory') {
      return { module: ChallengesModule };
    }

    return {
      module: ChallengesModule,
      // No AuthModule import here: AuthModule.forRoot({ storage: 'postgres' })
      // is marked global by AppModule, so the single postgres-backed
      // BETTER_AUTH provider is visible from this module scope (and the
      // memory instance of the plain AuthModule class no longer shadows it).
      imports: [TypeOrmModule.forFeature(CHALLENGE_ENTITIES)],
      providers: [
        {
          provide: ChallengesStore,
          useClass: TypeOrmChallengesStore as Type<ChallengesStore>,
        },
        // Reconciler between better-auth sessions (string ids) and the
        // numeric domain `user` table (find-or-create by unique email).
        DomainUserMapper,
      ],
    };
  }
}
