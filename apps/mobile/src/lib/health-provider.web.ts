import type { HealthPermissionStatus, HealthProvider } from './health';

/**
 * Web has no Health Connect / HealthKit equivalent in this product —
 * the sync card renders its explanatory unavailable state instead.
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
