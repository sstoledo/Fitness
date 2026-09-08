import { ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AuthModule } from './auth.module';

/**
 * RED tests for the auth HTTP contract (Cut 1, task #3).
 *
 * The NestJS controller that exposes these routes does not exist yet — that
 * is intentional. These tests define the contract that the GREEN task (#5)
 * must satisfy when it wires better-auth into NestJS:
 *
 * - POST /api/auth/register → 201 { token, user } on success
 * - POST /api/auth/register → 409 when the email is already registered
 * - POST /api/auth/register → 400 on invalid email or password < 8 chars
 * - POST /api/auth/login    → 200 { token, user } on valid credentials
 * - POST /api/auth/login    → 401 with a generic message on bad credentials
 *
 * Until the controller exists every request falls through to the framework's
 * 404 handler, so these tests fail explicitly with 404 (no compile errors,
 * no database required). The app under test is built from AuthModule alone
 * on purpose: `pnpm --filter api test` must keep working without Postgres.
 */

// Unique per test run so the suite can be re-run against a real database
// once the GREEN task lands, without duplicate-email collisions.
const runId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const registered = {
  name: 'Test Runner',
  email: `runner-${runId}@example.com`,
  password: 'supersecret1',
};

describe('AuthController (e2e contract)', () => {
  let app: import('http').Server;
  let moduleRef: TestingModule;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [AuthModule],
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

  describe('POST /api/auth/register', () => {
    it('creates an account and returns 201 with a session token and user', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({ name: registered.name, email: registered.email, password: registered.password })
        .expect(201);

      expect(typeof response.body.token).toBe('string');
      expect(response.body.token.length).toBeGreaterThan(0);
      expect(response.body.user).toMatchObject({
        email: registered.email,
        name: registered.name,
      });
      expect(typeof response.body.user.id).toBe('string');
      expect(response.body.user.id.length).toBeGreaterThan(0);
    });

    it('rejects a duplicate email with 409', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({ name: 'Copy Cat', email: registered.email, password: 'anotherpass1' })
        .expect(409);

      expect(typeof response.body.message).toBe('string');
      expect(response.body.message.length).toBeGreaterThan(0);
    });

    it('rejects a password shorter than 8 characters with 400', async () => {
      await request(app)
        .post('/api/auth/register')
        .send({ name: 'Weak Pass', email: `weak-${runId}@example.com`, password: 'short1' })
        .expect(400);
    });

    it('rejects a malformed email with 400', async () => {
      await request(app)
        .post('/api/auth/register')
        .send({ name: 'Bad Email', email: 'not-an-email', password: 'supersecret1' })
        .expect(400);
    });
  });

  describe('POST /api/auth/login', () => {
    it('returns 200 with a session token and user for valid credentials', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({ email: registered.email, password: registered.password })
        .expect(200);

      expect(typeof response.body.token).toBe('string');
      expect(response.body.token.length).toBeGreaterThan(0);
      expect(response.body.user).toMatchObject({ email: registered.email });
    });

    it('returns 401 with a generic message for a wrong password', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({ email: registered.email, password: 'wrongpass99' })
        .expect(401);

      expect(typeof response.body.message).toBe('string');
      expect(response.body.message.length).toBeGreaterThan(0);
    });

    it('returns 401 with the same generic message for an unknown email', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({ email: `ghost-${runId}@example.com`, password: 'wrongpass99' })
        .expect(401);

      // The message must not reveal whether the email or the password failed.
      const wrongPassword = await request(app)
        .post('/api/auth/login')
        .send({ email: registered.email, password: 'wrongpass99' })
        .expect(401);

      expect(response.body.message).toBe(wrongPassword.body.message);
    });
  });
});
