import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Aligns the account table with Better Auth 1.7.2's issuer/accountId key. */
export class BetterAuthAccountIssuer1788307400000 implements MigrationInterface {
  name = 'BetterAuthAccountIssuer1788307400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "authAccount"
      ADD COLUMN "issuer" varchar(255) NOT NULL DEFAULT 'credential'
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "authAccount_issuer_accountId_uq" ON "authAccount" ("issuer", "accountId")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "authAccount_issuer_accountId_uq"`,
    );
    await queryRunner.query(`ALTER TABLE "authAccount" DROP COLUMN "issuer"`);
  }
}
