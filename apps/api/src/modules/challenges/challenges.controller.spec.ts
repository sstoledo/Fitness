import { ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ChallengesModule } from './challenges.module';

/**
 * RED tests for the challenges HTTP contract (Cut 1, task #7).
 *
 * The NestJS controller that exposes these routes does not exist yet — that
 * is intentional. These tests define the contract that the GREEN task (#9)
 * must satisfy when it implements the challenges module:
 *
 * - POST /api/challenges          → 201 { challenge } with the creator as
 *                                   first member (memberCount === 1)
 * - POST /api/challenges          → 400 when endDate <= startDate
 * - POST /api/challenges/:id/join → 200 { challenge } for an invited user
 *                                   below capacity (bearer required)
 * - POST /api/challenges/:id/join → 401 without a session token
 * - POST /api/challenges/:id/join → 403 when the user is not invited
 * - POST /api/challenges/:id/join → 409 "challenge full" at 20 members
 *
 * The join body carries `{ inviteToken }` — the invite token created by the
 * creator (see design: `Invite` entity with unique token + inviteeEmail).
 *
 * Until the controller exists every request falls through to the framework's
 * 404 handler, so these tests fail explicitly with 404 (no compile errors,
 * no database required). The app under test is built from ChallengesModule
 * alone on purpose: `pnpm --filter api test` must keep working without
 * Postgres. Unique ids/tokens per test run keep the suite re-runnable once
 * the GREEN task lands.
 *
 * Note for the GREEN task (#9): the 403/409 scenarios assume seeded state
 * (an invite for a specific user; a challenge already at 20 members). Seed
 * that state in-memory or per-test — the contract assertions below must not
 * change.
 */

// Unique per test run so the suite can be re-run against the real module
// once the GREEN task lands, without id collisions.
const runId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const bearer = `Bearer red-test-${runId}`;

const validCreateBody = {
  name: `RED Challenge ${runId}`,
  type: 'step',
  startDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  endDate: new Date(Date.now() + 8 * 24 * 60 * 60 * 1000).toISOString(),
};

describe('ChallengesController (e2e contract)', () => {
  let app: import('http').Server;
  let moduleRef: TestingModule;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [ChallengesModule],
    }).compile();

    const nestApp = moduleRef.createNestApplication();
    // Mirror the global setup from main.ts so the tested surface matches
    // the production route layout and payload validation.
    nestApp.setGlobalPrefix('api');
    nestApp.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    );
    await nestApp.init();

    app = nestApp.getHttpServer();
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  describe('POST /api/challenges', () => {
    it('creates a challenge and returns 201 with the creator as first member', async () => {
      const response = await request(app)
        .post('/api/challenges')
        .set('Authorization', bearer)
        .send(validCreateBody)
        .expect(201);

      expect(response.body.challenge).toMatchObject({
        name: validCreateBody.name,
        type: validCreateBody.type,
        startDate: validCreateBody.startDate,
        endDate: validCreateBody.endDate,
      });
      expect(typeof response.body.challenge.id).toBe('string');
      expect(response.body.challenge.id.length).toBeGreaterThan(0);
      expect(typeof response.body.challenge.status).toBe('string');
      expect(response.body.challenge.status.length).toBeGreaterThan(0);
      expect(typeof response.body.challenge.createdBy).toBe('string');
      expect(response.body.challenge.createdBy.length).toBeGreaterThan(0);
      expect(response.body.challenge.memberCount).toBe(1);
    });

    it('rejects an end date not after the start date with 400', async () => {
      const startDate = validCreateBody.startDate;

      const response = await request(app)
        .post('/api/challenges')
        .set('Authorization', bearer)
        .send({ ...validCreateBody, name: `Bad Dates ${runId}`, endDate: startDate })
        .expect(400);

      expect(typeof response.body.message).toBe('string');
      expect(response.body.message.length).toBeGreaterThan(0);
    });
  });

  describe('POST /api/challenges/:id/join', () => {
    // GREEN task (#9): seed an invite for this token on a challenge below
    // capacity; the assertions below must hold for any invited user.
    const inviteeBearer = `Bearer red-invitee-${runId}`;
    const inviteToken = `invite-${runId}`;

    it('adds an invited user as a member and returns 200 with the challenge', async () => {
      const response = await request(app)
        .post(`/api/challenges/challenge-${runId}/join`)
        .set('Authorization', inviteeBearer)
        .send({ inviteToken })
        .expect(200);

      expect(response.body.challenge).toMatchObject({
        id: `challenge-${runId}`,
      });
    });

    it('rejects the join without a session token with 401', async () => {
      await request(app)
        .post(`/api/challenges/challenge-${runId}/join`)
        .send({ inviteToken })
        .expect(401);
    });

    it('rejects a join from a user without an invite with 403', async () => {
      const response = await request(app)
        .post(`/api/challenges/challenge-${runId}/join`)
        .set('Authorization', `Bearer red-stranger-${runId}`)
        .send({ inviteToken: `not-theirs-${runId}` })
        .expect(403);

      expect(typeof response.body.message).toBe('string');
      expect(response.body.message.length).toBeGreaterThan(0);
    });

    // GREEN task (#9): seed this challenge with exactly 20 members and an
    // invite for `fullInviteToken`; joining must be rejected with 409.
    it('rejects the join when the challenge already has 20 members with 409', async () => {
      const response = await request(app)
        .post(`/api/challenges/challenge-full-${runId}/join`)
        .set('Authorization', inviteeBearer)
        .send({ inviteToken: `full-${inviteToken}` })
        .expect(409);

      expect(typeof response.body.message).toBe('string');
      expect(response.body.message).toMatch(/full/i);
    });
  });
});
