import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

/**
 * Outbox persistence for the step sync (Cut 1, task #10).
 *
 * When the steps upload fails at the network level, the batch is held here
 * and retried on the next sync — the data is never lost to a flaky
 * connection. Same storage trade-off as `session-storage.ts`: SecureStore
 * on native (a batch is well under its size limit), in-memory on web.
 */

const PENDING_BATCH_KEY = 'fitness.pending-step-batch';

const isPersistenceAvailable = Platform.OS !== 'web';

let inMemoryBatch: string | null = null;

export async function loadPendingStepBatch<T>(): Promise<T | null> {
  const raw = isPersistenceAvailable
    ? await SecureStore.getItemAsync(PENDING_BATCH_KEY).catch(() => null)
    : inMemoryBatch;
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function savePendingStepBatch(batch: unknown): Promise<void> {
  const raw = JSON.stringify(batch);
  if (!isPersistenceAvailable) {
    inMemoryBatch = raw;
    return;
  }
  await SecureStore.setItemAsync(PENDING_BATCH_KEY, raw).catch(() => {
    // Persistence failure must never block the sync flow.
  });
}

export async function clearPendingStepBatch(): Promise<void> {
  if (!isPersistenceAvailable) {
    inMemoryBatch = null;
    return;
  }
  await SecureStore.deleteItemAsync(PENDING_BATCH_KEY).catch(() => {
    // Already gone — nothing to clean up.
  });
}
