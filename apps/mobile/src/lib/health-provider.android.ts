import {
  aggregateRecord,
  getGrantedPermissions,
  getSdkStatus,
  initialize,
  requestPermission as hcRequestPermission,
  SdkAvailabilityStatus,
} from 'react-native-health-connect';

import type { HealthPermissionStatus, HealthProvider } from './health';

/**
 * Android step reader backed by Health Connect (Cut 1, task #10).
 *
 * REQUIRES A DEV BUILD: `react-native-health-connect` is a native module
 * wired through its Expo config plugin (app.json → plugins) plus
 * expo-build-properties (compileSdk/targetSdk 36, minSdk 26) and the
 * `android.permission.health.READ_STEPS` manifest permission. None of this
 * exists in Expo Go or on web — run `npx expo prebuild` (or `run:android`)
 * before testing. The app.json plugin registers the permission-rationale
 * delegate on the native side.
 *
 * The user also needs the Health Connect app installed (Android 13 and
 * below) — `getSdkStatus` reports that as 'unavailable'.
 */

let initPromise: Promise<boolean> | null = null;

async function ensureInitialized(): Promise<boolean> {
  try {
    initPromise ??= initialize().catch(() => false);
    return await initPromise;
  } catch {
    return false;
  }
}

async function isSdkAvailable(): Promise<boolean> {
  try {
    return (await getSdkStatus()) === SdkAvailabilityStatus.SDK_AVAILABLE;
  } catch {
    return false;
  }
}

async function hasStepsReadPermission(): Promise<boolean> {
  const granted = await getGrantedPermissions();
  return granted.some((p) => p.recordType === 'Steps' && p.accessType === 'read');
}

/** Local midnight (device timezone) as an ISO string — start of "today". */
function localDayStartIso(): string {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
}

export const healthProvider: HealthProvider = {
  async getPermissionStatus(): Promise<HealthPermissionStatus> {
    if (!(await isSdkAvailable())) return 'unavailable';
    if (!(await ensureInitialized())) return 'unavailable';
    try {
      return (await hasStepsReadPermission()) ? 'granted' : 'denied';
    } catch {
      return 'unavailable';
    }
  },

  async requestPermission(): Promise<HealthPermissionStatus> {
    if (!(await isSdkAvailable())) return 'unavailable';
    if (!(await ensureInitialized())) return 'unavailable';
    try {
      const granted = await hcRequestPermission([
        { accessType: 'read', recordType: 'Steps' },
      ]);
      return granted.some((p) => p.recordType === 'Steps' && p.accessType === 'read')
        ? 'granted'
        : 'denied';
    } catch {
      return 'denied';
    }
  },

  async readTodaySteps(): Promise<number | null> {
    if ((await this.getPermissionStatus()) !== 'granted') return null;
    try {
      const result = await aggregateRecord({
        recordType: 'Steps',
        timeRangeFilter: {
          operator: 'between',
          startTime: localDayStartIso(),
          endTime: new Date().toISOString(),
        },
      });
      return result.COUNT_TOTAL ?? 0;
    } catch {
      return null;
    }
  },
};
