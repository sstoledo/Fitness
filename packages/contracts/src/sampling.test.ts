import { describe, expect, it } from "vitest";

import {
  computeSamplingInterval,
  IDLE_GRACE_MS,
  IDLE_MAX_MS,
  IDLE_MIN_MS,
  MOVING_MAX_MS,
  MOVING_MIN_MS,
} from "./sampling";

const NOW = 1_788_547_200_000;

describe("computeSamplingInterval", () => {
  it("returns the moving band (3000-5000ms) while moving", () => {
    const interval = computeSamplingInterval({ speed: 2, lastMoveAt: NOW }, NOW);
    expect(interval).toBeGreaterThanOrEqual(MOVING_MIN_MS);
    expect(interval).toBeLessThanOrEqual(MOVING_MAX_MS);
  });

  it("shortens the interval at higher speed", () => {
    const slow = computeSamplingInterval({ speed: 1, lastMoveAt: NOW }, NOW);
    const fast = computeSamplingInterval({ speed: 15, lastMoveAt: NOW }, NOW);
    expect(fast).toBeLessThan(slow);
    expect(fast).toBe(MOVING_MIN_MS);
  });

  it("returns the idle band (30000-60000ms) when idle", () => {
    const interval = computeSamplingInterval(
      { speed: 0, lastMoveAt: NOW - IDLE_GRACE_MS - 1 },
      NOW,
    );
    expect(interval).toBeGreaterThanOrEqual(IDLE_MIN_MS);
    expect(interval).toBeLessThanOrEqual(IDLE_MAX_MS);
  });

  it("keeps the moving cadence during the idle grace period after stopping", () => {
    const interval = computeSamplingInterval(
      { speed: 0, lastMoveAt: NOW - IDLE_GRACE_MS + 1000 },
      NOW,
    );
    expect(interval).toBeLessThanOrEqual(MOVING_MAX_MS);
  });

  it("transitions from moving to idle band right after the grace period", () => {
    const during = computeSamplingInterval({ speed: 0, lastMoveAt: NOW - IDLE_GRACE_MS }, NOW);
    const after = computeSamplingInterval(
      { speed: 0, lastMoveAt: NOW - IDLE_GRACE_MS - 1 },
      NOW,
    );
    expect(during).toBeLessThanOrEqual(MOVING_MAX_MS);
    expect(after).toBeGreaterThanOrEqual(IDLE_MIN_MS);
  });

  it("widens the interval as idle time grows, capped at the idle max", () => {
    const recentIdle = computeSamplingInterval(
      { speed: 0, lastMoveAt: NOW - IDLE_GRACE_MS - 1000 },
      NOW,
    );
    const longIdle = computeSamplingInterval({ speed: 0, lastMoveAt: NOW - 60 * 60_000 }, NOW);
    expect(longIdle).toBeGreaterThan(recentIdle);
    expect(longIdle).toBe(IDLE_MAX_MS);
  });
});
