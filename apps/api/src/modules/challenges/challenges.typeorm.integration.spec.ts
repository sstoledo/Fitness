import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule, getRepositoryToken } from '@nestjs/typeorm';
import { config as loadDotEnv } from 'dotenv';
import Redis from 'ioredis';
import request from 'supertest';
import { DataSource, Repository } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AuthModule } from '../auth/auth.module';
import { BetterAuthSchema1788307300000 } from '../../migrations/1788307300000-BetterAuthSchema';
import { BetterAuthAccountIssuer1788307400000 } from '../../migrations/1788307400000-BetterAuthAccountIssuer';
import { ChallengesSchema1788307200000 } from '../../migrations/1788307200000-ChallengesSchema';
import { UserProfilePasswordHashNullable1788307500000 } from '../../migrations/1788307500000-UserProfilePasswordHashNullable';
import { StepEntrySchema1788307600000 } from '../../migrations/1788307600000-StepEntrySchema';
import { StepEntry } from '../steps/entities/step-entry.entity';
import { ChallengesModule } from './challenges.module';

// supertest types every response body as `any`; these shadow types keep the
// flow fully typed so the repo's no-unsafe-* lint rules stay green. The
// shapes mirror the auth/challenges controller contracts.
interface RegisterResponseBody {
  token: string;
  user: { id: string; email: string; name: string };
}
interface ChallengeSummary {
  id: string;
  name: string;
  type: string;
  status: string;
  startDate: string;
  endDate: string;
  createdBy: string;
  memberCount: number;
}
interface ChallengeResponseBody {
  challenge: ChallengeSummary;
}
interface ChallengeListResponseBody {
  challenges: ChallengeSummary[];
}
interface InviteResponseBody {
  invite: { token: string };
}
interface StepSyncResponseBody {
  entries: { date: string; steps: number }[];
}
interface LeaderboardEntryBody {
  userId: string;
  name: string;
  steps: number;
  rank: number;
  isRequester: boolean;
}
interface ErrorMessageBody {
  message: string | string[];
}
type SuperResponse<T> = { body: T };

/**
 * Real end-to-end flow over PostgreSQL: register → create challenge → invite
 * → join, exercising the exact AppModule wiring
 * (`AuthModule.forRoot({ storage: 'postgres' })` + `ChallengesModule.forRoot(
 * { persistence: 'typeorm' })`) — the single global better-auth instance,
 * the session→domain `DomainUserMapper` reconciliation and the additive
 * migrations.
 *
 * Gated: this describe only runs when `INTEGRATION_DATABASE_URL` is set (the
 * orchestrator supplies a scratch database). Plain `pnpm --filter api test`
 * has no such env var, so the whole block is skipped and the default suite
 * keeps running without Postgres.
 */
const runIntegration = !!process.env.INTEGRATION_DATABASE_URL;

describe.skipIf(!runIntegration)(
  'Challenges + Auth over real PostgreSQL',
  () => {
    let moduleRef: TestingModule;
    let nestApp: INestApplication<import('http').Server>;
    let httpServer: import('http').Server;
    let originalDatabaseUrl: string | undefined;
    // Test-owned Redis client for cache assertions (issue #13, PR-B). Created
    // in beforeAll, gated on a successful ping: the leaderboard behavior
    // assertions always run, but cache-specific probes are skipped when
    // Redis is unreachable (resilience itself is unit-tested).
    let testRedis: Redis | null = null;
    let redisAvailable = false;

    // Unique per run so repeated executions never collide on emails.
    const runId = Date.now().toString(36);
    const password = 'integration-pass-1';
    const challengePayload = {
      name: `Integration Step Challenge ${runId}`,
      type: 'step',
      startDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      endDate: new Date(Date.now() + 8 * 24 * 60 * 60 * 1000).toISOString(),
    };

    beforeAll(async () => {
      // Mirror production env loading (apps/api/.env), with the scratch test
      // database overriding the dev DATABASE_URL.
      originalDatabaseUrl = process.env.DATABASE_URL;
      loadDotEnv({ path: '.env' });
      process.env.DATABASE_URL = process.env.INTEGRATION_DATABASE_URL!;
      if (
        !process.env.BETTER_AUTH_SECRET ||
        process.env.BETTER_AUTH_SECRET.length < 32
      ) {
        process.env.BETTER_AUTH_SECRET =
          'integration-secret-at-least-32-characters-long';
      }

      moduleRef = await Test.createTestingModule({
        imports: [
          ConfigModule.forRoot({ isGlobal: true }),
          TypeOrmModule.forRootAsync({
            inject: [ConfigService],
            useFactory: (config: ConfigService) => ({
              type: 'postgres',
              url: config.getOrThrow<string>('DATABASE_URL'),
              autoLoadEntities: true,
              synchronize: false,
              migrationsRun: true,
              migrations: [
                ChallengesSchema1788307200000,
                BetterAuthSchema1788307300000,
                BetterAuthAccountIssuer1788307400000,
                UserProfilePasswordHashNullable1788307500000,
                StepEntrySchema1788307600000,
              ],
            }),
          }),
          AuthModule.forRoot({ storage: 'postgres' }),
          ChallengesModule.forRoot({ persistence: 'typeorm' }),
        ],
      }).compile();

      // Mirror the global setup from main.ts so request paths and payload
      // validation match production.
      nestApp = moduleRef.createNestApplication();
      nestApp.setGlobalPrefix('api');
      nestApp.useGlobalPipes(
        new ValidationPipe({
          whitelist: true,
          transform: true,
          forbidNonWhitelisted: true,
        }),
      );
      await nestApp.init();
      httpServer = nestApp.getHttpServer();

      // Probe Redis once (REDIS_URL from .env, never printed). retryStrategy
      // null so an unreachable Redis fails fast instead of retrying.
      const probe = new Redis(
        process.env.REDIS_URL ?? 'redis://localhost:6379',
        {
          lazyConnect: true,
          connectTimeout: 1000,
          maxRetriesPerRequest: 1,
          retryStrategy: () => null,
        },
      );
      try {
        await probe.connect();
        redisAvailable = (await probe.ping()) === 'PONG';
        if (redisAvailable) testRedis = probe;
      } catch {
        redisAvailable = false;
        probe.disconnect();
      }
    });

    afterAll(async () => {
      try {
        // Truncate BEFORE closing so the pool can still run the query; the
        // scratch database stays reusable for the next run.
        const dataSource = moduleRef.get<DataSource>(DataSource);
        await dataSource.query(
          `TRUNCATE TABLE "user", "challenge", "membership", "invite", "authUser", "authSession", "authAccount", "authVerification" RESTART IDENTITY CASCADE`,
        );
      } catch {
        // A failed flow must not block teardown — the truncate is best-effort.
      } finally {
        // nestApp.close() triggers AuthPoolLifecycle shutdown (pool.end()).
        // Guarded so a beforeAll failure (e.g. unreachable database) still
        // restores the environment instead of masking the original error.
        try {
          await nestApp?.close();
        } catch {
          // Nothing was initialised — closing is a no-op.
        }
        try {
          await testRedis?.quit();
        } catch {
          testRedis?.disconnect();
        }
        if (originalDatabaseUrl === undefined) {
          delete process.env.DATABASE_URL;
        } else {
          process.env.DATABASE_URL = originalDatabaseUrl;
        }
      }
    });

    it('registers, creates a challenge, invites a second user and both list it', async () => {
      // 1. Owner registers (better-auth creates the session + token).
      const ownerEmail = `integration-owner-${runId}@example.com`;
      const owner = (await request(httpServer)
        .post('/api/auth/register')
        .send({ name: 'Integration Owner', email: ownerEmail, password })
        .expect(201)) as unknown as SuperResponse<RegisterResponseBody>;
      expect(owner.body.token.length).toBeGreaterThan(0);
      const ownerToken = owner.body.token;

      // 2. Owner creates a challenge; createdBy must be a numeric domain id
      //    (proves the DomainUserMapper reconciliation ran, not a raw uuid).
      const created = (await request(httpServer)
        .post('/api/challenges')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send(challengePayload)
        .expect(201)) as unknown as SuperResponse<ChallengeResponseBody>;
      expect(created.body.challenge).toMatchObject({
        name: challengePayload.name,
        type: 'step',
      });
      const challengeId = created.body.challenge.id;
      const createdBy = created.body.challenge.createdBy;
      expect(Number.isInteger(Number(createdBy))).toBe(true);
      expect(Number(createdBy)).toBeGreaterThan(0);
      expect(created.body.challenge.memberCount).toBe(1);

      // 3. Owner's list includes the new challenge.
      const ownerList = (await request(httpServer)
        .get('/api/challenges')
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200)) as unknown as SuperResponse<ChallengeListResponseBody>;
      expect(ownerList.body.challenges).toEqual(
        expect.arrayContaining([expect.objectContaining({ id: challengeId })]),
      );

      // 4. Second user registers.
      const inviteeEmail = `integration-invitee-${runId}@example.com`;
      const invitee = (await request(httpServer)
        .post('/api/auth/register')
        .send({ name: 'Integration Invitee', email: inviteeEmail, password })
        .expect(201)) as unknown as SuperResponse<RegisterResponseBody>;
      expect(invitee.body.token.length).toBeGreaterThan(0);
      const inviteeToken = invitee.body.token;

      // 5. Owner invites the second user by email.
      const invite = (await request(httpServer)
        .post(`/api/challenges/${challengeId}/invites`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ inviteeEmail })
        .expect(201)) as unknown as SuperResponse<InviteResponseBody>;
      expect(invite.body.invite.token.length).toBeGreaterThan(0);
      const inviteToken = invite.body.invite.token;

      // 6. Invitee joins with the token and sees the challenge in their list.
      const joined = (await request(httpServer)
        .post(`/api/challenges/${challengeId}/join`)
        .set('Authorization', `Bearer ${inviteeToken}`)
        .send({ inviteToken })
        .expect(200)) as unknown as SuperResponse<ChallengeResponseBody>;
      expect(joined.body.challenge).toMatchObject({
        id: challengeId,
        memberCount: 2,
      });

      const inviteeList = (await request(httpServer)
        .get('/api/challenges')
        .set('Authorization', `Bearer ${inviteeToken}`)
        .expect(200)) as unknown as SuperResponse<ChallengeListResponseBody>;
      expect(inviteeList.body.challenges).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: challengeId, memberCount: 2 }),
        ]),
      );
    });

    it('syncs steps idempotently: one row per (user, challenge, date), non-member rejected', async () => {
      // 1. Register the member (Alice) and the non-member (Bob).
      const aliceEmail = `integration-steps-alice-${runId}@example.com`;
      const alice = (await request(httpServer)
        .post('/api/auth/register')
        .send({ name: 'Integration Steps Alice', email: aliceEmail, password })
        .expect(201)) as unknown as SuperResponse<RegisterResponseBody>;
      expect(alice.body.token.length).toBeGreaterThan(0);
      const aliceToken = alice.body.token;

      const bobEmail = `integration-steps-bob-${runId}@example.com`;
      const bob = (await request(httpServer)
        .post('/api/auth/register')
        .send({ name: 'Integration Steps Bob', email: bobEmail, password })
        .expect(201)) as unknown as SuperResponse<RegisterResponseBody>;
      expect(bob.body.token.length).toBeGreaterThan(0);
      const bobToken = bob.body.token;

      // 2. Alice creates a challenge — as owner she is already a member,
      //    and `createdBy` proves the DomainUserMapper numeric reconciliation.
      const created = (await request(httpServer)
        .post('/api/challenges')
        .set('Authorization', `Bearer ${aliceToken}`)
        .send({
          name: `Integration Steps Challenge ${runId}`,
          type: 'step',
          startDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          endDate: new Date(Date.now() + 8 * 24 * 60 * 60 * 1000).toISOString(),
        })
        .expect(201)) as unknown as SuperResponse<ChallengeResponseBody>;
      const challengeId = created.body.challenge.id;
      const aliceDomainId = Number(created.body.challenge.createdBy);
      expect(Number.isInteger(aliceDomainId)).toBe(true);
      expect(aliceDomainId).toBeGreaterThan(0);

      const stepEntries = moduleRef.get<Repository<StepEntry>>(
        getRepositoryToken(StepEntry),
      );
      const syncDate = '2026-09-10';
      const countRows = async () =>
        stepEntries.findBy({
          userId: aliceDomainId,
          challengeId: Number(challengeId),
          date: syncDate,
        });

      // 3. Bob is not a member → 403 before any write happens.
      const forbidden = (await request(httpServer)
        .post(`/api/challenges/${challengeId}/steps`)
        .set('Authorization', `Bearer ${bobToken}`)
        .send({ entries: [{ date: syncDate, steps: 999 }] })
        .expect(403)) as unknown as SuperResponse<ErrorMessageBody>;
      expect(forbidden.body.message).toMatch(/member/i);

      // 4. Alice syncs; the response echoes the stored values.
      const synced = (await request(httpServer)
        .post(`/api/challenges/${challengeId}/steps`)
        .set('Authorization', `Bearer ${aliceToken}`)
        .send({ entries: [{ date: syncDate, steps: 5000 }] })
        .expect(200)) as unknown as SuperResponse<StepSyncResponseBody>;
      expect(synced.body).toEqual({
        entries: [{ date: syncDate, steps: 5000 }],
      });
      let rows = await countRows();
      expect(rows).toHaveLength(1);
      expect(rows[0].steps).toBe(5000);

      // 5. Repeating the EXACT same payload: still 200, still ONE row,
      //    stored value unchanged (constraint-guaranteed idempotency).
      const repeated = (await request(httpServer)
        .post(`/api/challenges/${challengeId}/steps`)
        .set('Authorization', `Bearer ${aliceToken}`)
        .send({ entries: [{ date: syncDate, steps: 5000 }] })
        .expect(200)) as unknown as SuperResponse<StepSyncResponseBody>;
      expect(repeated.body).toEqual(synced.body);
      rows = await countRows();
      expect(rows).toHaveLength(1);
      expect(rows[0].steps).toBe(5000);

      // 6. Different value for the same date: upsert updates the single row.
      const updated = (await request(httpServer)
        .post(`/api/challenges/${challengeId}/steps`)
        .set('Authorization', `Bearer ${aliceToken}`)
        .send({ entries: [{ date: syncDate, steps: 7000 }] })
        .expect(200)) as unknown as SuperResponse<StepSyncResponseBody>;
      expect(updated.body).toEqual({
        entries: [{ date: syncDate, steps: 7000 }],
      });
      rows = await countRows();
      expect(rows).toHaveLength(1);
      expect(rows[0].steps).toBe(7000);
    });

    it('rejects duplicate dates, impossible dates and steps overflow with 400', async () => {
      const carolEmail = `integration-steps-carol-${runId}@example.com`;
      const carol = (await request(httpServer)
        .post('/api/auth/register')
        .send({ name: 'Integration Steps Carol', email: carolEmail, password })
        .expect(201)) as unknown as SuperResponse<RegisterResponseBody>;
      const carolToken = carol.body.token;

      const created = (await request(httpServer)
        .post('/api/challenges')
        .set('Authorization', `Bearer ${carolToken}`)
        .send({
          name: `Integration Validation Challenge ${runId}`,
          type: 'step',
          startDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          endDate: new Date(Date.now() + 8 * 24 * 60 * 60 * 1000).toISOString(),
        })
        .expect(201)) as unknown as SuperResponse<ChallengeResponseBody>;
      const challengeId = created.body.challenge.id;

      const sync = (entries: { date: string; steps: number }[]) =>
        request(httpServer)
          .post(`/api/challenges/${challengeId}/steps`)
          .set('Authorization', `Bearer ${carolToken}`)
          .send({ entries });

      // Duplicate dates in one batch would hit the same ON CONFLICT target
      // twice in a single statement (Postgres cardinality error → 500) — the
      // service must reject them with 400 before reaching the store.
      const duplicate = (await sync([
        { date: '2026-09-10', steps: 5000 },
        { date: '2026-09-10', steps: 7000 },
      ]).expect(400)) as unknown as SuperResponse<ErrorMessageBody>;
      expect(duplicate.body.message).toMatch(/duplicate dates/i);

      // Impossible calendar date: valid for Postgres only after a 400 from
      // validation — the regex alone accepted it before the fix.
      const impossible = (await sync([
        { date: '2026-02-30', steps: 100 },
      ]).expect(400)) as unknown as SuperResponse<ErrorMessageBody>;
      expect(impossible.body.message).toEqual(expect.any(Array));

      // Steps overflow past the PostgreSQL int maximum.
      const overflow = (await sync([
        { date: '2026-09-10', steps: 2147483648 },
      ]).expect(400)) as unknown as SuperResponse<ErrorMessageBody>;
      expect(overflow.body.message).toEqual(expect.any(Array));

      // Boundary value is accepted and persisted.
      const boundary = (await sync([
        { date: '2026-09-10', steps: 2147483647 },
      ]).expect(200)) as unknown as SuperResponse<StepSyncResponseBody>;
      expect(boundary.body).toEqual({
        entries: [{ date: '2026-09-10', steps: 2147483647 }],
      });
    });

    it('refreshes syncedAt on conflict (upsert updates the timestamp)', async () => {
      const daveEmail = `integration-steps-dave-${runId}@example.com`;
      const dave = (await request(httpServer)
        .post('/api/auth/register')
        .send({ name: 'Integration Steps Dave', email: daveEmail, password })
        .expect(201)) as unknown as SuperResponse<RegisterResponseBody>;
      const daveToken = dave.body.token;

      const created = (await request(httpServer)
        .post('/api/challenges')
        .set('Authorization', `Bearer ${daveToken}`)
        .send({
          name: `Integration SyncedAt Challenge ${runId}`,
          type: 'step',
          startDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          endDate: new Date(Date.now() + 8 * 24 * 60 * 60 * 1000).toISOString(),
        })
        .expect(201)) as unknown as SuperResponse<ChallengeResponseBody>;
      const challengeId = created.body.challenge.id;
      const daveDomainId = Number(created.body.challenge.createdBy);

      const stepEntries = moduleRef.get<Repository<StepEntry>>(
        getRepositoryToken(StepEntry),
      );
      const syncDate = '2026-09-15';

      await request(httpServer)
        .post(`/api/challenges/${challengeId}/steps`)
        .set('Authorization', `Bearer ${daveToken}`)
        .send({ entries: [{ date: syncDate, steps: 3000 }] })
        .expect(200);

      // Force the stored timestamp into the clearly-past so the re-sync has
      // to move it forward — deterministic, no sleeps.
      const past = new Date('2020-01-01T00:00:00.000Z');
      await stepEntries.update(
        {
          userId: daveDomainId,
          challengeId: Number(challengeId),
          date: syncDate,
        },
        { syncedAt: past },
      );

      await request(httpServer)
        .post(`/api/challenges/${challengeId}/steps`)
        .set('Authorization', `Bearer ${daveToken}`)
        .send({ entries: [{ date: syncDate, steps: 4000 }] })
        .expect(200);

      const row = await stepEntries.findOneByOrFail({
        userId: daveDomainId,
        challengeId: Number(challengeId),
        date: syncDate,
      });
      expect(row.steps).toBe(4000);
      expect(row.syncedAt.getTime()).toBeGreaterThan(past.getTime());
    });

    it('ranks members on the daily leaderboard, with real user names and 403 for non-members', async () => {
      // 1. Owner (Alice) and member (Bob) register; a third user stays a
      //    non-member to prove the 403 on the leaderboard read.
      const aliceEmail = `integration-leaderboard-alice-${runId}@example.com`;
      const alice = (await request(httpServer)
        .post('/api/auth/register')
        .send({
          name: 'Integration Leaderboard Alice',
          email: aliceEmail,
          password,
        })
        .expect(201)) as unknown as SuperResponse<RegisterResponseBody>;
      const aliceToken = alice.body.token;

      const bobEmail = `integration-leaderboard-bob-${runId}@example.com`;
      const bob = (await request(httpServer)
        .post('/api/auth/register')
        .send({
          name: 'Integration Leaderboard Bob',
          email: bobEmail,
          password,
        })
        .expect(201)) as unknown as SuperResponse<RegisterResponseBody>;
      const bobToken = bob.body.token;

      const strangerEmail = `integration-leaderboard-stranger-${runId}@example.com`;
      const stranger = (await request(httpServer)
        .post('/api/auth/register')
        .send({
          name: 'Integration Leaderboard Stranger',
          email: strangerEmail,
          password,
        })
        .expect(201)) as unknown as SuperResponse<RegisterResponseBody>;
      const strangerToken = stranger.body.token;

      // 2. Alice creates the challenge and invites Bob, who joins.
      const created = (await request(httpServer)
        .post('/api/challenges')
        .set('Authorization', `Bearer ${aliceToken}`)
        .send({
          name: `Integration Leaderboard Challenge ${runId}`,
          type: 'step',
          startDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          endDate: new Date(Date.now() + 8 * 24 * 60 * 60 * 1000).toISOString(),
        })
        .expect(201)) as unknown as SuperResponse<ChallengeResponseBody>;
      const challengeId = created.body.challenge.id;
      const aliceDomainId = created.body.challenge.createdBy;

      const invite = (await request(httpServer)
        .post(`/api/challenges/${challengeId}/invites`)
        .set('Authorization', `Bearer ${aliceToken}`)
        .send({ inviteeEmail: bobEmail })
        .expect(201)) as unknown as SuperResponse<InviteResponseBody>;
      await request(httpServer)
        .post(`/api/challenges/${challengeId}/join`)
        .set('Authorization', `Bearer ${bobToken}`)
        .send({ inviteToken: invite.body.invite.token })
        .expect(200);

      // 3. Both sync steps for the same date — Bob walks more than Alice.
      const syncDate = '2026-09-16';
      await request(httpServer)
        .post(`/api/challenges/${challengeId}/steps`)
        .set('Authorization', `Bearer ${aliceToken}`)
        .send({ entries: [{ date: syncDate, steps: 4000 }] })
        .expect(200);
      await request(httpServer)
        .post(`/api/challenges/${challengeId}/steps`)
        .set('Authorization', `Bearer ${bobToken}`)
        .send({ entries: [{ date: syncDate, steps: 9000 }] })
        .expect(200);

      // 4. The non-member is rejected before any ranking happens.
      const forbidden = (await request(httpServer)
        .get(`/api/challenges/${challengeId}/leaderboard?date=${syncDate}`)
        .set('Authorization', `Bearer ${strangerToken}`)
        .expect(403)) as unknown as SuperResponse<ErrorMessageBody>;
      expect(forbidden.body.message).toMatch(/member/i);

      // 5. Alice reads the leaderboard: bare array, Bob first (rank 1), the
      //    names come from the domain user profile (proves the UserProfile
      //    INNER JOIN, not the auth session), and Alice's own entry is
      //    marked as the requester.
      const leaderboard = (await request(httpServer)
        .get(`/api/challenges/${challengeId}/leaderboard?date=${syncDate}`)
        .set('Authorization', `Bearer ${aliceToken}`)
        .expect(200)) as unknown as SuperResponse<LeaderboardEntryBody[]>;

      expect(leaderboard.body).toHaveLength(2);
      const [first, second] = leaderboard.body;
      // Bob walked more: rank 1. His userId is his own numeric domain id as
      // a string (not Alice's), the name comes from the domain user profile
      // (proves the UserProfile INNER JOIN, not the auth session), and he is
      // not the requester.
      expect(first).toMatchObject({
        name: 'Integration Leaderboard Bob',
        steps: 9000,
        rank: 1,
        isRequester: false,
      });
      expect(typeof first?.userId).toBe('string');
      expect(Number(first?.userId)).toBeGreaterThan(0);
      expect(first?.userId).not.toBe(String(aliceDomainId));
      expect(second).toEqual({
        userId: String(aliceDomainId),
        name: 'Integration Leaderboard Alice',
        steps: 4000,
        rank: 2,
        isRequester: true,
      });
    });

    it('serves the leaderboard cache-aside from Redis, with write-through on sync (issue #13, PR-B)', async () => {
      // 1. Alice (owner) + Bob (member) register and set up a challenge.
      const aliceEmail = `integration-cache-alice-${runId}@example.com`;
      const alice = (await request(httpServer)
        .post('/api/auth/register')
        .send({
          name: 'Integration Cache Alice',
          email: aliceEmail,
          password,
        })
        .expect(201)) as unknown as SuperResponse<RegisterResponseBody>;
      const aliceToken = alice.body.token;

      const bobEmail = `integration-cache-bob-${runId}@example.com`;
      const bob = (await request(httpServer)
        .post('/api/auth/register')
        .send({ name: 'Integration Cache Bob', email: bobEmail, password })
        .expect(201)) as unknown as SuperResponse<RegisterResponseBody>;
      const bobToken = bob.body.token;

      const created = (await request(httpServer)
        .post('/api/challenges')
        .set('Authorization', `Bearer ${aliceToken}`)
        .send({
          name: `Integration Cache Challenge ${runId}`,
          type: 'step',
          startDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          endDate: new Date(Date.now() + 8 * 24 * 60 * 60 * 1000).toISOString(),
        })
        .expect(201)) as unknown as SuperResponse<ChallengeResponseBody>;
      const challengeId = created.body.challenge.id;
      const aliceDomainId = Number(created.body.challenge.createdBy);

      const invite = (await request(httpServer)
        .post(`/api/challenges/${challengeId}/invites`)
        .set('Authorization', `Bearer ${aliceToken}`)
        .send({ inviteeEmail: bobEmail })
        .expect(201)) as unknown as SuperResponse<InviteResponseBody>;
      await request(httpServer)
        .post(`/api/challenges/${challengeId}/join`)
        .set('Authorization', `Bearer ${bobToken}`)
        .send({ inviteToken: invite.body.invite.token })
        .expect(200);

      // 2. Both sync steps for the same date — Bob ahead of Alice. The date is
      //    derived from the run (the same YYYY-MM-DD derivation the service
      //    uses for its default day) so the probe never goes stale as real
      //    time moves past a hardcoded literal.
      const syncDate = new Date().toISOString().slice(0, 10);
      await request(httpServer)
        .post(`/api/challenges/${challengeId}/steps`)
        .set('Authorization', `Bearer ${aliceToken}`)
        .send({ entries: [{ date: syncDate, steps: 4000 }] })
        .expect(200);
      await request(httpServer)
        .post(`/api/challenges/${challengeId}/steps`)
        .set('Authorization', `Bearer ${bobToken}`)
        .send({ entries: [{ date: syncDate, steps: 9000 }] })
        .expect(200);

      const zkey = `lb:${challengeId}:${syncDate}`;
      const mkey = `lb:meta:${challengeId}:${syncDate}`;

      const getLeaderboard = () =>
        request(httpServer)
          .get(`/api/challenges/${challengeId}/leaderboard?date=${syncDate}`)
          .set('Authorization', `Bearer ${aliceToken}`)
          .expect(200) as unknown as Promise<
          SuperResponse<LeaderboardEntryBody[]>
        >;

      // 3. First GET: cache miss → DB query → hydration. Second GET must be
      //    served from the freshly written Redis keys.
      const first = await getLeaderboard();
      expect(first.body[0]).toMatchObject({
        name: 'Integration Cache Bob',
        steps: 9000,
        rank: 1,
      });
      const second = await getLeaderboard();
      expect(second.body).toEqual(first.body);

      if (redisAvailable && testRedis) {
        // Hydration wrote both keys with the exact naming + 48h TTL.
        expect(await testRedis.exists(zkey)).toBe(1);
        expect(await testRedis.exists(mkey)).toBe(1);
        const ttl = await testRedis.ttl(zkey);
        expect(ttl).toBeGreaterThan(0);
        expect(ttl).toBeLessThanOrEqual(172800);
      }

      // 4. Mutate the DB behind the cache's back. With Redis reachable, the
      //    next GET must still return the CACHED value (proves the second
      //    read was a cache hit). The stale-read probe is gated on Redis for
      //    the same reason every other cache probe is: when Redis is down
      //    the app correctly falls through to the DB on every GET, so the
      //    probe would fail by design — the step-5 rehydration probe already
      //    proves the DB stays the source of truth when it runs.
      const stepEntries = moduleRef.get<Repository<StepEntry>>(
        getRepositoryToken(StepEntry),
      );
      await stepEntries.update(
        {
          userId: aliceDomainId,
          challengeId: Number(challengeId),
          date: syncDate,
        },
        { steps: 12000 },
      );
      if (redisAvailable && testRedis) {
        const cachedRead = await getLeaderboard();
        expect(
          cachedRead.body.find(
            (entry) => entry.name === 'Integration Cache Alice',
          ),
        ).toMatchObject({ steps: 4000, rank: 2 });
      }

      if (redisAvailable && testRedis) {
        // 5. Evict the keys: the next GET rehydrates from the DB (Alice's
        //    direct write now visible) — proving the DB stays the source of
        //    truth after a cache invalidation.
        await testRedis.del(zkey, mkey);
        const rehydrated = await getLeaderboard();
        const aliceEntry = rehydrated.body.find(
          (entry) => entry.name === 'Integration Cache Alice',
        );
        expect(aliceEntry).toMatchObject({ steps: 12000, rank: 1 });
        expect(rehydrated.body).toHaveLength(2);

        // 6. Write-through: Bob syncs MORE steps with the cache key present
        //    and NO eviction — the next GET reflects it immediately.
        await request(httpServer)
          .post(`/api/challenges/${challengeId}/steps`)
          .set('Authorization', `Bearer ${bobToken}`)
          .send({ entries: [{ date: syncDate, steps: 20000 }] })
          .expect(200);
        const afterWriteThrough = await getLeaderboard();
        expect(afterWriteThrough.body[0]).toMatchObject({
          name: 'Integration Cache Bob',
          steps: 20000,
          rank: 1,
        });
        expect(afterWriteThrough.body[1]).toMatchObject({
          name: 'Integration Cache Alice',
          steps: 12000,
          rank: 2,
        });

        // Cleanup: don't leave leaderboard keys behind in the dev Redis.
        await testRedis.del(zkey, mkey);
      }
      // Redis-down resilience (endpoint still 200 from DB) is covered by the
      // LeaderboardCache unit spec — the container is intentionally untouched.
    });
  },
);
