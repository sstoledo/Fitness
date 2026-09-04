import { describe, expect, it } from "vitest";

import {
  ChallengeDtoSchema,
  CreateChallengeDtoSchema,
  LeaderboardEntryDtoSchema,
  LoginDtoSchema,
  RegisterDtoSchema,
  StepSyncBatchDtoSchema,
} from "./dtos";

describe("RegisterDtoSchema", () => {
  it("accepts a valid payload", () => {
    const result = RegisterDtoSchema.safeParse({
      email: "ada@example.com",
      password: "supersecret",
      name: "Ada",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid email and short password", () => {
    expect(
      RegisterDtoSchema.safeParse({
        email: "not-an-email",
        password: "short",
        name: "Ada",
      }).success,
    ).toBe(false);
  });
});

describe("LoginDtoSchema", () => {
  it("accepts a valid payload", () => {
    expect(
      LoginDtoSchema.safeParse({ email: "ada@example.com", password: "x" }).success,
    ).toBe(true);
  });

  it("rejects missing password", () => {
    expect(LoginDtoSchema.safeParse({ email: "ada@example.com" }).success).toBe(false);
  });
});

describe("ChallengeDtoSchema", () => {
  const valid = {
    id: "c1",
    name: "Spring Steps",
    type: "step",
    status: "active",
    startDate: "2026-09-01T00:00:00.000Z",
    endDate: "2026-09-07T00:00:00.000Z",
    createdBy: "u1",
    memberCount: 3,
  };

  it("accepts a valid payload", () => {
    expect(ChallengeDtoSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects unknown type", () => {
    expect(ChallengeDtoSchema.safeParse({ ...valid, type: "swim" }).success).toBe(false);
  });
});

describe("CreateChallengeDtoSchema", () => {
  it("accepts endDate after startDate", () => {
    expect(
      CreateChallengeDtoSchema.safeParse({
        name: "Run",
        type: "run",
        startDate: "2026-09-01T00:00:00.000Z",
        endDate: "2026-09-07T00:00:00.000Z",
      }).success,
    ).toBe(true);
  });

  it("rejects endDate before startDate", () => {
    expect(
      CreateChallengeDtoSchema.safeParse({
        name: "Run",
        type: "run",
        startDate: "2026-09-07T00:00:00.000Z",
        endDate: "2026-09-01T00:00:00.000Z",
      }).success,
    ).toBe(false);
  });
});

describe("StepSyncBatchDtoSchema", () => {
  it("accepts a valid batch", () => {
    expect(
      StepSyncBatchDtoSchema.safeParse({
        entries: [
          { date: "2026-09-01", steps: 1000 },
          { date: "2026-09-02", steps: 0 },
        ],
      }).success,
    ).toBe(true);
  });

  it("rejects malformed date, negative steps and empty batch", () => {
    expect(
      StepSyncBatchDtoSchema.safeParse({ entries: [{ date: "09/01/2026", steps: 1 }] }).success,
    ).toBe(false);
    expect(
      StepSyncBatchDtoSchema.safeParse({ entries: [{ date: "2026-09-01", steps: -5 }] }).success,
    ).toBe(false);
    expect(StepSyncBatchDtoSchema.safeParse({ entries: [] }).success).toBe(false);
  });
});

describe("LeaderboardEntryDtoSchema", () => {
  it("accepts a valid entry", () => {
    expect(
      LeaderboardEntryDtoSchema.safeParse({ userId: "u1", name: "Ada", steps: 1200, rank: 1 })
        .success,
    ).toBe(true);
  });

  it("rejects rank 0", () => {
    expect(
      LeaderboardEntryDtoSchema.safeParse({ userId: "u1", name: "Ada", steps: 1200, rank: 0 })
        .success,
    ).toBe(false);
  });
});
