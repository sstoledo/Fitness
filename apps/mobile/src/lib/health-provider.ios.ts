import type { HealthPermissionStatus, HealthProvider } from './health';

/**
 * iOS step reader — STUB (Cut 1, task #10).
 *
 * DECISION: docs/CUT-1-MOBILE.md names `@kingstinct/react-native-healthkit`
 * for iOS, but it is a bare native module without an Expo config plugin:
 * wiring it requires custom native code (HealthKit capability entitlement
 * plus AppDelegate set-up) that a config-plugin-only Expo workflow cannot
 * apply in SDK 57. Per the task brief, the Android flow ships functional
 * and iOS reports 'unavailable' honestly instead of pretending to read
 * data.
 *
 * TODO(task #11/#12 or the iOS milestone): replace this stub with a real
 * HealthKit adapter behind the same `HealthProvider` contract —
 * `useHealthProvider()` in `health.ts` needs no changes when that lands.
 */
export const healthProvider: HealthProvider = {
  async getPermissionStatus(): Promise<HealthPermissionStatus> {
    return 'unavailable';
  },
  async requestPermission(): Promise<HealthPermissionStatus> {
    return 'unavailable';
  },
  async readTodaySteps(): Promise<number | null> {
    return null;
  },
};
