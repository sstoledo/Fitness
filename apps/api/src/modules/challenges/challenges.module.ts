import { Module } from '@nestjs/common';

/**
 * RED placeholder for the challenges module (Cut 1, task #7).
 *
 * Intentionally empty: the controller, service and entities land in the
 * GREEN task (#9). It exists so the RED contract tests in
 * `challenges.controller.spec.ts` can compile and run against an isolated
 * module without a database — every request currently falls through to the
 * framework's 404 handler, which is exactly the RED state the tests assert.
 *
 * Contract the GREEN task must satisfy (from
 * `openspec/changes/fitness-mvp/specs/step-challenges/spec.md`):
 * - POST /api/challenges            → 201 { challenge } (creator is first member)
 * - POST /api/challenges            → 400 when endDate is not after startDate
 * - POST /api/challenges/:id/join   → 200 { challenge } for an invited user
 * - POST /api/challenges/:id/join   → 403 when the user has no invite
 * - POST /api/challenges/:id/join   → 409 "challenge full" at 20 members
 */
@Module({})
export class ChallengesModule {}
