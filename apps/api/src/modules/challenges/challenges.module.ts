import { DynamicModule, Module, Type } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ChallengesAuthGuard } from './challenges-auth.guard';
import { ChallengesController } from './challenges.controller';
import { InMemoryChallengesStore } from './challenges.memory.store';
import { ChallengesService } from './challenges.service';
import { ChallengesStore } from './challenges.store';
import { TypeOrmChallengesStore } from './challenges.typeorm.store';
import { Challenge } from './entities/challenge.entity';
import { Invite } from './entities/invite.entity';
import { Membership } from './entities/membership.entity';
import { UserProfile } from './entities/user-profile.entity';
import { TypeOrmModule } from '@nestjs/typeorm';

export const CHALLENGE_ENTITIES = [Challenge, Membership, Invite, UserProfile];

export interface ChallengesModuleOptions {
  /**
   * 'memory' (default): in-memory store + trust-bearer auth fallback — no
   * database required. Used by the plain `ChallengesModule` in tests.
   * 'typeorm': Postgres-backed store + real session validation via
   * AuthModule. Used by AppModule in production.
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
      imports: [TypeOrmModule.forFeature(CHALLENGE_ENTITIES), AuthModule],
      providers: [
        {
          provide: ChallengesStore,
          useClass: TypeOrmChallengesStore as Type<ChallengesStore>,
        },
      ],
    };
  }
}
