import type { HealthPermissionStatus, HealthProvider } from './health';

/**
 * Dev-only health provider (Cut 1, task #10).
 *
 * Activated by EXPO_PUBLIC_USE_HEALTH_MOCKS=1 so the sync flow — permission
 * gate, empty state, batch upload, pending retry — can be exercised without
 * a physical device or a Health Connect installation.
 *
 * - EXPO_PUBLIC_HEALTH_MOCK_PERMISSION=denied starts the mock with the
 *   permission refused (drives the explanatory empty state). Any other
 *   value starts granted.
 * - Steps are simulated: a stable base derived from the minute of the day
 *   plus small jitter, so consecutive reads look alive without random
 *   test-breaking jumps.
 *
 * REMOVAL NOTE (task #11/#12): delete this file, the import in
 * `health.ts` and the two EXPO_PUBLIC_* flags.
 */

const START_DENIED = process.env.EXPO_PUBLIC_HEALTH_MOCK_PERMISSION === 'denied';

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Deterministic-ish believable step count for "today". */
function simulatedSteps(now: Date = new Date()): number {
  const minutesIntoDay = now.getHours() * 60 + now.getMinutes();
  const base = 4000 + minutesIntoDay * 6;
  const jitter = (now.getSeconds() % 7) * 13;
  return base + jitter;
}

let permission: HealthPermissionStatus = START_DENIED ? 'denied' : 'granted';
let grantedOnce = !START_DENIED;

export const mockHealthProvider: HealthProvider = {
  async getPermissionStatus(): Promise<HealthPermissionStatus> {
    await delay(200);
    return permission;
  },

  async requestPermission(): Promise<HealthPermissionStatus> {
    await delay(400);
    // First prompt is honoured; later prompts keep the current state so the
    // denied empty state can be re-tested without reinstalling.
    if (!grantedOnce) {
      permission = 'granted';
      grantedOnce = true;
    }
    return permission;
  },

  async readTodaySteps(): Promise<number | null> {
    await delay(250);
    return permission === 'granted' ? simulatedSteps() : null;
  },
};
