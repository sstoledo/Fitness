import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Better Auth 1.7.2 schema, isolated from the numeric domain `user` table. */
export class BetterAuthSchema1788307300000 implements MigrationInterface {
  name = 'BetterAuthSchema1788307300000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "authUser" (
        "id" varchar(36) PRIMARY KEY,
        "name" varchar(255) NOT NULL,
        "email" varchar(255) NOT NULL UNIQUE,
        "emailVerified" boolean NOT NULL DEFAULT false,
        "image" text,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "authSession" (
        "id" varchar(36) PRIMARY KEY,
        "expiresAt" timestamptz NOT NULL,
        "token" varchar(255) NOT NULL UNIQUE,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        "ipAddress" text,
        "userAgent" text,
        "userId" varchar(36) NOT NULL REFERENCES "authUser"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "authSession_userId_idx" ON "authSession" ("userId")`,
    );

    await queryRunner.query(`
      CREATE TABLE "authAccount" (
        "id" varchar(36) PRIMARY KEY,
        "accountId" varchar(255) NOT NULL,
        "providerId" varchar(255) NOT NULL,
        "userId" varchar(36) NOT NULL REFERENCES "authUser"("id") ON DELETE CASCADE,
        "accessToken" text,
        "refreshToken" text,
        "idToken" text,
        "accessTokenExpiresAt" timestamptz,
        "refreshTokenExpiresAt" timestamptz,
        "scope" text,
        "password" text,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "authAccount_userId_idx" ON "authAccount" ("userId")`,
    );

    await queryRunner.query(`
      CREATE TABLE "authVerification" (
        "id" varchar(36) PRIMARY KEY,
        "identifier" varchar(255) NOT NULL,
        "value" varchar(255) NOT NULL,
        "expiresAt" timestamptz NOT NULL,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "authVerification_identifier_idx" ON "authVerification" ("identifier")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "authVerification"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "authAccount"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "authSession"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "authUser"`);
  }
}
