import { ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ChallengesModule } from './challenges.module';

/**
 * Contract tests for the steps sync endpoint (issue #12, docs
 * CUT-1-BACKEND.md 2.5/2.6):
 *
 * - POST /api/challenges/:id/steps → 200 { entries: [{ date, steps }] }
 *                                   → 401 without a session token
 *                                   -> 403 when the user is not a member
 *                                   → 400 on malformed payloads
 *
 * Idempotency proof: syncing the same (user, challenge, date) twice must
 * NOT create duplicates nor change the stored value; posting a different
 * value for the same date updates that single row (no duplicate). In the
 * memory flavour the "single row" property is the Map overwrite; the
 * constraint-guaranteed single row on Postgres is asserted in
 * challenges.typeorm.integration.spec.ts.
 *
 * The app under test is built from the plain ChallengesModule (memory
 * flavour) on purpose: `pnpm --filter api test` must keep working without
 * Postgres. Bearer tokens become the session user ids (isolated/test mode
 * of ChallengesAuthGuard). Unique ids/tokens per run keep the suite
 * re-runnable.
 */

// Unique per test run so the suite can be re-run without id collisions.
const runId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const ownerBearer = `Bearer steps-owner-${runId}`;
const memberBearer = `Bearer steps-member-${runId}`;

const validCreateBody = {
  name: `Steps Challenge ${runId}`,
  type: 'step',
  startDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  endDate: new Date(Date.now() + 8 * 24 * 60 * 60 * 1000).toISOString(),
};

// supertest types every response body as `any`; these shadow types keep the
// flow fully typed so the repo's no-unsafe-* lint rules stay green.
interface ChallengeResponseBody {
  challenge: { id: string };
}
interface InviteResponseBody {
  invite: { token: string };
}
interface StepSyncResponseBody {
  entries: { date: string; steps: number }[];
}
interface ErrorMessageBody {
  message: string | string[];
}
type SuperResponse<T> = { body: T };

describe('StepsController (e2e contract)', () => {
  let app: import('http').Server;
  let moduleRef: TestingModule;
  let challengeId: string;

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

    app = nestApp.getHttpServer() as import('http').Server;
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  describe('POST /api/challenges/:id/steps', () => {
    it('rejects the sync without a session token with 401', async () => {
      await request(app)
        .post(`/api/challenges/challenge-${runId}/steps`)
        .send({ entries: [{ date: '2026-09-10', steps: 100 }] })
        .expect(401);
    });

    it('rejects a non-member user with 403', async () => {
      // Owner creates the challenge (creator is the first member); the
      // member user has NOT joined yet, so the sync must be rejected.
      const created = (await request(app)
        .post('/api/challenges')
        .set('Authorization', ownerBearer)
        .send(validCreateBody)
        .expect(201)) as unknown as SuperResponse<ChallengeResponseBody>;
      challengeId = created.body.challenge.id;

      const response = (await request(app)
        .post(`/api/challenges/${challengeId}/steps`)
        .set('Authorization', memberBearer)
        .send({ entries: [{ date: '2026-09-10', steps: 100 }] })
        .expect(403)) as unknown as SuperResponse<ErrorMessageBody>;

      expect(response.body.message).toMatch(/member/i);
    });

    it('adds an invited user as a member and lets them sync steps with 200', async () => {
      // Owner invites the member user, who joins through the token.
      const invite = (await request(app)
        .post(`/api/challenges/${challengeId}/invites`)
        .set('Authorization', ownerBearer)
        .send({})
        .expect(201)) as unknown as SuperResponse<InviteResponseBody>;
      const inviteToken = invite.body.invite.token;

      await request(app)
        .post(`/api/challenges/${challengeId}/join`)
        .set('Authorization', memberBearer)
        .send({ inviteToken })
        .expect(200);

      const response = (await request(app)
        .post(`/api/challenges/${challengeId}/steps`)
        .set('Authorization', memberBearer)
        .send({ entries: [{ date: '2026-09-10', steps: 5000 }] })
        .expect(200)) as unknown as SuperResponse<StepSyncResponseBody>;

      expect(response.body).toEqual({
        entries: [{ date: '2026-09-10', steps: 5000 }],
      });
    });

    it('is idempotent: the same payload twice neither duplicates nor changes the value', async () => {
      const sync = () =>
        request(app)
          .post(`/api/challenges/${challengeId}/steps`)
          .set('Authorization', memberBearer)
          .send({ entries: [{ date: '2026-09-10', steps: 5000 }] })
          .expect(200);

      const first =
        (await sync()) as unknown as SuperResponse<StepSyncResponseBody>;
      const second =
        (await sync()) as unknown as SuperResponse<StepSyncResponseBody>;

      expect(first.body).toEqual({
        entries: [{ date: '2026-09-10', steps: 5000 }],
      });
      expect(second.body).toEqual(first.body);
    });

    it('updates the value for the same date without creating a duplicate', async () => {
      const response = (await request(app)
        .post(`/api/challenges/${challengeId}/steps`)
        .set('Authorization', memberBearer)
        .send({ entries: [{ date: '2026-09-10', steps: 7000 }] })
        .expect(200)) as unknown as SuperResponse<StepSyncResponseBody>;

      expect(response.body).toEqual({
        entries: [{ date: '2026-09-10', steps: 7000 }],
      });
    });

    it('rejects an empty entries array with 400', async () => {
      const response = (await request(app)
        .post(`/api/challenges/${challengeId}/steps`)
        .set('Authorization', memberBearer)
        .send({ entries: [] })
        .expect(400)) as unknown as SuperResponse<ErrorMessageBody>;

      expect(response.body.message).toEqual(expect.any(Array));
      expect(response.body.message.length).toBeGreaterThan(0);
    });

    it('rejects a malformed date with 400', async () => {
      const response = (await request(app)
        .post(`/api/challenges/${challengeId}/steps`)
        .set('Authorization', memberBearer)
        .send({ entries: [{ date: '09/01/2026', steps: 100 }] })
        .expect(400)) as unknown as SuperResponse<ErrorMessageBody>;

      expect(response.body.message).toEqual(expect.any(Array));
      expect(response.body.message.length).toBeGreaterThan(0);
    });

    it('rejects negative steps with 400', async () => {
      const response = (await request(app)
        .post(`/api/challenges/${challengeId}/steps`)
        .set('Authorization', memberBearer)
        .send({ entries: [{ date: '2026-09-10', steps: -5 }] })
        .expect(400)) as unknown as SuperResponse<ErrorMessageBody>;

      expect(response.body.message).toEqual(expect.any(Array));
      expect(response.body.message.length).toBeGreaterThan(0);
    });

    it('rejects non-integer steps with 400', async () => {
      const response = (await request(app)
        .post(`/api/challenges/${challengeId}/steps`)
        .set('Authorization', memberBearer)
        .send({ entries: [{ date: '2026-09-10', steps: 1.5 }] })
        .expect(400)) as unknown as SuperResponse<ErrorMessageBody>;

      expect(response.body.message).toEqual(expect.any(Array));
      expect(response.body.message.length).toBeGreaterThan(0);
    });

    it('rejects an unknown field with 400 (forbidNonWhitelisted)', async () => {
      const response = (await request(app)
        .post(`/api/challenges/${challengeId}/steps`)
        .set('Authorization', memberBearer)
        .send({ entries: [{ date: '2026-09-10', steps: 100 }], extra: true })
        .expect(400)) as unknown as SuperResponse<ErrorMessageBody>;

      expect(response.body.message).toEqual(expect.any(Array));
      expect(response.body.message.length).toBeGreaterThan(0);
    });

    it('syncs multiple dates in one batch with 200, all returned in input order', async () => {
      const response = (await request(app)
        .post(`/api/challenges/${challengeId}/steps`)
        .set('Authorization', memberBearer)
        .send({
          entries: [
            { date: '2026-09-11', steps: 1000 },
            { date: '2026-09-12', steps: 2000 },
            { date: '2026-09-13', steps: 3000 },
          ],
        })
        .expect(200)) as unknown as SuperResponse<StepSyncResponseBody>;

      expect(response.body.entries).toEqual([
        { date: '2026-09-11', steps: 1000 },
        { date: '2026-09-12', steps: 2000 },
        { date: '2026-09-13', steps: 3000 },
      ]);
    });

    it('rejects duplicate dates within one batch with 400', async () => {
      const response = (await request(app)
        .post(`/api/challenges/${challengeId}/steps`)
        .set('Authorization', memberBearer)
        .send({
          entries: [
            { date: '2026-09-10', steps: 5000 },
            { date: '2026-09-10', steps: 7000 },
          ],
        })
        .expect(400)) as unknown as SuperResponse<ErrorMessageBody>;

      expect(response.body.message).toMatch(/duplicate dates/i);
    });

    it('rejects impossible calendar dates with 400', async () => {
      for (const date of ['2026-02-30', '2026-99-99']) {
        const response = (await request(app)
          .post(`/api/challenges/${challengeId}/steps`)
          .set('Authorization', memberBearer)
          .send({ entries: [{ date, steps: 100 }] })
          .expect(400)) as unknown as SuperResponse<ErrorMessageBody>;

        expect(response.body.message).toEqual(expect.any(Array));
        expect(response.body.message.length).toBeGreaterThan(0);
      }
    });

    it('rejects steps above the PostgreSQL int max with 400', async () => {
      const response = (await request(app)
        .post(`/api/challenges/${challengeId}/steps`)
        .set('Authorization', memberBearer)
        .send({ entries: [{ date: '2026-09-10', steps: 2147483648 }] })
        .expect(400)) as unknown as SuperResponse<ErrorMessageBody>;

      expect(response.body.message).toEqual(expect.any(Array));
      expect(response.body.message.length).toBeGreaterThan(0);
    });

    it('accepts steps at the PostgreSQL int boundary with 200', async () => {
      const response = (await request(app)
        .post(`/api/challenges/${challengeId}/steps`)
        .set('Authorization', memberBearer)
        .send({ entries: [{ date: '2026-09-14', steps: 2147483647 }] })
        .expect(200)) as unknown as SuperResponse<StepSyncResponseBody>;

      expect(response.body).toEqual({
        entries: [{ date: '2026-09-14', steps: 2147483647 }],
      });
    });
  });
});
