import { StepSyncBatchDtoSchema } from '@fitness/contracts';

import { apiFetch, NetworkRequestError } from '@/lib/api';
import { getHealthProvider, todayLocalDate } from '@/lib/health';
import {
  clearPendingStepBatch,
  loadPendingStepBatch,
  savePendingStepBatch,
} from '@/lib/step-sync-storage';

/**
 * Step sync service (Cut 1, task #10).
 *
 * Reads today's steps from the health provider and uploads them as an
 * idempotent batch (`StepSyncBatchDto` from `@fitness/contracts`). The
 * steps/leaderboard backend lands in task #11; this client already honours
 * the contract so #12 only wires the leaderboard.
 *
 * ENDPOINT DECISION: the upload path follows docs/CUT-1-BACKEND.md (2.5/2.6),
 * `POST /api/challenges/:id/steps`, which is what the #11 backend tests will
 * implement. (The task brief mentioned `/api/steps/sync` — the doc path wins
 * because the backend RED tests for #11 are written against it; if #11
 * changes it, only `stepsEndpoint` below moves.)
 *
 * Offline contract: a batch that fails at the network level is kept in the
 * outbox (persisted, not just in memory) and `retryPendingStepSync()`
 * re-sends it on the next sync — the data survives app restarts. A server
 * rejection (4xx) is NOT retried: it is surfaced to the caller, because
 * retrying a refused payload can never succeed. 401s are handled globally
 * by `apiFetch` (session cleared, user sent back to login).
 */

export interface StepSyncEntry {
  /** Local calendar day, YYYY-MM-DD — the idempotency key. */
  date: string;
  steps: number;
}

export interface PendingStepBatch {
  challengeId: string;
  entries: StepSyncEntry[];
  attempts: number;
  lastError: string | null;
  updatedAt: string;
}

export type StepSyncOutcome =
  | { status: 'synced'; steps: number }
  /** The batch is safe in the outbox and will be retried on the next sync. */
  | { status: 'pending-sync'; steps: number }
  | { status: 'permission-denied' }
  | { status: 'unavailable' };

function stepsEndpoint(challengeId: string): string {
  return `/api/challenges/${encodeURIComponent(challengeId)}/steps`;
}

function totalSteps(entries: StepSyncEntry[]): number {
  return entries.reduce((sum, entry) => sum + entry.steps, 0);
}

async function uploadBatch(
  challengeId: string,
  entries: StepSyncEntry[],
): Promise<StepSyncOutcome> {
  const body = StepSyncBatchDtoSchema.parse({ entries });
  try {
    await apiFetch<unknown>(stepsEndpoint(challengeId), { method: 'POST', body });
    await clearPendingStepBatch();
    return { status: 'synced', steps: totalSteps(entries) };
  } catch (error) {
    if (error instanceof NetworkRequestError) {
      const previous = await loadPendingStepBatch<PendingStepBatch>();
      await savePendingStepBatch({
        challengeId,
        entries: body.entries,
        attempts: (previous?.attempts ?? 0) + 1,
        lastError: error.message,
        updatedAt: new Date().toISOString(),
      } satisfies PendingStepBatch);
      return { status: 'pending-sync', steps: totalSteps(entries) };
    }
    throw error;
  }
}

/**
 * Full sync for one challenge: health permission gate → read today's
 * steps → upload (or hold in the outbox). Trigger on challenge-detail open
 * and on pull-to-refresh (docs/CUT-1-MOBILE.md 3.2).
 */
export async function syncTodaySteps(challengeId: string): Promise<StepSyncOutcome> {
  const provider = getHealthProvider();
  const permission = await provider.getPermissionStatus();
  if (permission === 'unavailable') return { status: 'unavailable' };
  if (permission !== 'granted') return { status: 'permission-denied' };

  const steps = await provider.readTodaySteps();
  if (steps === null) return { status: 'unavailable' };

  return uploadBatch(challengeId, [{ date: todayLocalDate(), steps }]);
}

/**
 * Re-sends the batch held in the outbox, if any. Returns true when the
 * outbox is empty (nothing pending or the retry succeeded).
 */
export async function retryPendingStepSync(): Promise<boolean> {
  const pending = await loadPendingStepBatch<PendingStepBatch>();
  if (!pending) return true;
  try {
    await apiFetch<unknown>(stepsEndpoint(pending.challengeId), {
      method: 'POST',
      body: StepSyncBatchDtoSchema.parse({ entries: pending.entries }),
    });
    await clearPendingStepBatch();
    return true;
  } catch (error) {
    if (error instanceof NetworkRequestError) {
      await savePendingStepBatch({
        ...pending,
        attempts: pending.attempts + 1,
        lastError: error.message,
        updatedAt: new Date().toISOString(),
      });
      return false;
    }
    throw error;
  }
}

export async function getPendingStepBatch(): Promise<PendingStepBatch | null> {
  return loadPendingStepBatch<PendingStepBatch>();
}
