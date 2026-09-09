import { ChallengeDtoSchema, type ChallengeDto, type CreateChallengeDto } from '@fitness/contracts';

import { apiFetch, ApiRequestError } from '@/lib/api';

/**
 * Challenges API client (Cut 1, task #6).
 *
 * Backend endpoints do NOT exist yet — they land in task #9 (GREEN challenges).
 * Until then the real calls fail with 404/network errors and the screens show
 * the error state with retry. For UI development only, a local mock fallback
 * can be enabled with EXPO_PUBLIC_USE_CHALLENGE_MOCKS=1 in apps/mobile/.env:
 * the query/mutation functions below short-circuit to in-memory data so the
 * list and create flows can be exercised without the backend.
 *
 * REMOVAL NOTE (task #9): delete MOCK_CHALLENGES, the delay() helper and every
 * `if (USE_MOCK_CHALLENGES)` branch in this file, plus the env flag.
 *
 * Contract agreed for task #9:
 * - GET  /api/challenges              → 200 { challenges: ChallengeDto[] }
 * - POST /api/challenges              → 201 { challenge: ChallengeDto }
 * - POST /api/challenges/:id/join     → 200 { challenge: ChallengeDto }
 *     body: { inviteToken: string } (bearer required)
 *     → 401 without a session token (handled globally by apiFetch)
 *     → 403 when the user has no invite for this challenge
 *     → 409 when the challenge already has 20 members
 *
 * Deep-link format for the join screen (Cut 1, task #8):
 * /challenges/join?challengeId=<id>&token=<inviteToken>
 */

const USE_MOCK_CHALLENGES = process.env.EXPO_PUBLIC_USE_CHALLENGE_MOCKS === '1';

interface ChallengeListResponse {
  challenges: unknown[];
}

interface ChallengeResponse {
  challenge: unknown;
}

function parseChallenge(data: unknown): ChallengeDto {
  const result = ChallengeDtoSchema.safeParse(data);
  if (!result.success) {
    throw new ApiRequestError(502, 'Unexpected server response.');
  }
  return result.data;
}

export async function listChallenges(): Promise<ChallengeDto[]> {
  if (USE_MOCK_CHALLENGES) {
    await delay(400);
    return MOCK_CHALLENGES;
  }
  const data = await apiFetch<ChallengeListResponse>('/api/challenges');
  return (data.challenges ?? []).map(parseChallenge);
}

export async function createChallenge(input: CreateChallengeDto): Promise<ChallengeDto> {
  if (USE_MOCK_CHALLENGES) {
    await delay(400);
    const challenge: ChallengeDto = {
      id: `mock-${Date.now()}`,
      name: input.name,
      type: input.type,
      status: 'pending',
      startDate: input.startDate,
      endDate: input.endDate,
      createdBy: 'me',
      memberCount: 1,
    };
    MOCK_CHALLENGES.unshift(challenge);
    return challenge;
  }
  const data = await apiFetch<ChallengeResponse>('/api/challenges', { method: 'POST', body: input });
  return parseChallenge(data.challenge);
}

/**
 * Joins a challenge with an invite token (Cut 1, task #8). The backend
 * endpoint lands in task #9; until then the real call fails with 404 and
 * the join screen surfaces the error state. With
 * EXPO_PUBLIC_USE_CHALLENGE_MOCKS=1 the join is simulated in memory so the
 * flow can be exercised in dev:
 * - any token joins successfully (memberCount increments) unless
 * - the token is the literal `invalid`, which simulates 403 not invited, or
 * - the challenge already has 20 members, which simulates 409 full.
 */
export async function joinChallenge(challengeId: string, inviteToken: string): Promise<ChallengeDto> {
  if (USE_MOCK_CHALLENGES) {
    await delay(400);
    const challenge = MOCK_CHALLENGES.find((item) => item.id === challengeId);
    if (!challenge) {
      throw new ApiRequestError(404, 'Challenge not found.');
    }
    if (inviteToken === 'invalid') {
      throw new ApiRequestError(403, 'You are not invited to this challenge.');
    }
    if (challenge.memberCount >= 20) {
      throw new ApiRequestError(409, 'This challenge is full.');
    }
    challenge.memberCount += 1;
    return challenge;
  }
  const data = await apiFetch<ChallengeResponse>(
    `/api/challenges/${encodeURIComponent(challengeId)}/join`,
    { method: 'POST', body: { inviteToken } },
  );
  return parseChallenge(data.challenge);
}

// ---------- Dev-only mock data (see REMOVAL NOTE above) ----------

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isoDaysFromNow(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString();
}

const MOCK_CHALLENGES: ChallengeDto[] = [
  {
    id: 'mock-1',
    name: 'Morning Steps Crew',
    type: 'step',
    status: 'active',
    startDate: isoDaysFromNow(-3),
    endDate: isoDaysFromNow(11),
    createdBy: 'me',
    memberCount: 5,
  },
  {
    id: 'mock-2',
    name: 'Weekend Warrior Walk',
    type: 'walk',
    status: 'pending',
    startDate: isoDaysFromNow(2),
    endDate: isoDaysFromNow(9),
    createdBy: 'me',
    memberCount: 2,
  },
  {
    id: 'mock-3',
    name: 'September Sprint',
    type: 'run',
    status: 'ended',
    startDate: isoDaysFromNow(-20),
    endDate: isoDaysFromNow(-6),
    createdBy: 'me',
    memberCount: 8,
  },
];
