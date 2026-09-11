import { Platform } from 'react-native';

import { mockHealthProvider } from '@/lib/health-mock';

/**
 * Health data service contract (Cut 1, task #10 — health sync).
 *
 * Internal abstraction the step-sync flow talks to. Platform adapters live
 * in sibling files:
 *
 * - `health-provider.android.ts` — Health Connect via
 *   `react-native-health-connect` (functional; requires a dev build with
 *   prebuild — the native module does not exist in Expo Go or on web).
 * - `health-provider.ios.ts` — typed stub (see the DECISION note in that
 *   file: no Expo-compatible HealthKit module in SDK 57; iOS returns
 *   'unavailable' honestly until a real adapter lands).
 * - `health-provider.web.ts` — 'unavailable'.
 *
 * Dev mock: set EXPO_PUBLIC_USE_HEALTH_MOCKS=1 in apps/mobile/.env to
 * exercise the whole flow (simulated steps + permission) without a physical
 * device. Set EXPO_PUBLIC_HEALTH_MOCK_PERMISSION=denied to simulate a
 * denied permission and the explanatory empty state.
 *
 * REMOVAL NOTE (task #11/#12, once the steps backend + leaderboard ship):
 * delete `health-mock.ts` and every mock branch/flag in this file.
 */

export type HealthPermissionStatus = 'granted' | 'denied' | 'unavailable';

export interface HealthProvider {
  /**
   * Current permission state. 'denied' covers both "not asked yet" and
   * "refused": on Android the two are indistinguishable, and re-prompting
   * is always safe (the system decides whether to show the dialog).
   */
  getPermissionStatus(): Promise<HealthPermissionStatus>;
  /** Asks the user for step-read permission; resolves to the new status. */
  requestPermission(): Promise<HealthPermissionStatus>;
  /**
   * Total steps for the device's local day, or null when the count cannot
   * be read (permission missing, provider unavailable, read error).
   */
  readTodaySteps(): Promise<number | null>;
}

const USE_MOCK_HEALTH = process.env.EXPO_PUBLIC_USE_HEALTH_MOCKS === '1';

let provider: HealthProvider | null = null;

/** Singleton accessor — the provider is stateless aside from init caching. */
export function getHealthProvider(): HealthProvider {
  if (provider) return provider;
  if (USE_MOCK_HEALTH) {
    provider = mockHealthProvider;
    return provider;
  }
  // Metro resolves `health-provider` per platform: `.web.ts` on web, the
  // plain `.ts` (native dispatcher) on Android/iOS.
  provider = Platform.OS === 'web' ? requireWebProvider() : requireNativeProvider();
  return provider;
}

function requireNativeProvider(): HealthProvider {
  if (Platform.OS === 'android') {
    // Lazy require keeps the Health Connect native module out of the iOS
    // bundle (Metro would otherwise follow the static import).
    return require('./health-provider.android').healthProvider as HealthProvider;
  }
  return require('./health-provider.ios').healthProvider as HealthProvider;
}

function requireWebProvider(): HealthProvider {
  return require('./health-provider.web').healthProvider as HealthProvider;
}

/** Local calendar day as YYYY-MM-DD — the `StepSyncBatchDto` entry key. */
export function todayLocalDate(now: Date = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
