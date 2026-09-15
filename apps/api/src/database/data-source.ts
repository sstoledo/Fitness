import 'reflect-metadata';
import { config } from 'dotenv';
import { DataSource } from 'typeorm';
import { Challenge } from '../modules/challenges/entities/challenge.entity';
import { Invite } from '../modules/challenges/entities/invite.entity';
import { Membership } from '../modules/challenges/entities/membership.entity';
import { UserProfile } from '../modules/challenges/entities/user-profile.entity';
import { StepEntry } from '../modules/steps/entities/step-entry.entity';
import { ChallengesSchema1788307200000 } from '../migrations/1788307200000-ChallengesSchema';
import { BetterAuthSchema1788307300000 } from '../migrations/1788307300000-BetterAuthSchema';
import { BetterAuthAccountIssuer1788307400000 } from '../migrations/1788307400000-BetterAuthAccountIssuer';
import { UserProfilePasswordHashNullable1788307500000 } from '../migrations/1788307500000-UserProfilePasswordHashNullable';
import { StepEntrySchema1788307600000 } from '../migrations/1788307600000-StepEntrySchema';

config({ path: '.env' });

/**
 * TypeORM CLI datasource (Cut 1, task #9).
 *
 * Used by the `typeorm:*` scripts in package.json, e.g.:
 *
 *     pnpm --filter api typeorm migration:run
 *     pnpm --filter api typeorm migration:generate src/migrations/NextChange
 *
 * The running API does NOT depend on this file — AppModule runs the same
 * migration list automatically on boot (`migrationsRun: true`). Explicit
 * entity references (no globs) keep the CLI compatible with the
 * `module: nodenext` tsconfig.
 */
export default new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  entities: [UserProfile, Challenge, Membership, Invite, StepEntry],
  migrations: [
    ChallengesSchema1788307200000,
    BetterAuthSchema1788307300000,
    BetterAuthAccountIssuer1788307400000,
    UserProfilePasswordHashNullable1788307500000,
    StepEntrySchema1788307600000,
  ],
});
