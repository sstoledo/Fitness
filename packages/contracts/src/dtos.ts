import { z } from "zod";

// ---------- Auth ----------

export const RegisterDtoSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1),
});
export type RegisterDto = z.infer<typeof RegisterDtoSchema>;

export const LoginDtoSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
export type LoginDto = z.infer<typeof LoginDtoSchema>;

// ---------- Challenges ----------

export const ChallengeTypeSchema = z.enum(["step", "run", "walk", "bike"]);
export type ChallengeType = z.infer<typeof ChallengeTypeSchema>;

export const ChallengeStatusSchema = z.enum(["pending", "active", "ended"]);
export type ChallengeStatus = z.infer<typeof ChallengeStatusSchema>;

export const ChallengeDtoSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: ChallengeTypeSchema,
  status: ChallengeStatusSchema,
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
  createdBy: z.string(),
  memberCount: z.number().int().nonnegative(),
});
export type ChallengeDto = z.infer<typeof ChallengeDtoSchema>;

export const CreateChallengeDtoSchema = z
  .object({
    name: z.string().min(1),
    type: ChallengeTypeSchema,
    startDate: z.string().datetime(),
    endDate: z.string().datetime(),
  })
  .refine((dto) => new Date(dto.endDate) > new Date(dto.startDate), {
    message: "endDate must be after startDate",
  });
export type CreateChallengeDto = z.infer<typeof CreateChallengeDtoSchema>;

// ---------- Steps / Leaderboard ----------

export const StepSyncBatchDtoSchema = z.object({
  entries: z
    .array(
      z.object({
        date: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD")
          // Round-trip check: rejects impossible calendar dates such as
          // 2026-02-30 or 2026-99-99 that the regex alone would accept.
          .refine((value) => {
            const [year, month, day] = value.split("-").map(Number);
            const parsed = new Date(Date.UTC(year, month - 1, day));
            return (
              parsed.getUTCFullYear() === year &&
              parsed.getUTCMonth() === month - 1 &&
              parsed.getUTCDate() === day
            );
          }, "date must be a real calendar date"),
        // 2147483647 is the PostgreSQL int maximum for the steps column.
        steps: z.number().int().nonnegative().max(2147483647),
      }),
    )
    // Duplicate dates within one batch would hit the same ON CONFLICT target
    // twice in a single statement (Postgres cardinality error) — reject early.
    .min(1)
    .superRefine((entries, ctx) => {
      const seen = new Set<string>();
      for (const entry of entries) {
        if (seen.has(entry.date)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Duplicate date '${entry.date}' in step sync batch.`,
          });
          return;
        }
        seen.add(entry.date);
      }
    }),
});
export type StepSyncBatchDto = z.infer<typeof StepSyncBatchDtoSchema>;

export const LeaderboardEntryDtoSchema = z.object({
  userId: z.string(),
  name: z.string(),
  steps: z.number().int().nonnegative(),
  rank: z.number().int().positive(),
});
export type LeaderboardEntryDto = z.infer<typeof LeaderboardEntryDtoSchema>;

// ---------- History / Stats ----------

export const ChallengeHistoryDtoSchema = z.object({
  challengeId: z.string(),
  name: z.string(),
  type: ChallengeTypeSchema,
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
  finalRank: z.number().int().positive(),
  totalSteps: z.number().int().nonnegative(),
});
export type ChallengeHistoryDto = z.infer<typeof ChallengeHistoryDtoSchema>;

export const UserStatsDtoSchema = z.object({
  userId: z.string(),
  challengesJoined: z.number().int().nonnegative(),
  challengesWon: z.number().int().nonnegative(),
  totalSteps: z.number().int().nonnegative(),
  totalDistanceKm: z.number().nonnegative(),
});
export type UserStatsDto = z.infer<typeof UserStatsDtoSchema>;
