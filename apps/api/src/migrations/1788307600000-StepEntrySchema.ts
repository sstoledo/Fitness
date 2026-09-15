import type { MigrationInterface, QueryRunner } from 'typeorm';

export class StepEntrySchema1788307600000 implements MigrationInterface {
  name = 'StepEntrySchema1788307600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "stepEntry" (
        "id" int GENERATED ALWAYS AS IDENTITY,
        "userId" int NOT NULL,
        "challengeId" int NOT NULL,
        "date" date NOT NULL,
        "steps" int NOT NULL,
        "syncedAt" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "stepEntry_pkey" PRIMARY KEY ("id"),
        CONSTRAINT "stepEntry_user_challenge_date_uq" UNIQUE ("userId", "challengeId", "date"),
        CONSTRAINT "stepEntry_steps_nonnegative_chk" CHECK ("steps" >= 0),
        CONSTRAINT "stepEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE,
        CONSTRAINT "stepEntry_challengeId_fkey" FOREIGN KEY ("challengeId") REFERENCES "challenge"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "stepEntry_challengeId_date_idx"
      ON "stepEntry" ("challengeId", "date")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS "stepEntry"');
  }
}
