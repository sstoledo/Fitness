import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Makes the domain `user` profile `passwordHash` nullable.
 *
 * better-auth owns credentials in its own authAccount table; the domain
 * profile is reconciled lazily (find-or-create by email in
 * `DomainUserMapper`) and never stores a password hash. Additive only —
 * `synchronize` stays off.
 */
export class UserProfilePasswordHashNullable1788307500000 implements MigrationInterface {
  name = 'UserProfilePasswordHashNullable1788307500000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "user" ALTER COLUMN "passwordHash" DROP NOT NULL',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "user" ALTER COLUMN "passwordHash" SET NOT NULL',
    );
  }
}
