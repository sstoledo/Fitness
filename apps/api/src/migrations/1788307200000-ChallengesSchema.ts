import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Challenges schema — Cut 1, task #9 (GREEN challenges).
 *
 * Additive only: creates the domain `user` profile plus `challenge`,
 * `membership` and `invite` per docs/DATABASE.md (camelCase quoted
 * identifiers, GENERATED ALWAYS AS IDENTITY, CHECK constraints, explicit
 * PK/FK). Nothing is altered or dropped — `synchronize` stays off.
 *
 * Deviations from DATABASE.md, documented in the entity files:
 * - `challenge.startDate`/`endDate` are `timestamptz` instead of `date`
 *   because the API contract round-trips full ISO-8601 datetimes.
 * - The `user` table is the domain profile; better-auth still runs on its
 *   memory adapter. Reconciliation with better-auth's own tables is a
 *   separate, later task.
 */
export class ChallengesSchema1788307200000 implements MigrationInterface {
  name = 'ChallengesSchema1788307200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "user" (
        "id" int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        "email" varchar(255) NOT NULL UNIQUE,
        "name" varchar(80) NOT NULL,
        "passwordHash" varchar(255) NOT NULL,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "challenge" (
        "id" int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        "name" varchar(120) NOT NULL,
        "type" varchar(10) NOT NULL CHECK ("type" IN ('step', 'run', 'walk', 'bike')),
        "status" varchar(10) NOT NULL DEFAULT 'pending' CHECK ("status" IN ('pending', 'active', 'ended')),
        "startDate" timestamptz NOT NULL,
        "endDate" timestamptz NOT NULL,
        "createdById" int NOT NULL REFERENCES "user"("id") ON DELETE RESTRICT,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        CHECK ("endDate" > "startDate")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "membership" (
        "id" int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        "userId" int NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
        "challengeId" int NOT NULL REFERENCES "challenge"("id") ON DELETE CASCADE,
        "role" varchar(10) NOT NULL DEFAULT 'member' CHECK ("role" IN ('owner', 'member')),
        "joinedAt" timestamptz NOT NULL DEFAULT now(),
        UNIQUE ("userId", "challengeId")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "membership_challengeId_idx" ON "membership" ("challengeId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "membership_userId_idx" ON "membership" ("userId")`,
    );

    await queryRunner.query(`
      CREATE TABLE "invite" (
        "id" int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        "challengeId" int NOT NULL REFERENCES "challenge"("id") ON DELETE CASCADE,
        "inviterId" int NOT NULL REFERENCES "user"("id"),
        "inviteeEmail" varchar(255),
        "token" varchar(64) NOT NULL UNIQUE,
        "status" varchar(10) NOT NULL DEFAULT 'pending' CHECK ("status" IN ('pending', 'accepted', 'expired')),
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "expiresAt" timestamptz NOT NULL
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "invite_token_idx" ON "invite" ("token")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Reverse order respects the foreign-key dependency chain.
    await queryRunner.query(`DROP TABLE IF EXISTS "invite"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "membership"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "challenge"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "user"`);
  }
}
