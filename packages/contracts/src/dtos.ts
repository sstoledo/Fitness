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
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD"),
        steps: z.number().int().nonnegative(),
      }),
    )
    .min(1),
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
