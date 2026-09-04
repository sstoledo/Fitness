/**
 * Pure adaptive GPS sampling interval for background location updates.
 *
 * Moving: 3000-5000ms (faster movement -> tighter cadence).
 * Idle:   30000-60000ms (longer idle -> looser cadence).
 */

export interface SamplingState {
  /** Current speed in m/s. */
  speed: number;
  /** Epoch ms of the last detected movement. */
  lastMoveAt: number;
}

export const MOVE_SPEED_THRESHOLD_MPS = 0.5;
export const IDLE_GRACE_MS = 30_000;
const IDLE_RAMP_MS = 10 * 60_000;

export const MOVING_MIN_MS = 3_000;
export const MOVING_MAX_MS = 5_000;
export const IDLE_MIN_MS = 30_000;
export const IDLE_MAX_MS = 60_000;

export function computeSamplingInterval(
  state: SamplingState,
  now: number = Date.now(),
): number {
  const { speed, lastMoveAt } = state;
  const idleFor = Math.max(0, now - lastMoveAt);
  const moving = speed >= MOVE_SPEED_THRESHOLD_MPS || idleFor <= IDLE_GRACE_MS;

  if (moving) {
    // Higher speed shortens the interval within the moving band.
    const factor = Math.min(1, Math.max(0, speed) / 10);
    const interval = MOVING_MAX_MS - factor * (MOVING_MAX_MS - MOVING_MIN_MS);
    return Math.round(clamp(interval, MOVING_MIN_MS, MOVING_MAX_MS));
  }

  // Longer idle time widens the interval within the idle band.
  const factor = Math.min(1, idleFor / IDLE_RAMP_MS);
  const interval = IDLE_MIN_MS + factor * (IDLE_MAX_MS - IDLE_MIN_MS);
  return Math.round(clamp(interval, IDLE_MIN_MS, IDLE_MAX_MS));
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
