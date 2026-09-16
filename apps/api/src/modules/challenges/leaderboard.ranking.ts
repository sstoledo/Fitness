/**
 * Shared daily-leaderboard ranking (issue #13, PR-A).
 *
 * Pure function, no NestJS/TypeORM dependencies, so both persistence
 * flavours (memory + TypeORM) rank identically and the rules are unit-testable
 * in isolation. This file is the single home of the leaderboard row/entry
 * types; `challenges.store.ts` re-exports `LeaderboardEntryRecord`.
 *
 * Ranking semantics: SQL RANK() — ties share the same rank and the next rank
 * skips (e.g. steps [100, 100, 50] → ranks [1, 1, 3]). Ties are ordered by
 * earliest `joinedAt` (ms epoch or Date), then by ascending `userId`, so the
 * output is deterministic regardless of input order. The input array is
 * never mutated.
 */

/** One participant row before ranking, produced by a store query. */
export interface LeaderboardRow {
  userId: string;
  name: string;
  steps: number;
  joinedAt: Date | number; // ms epoch or Date — ties break by earliest join
}

/** Wire shape of `LeaderboardEntryDto` from `@fitness/contracts`. */
export interface LeaderboardEntryRecord {
  userId: string;
  name: string;
  steps: number;
  rank: number;
  /** True only for the row whose `userId` matches the requester (if any). */
  isRequester: boolean;
}

function joinedAtMs(joinedAt: Date | number): number {
  return joinedAt instanceof Date ? joinedAt.getTime() : joinedAt;
}

/**
 * Ranks leaderboard rows with SQL RANK() semantics and marks the requester's
 * entry (`isRequester: true`) when `requesterUserId` is given. Backward
 * compatible: without a requester, every entry has `isRequester: false`.
 */
export function rankLeaderboard(
  rows: LeaderboardRow[],
  requesterUserId?: string,
): LeaderboardEntryRecord[] {
  // Sort a copy — the caller's array must never be mutated. Steps DESC, then
  // earliest joiner first within a tie, then userId ascending so a full tie
  // (same steps AND same joinedAt) is deterministic regardless of input order.
  const sorted = [...rows].sort((a, b) => {
    if (b.steps !== a.steps) return b.steps - a.steps;
    if (joinedAtMs(a.joinedAt) !== joinedAtMs(b.joinedAt))
      return joinedAtMs(a.joinedAt) - joinedAtMs(b.joinedAt);
    return a.userId.localeCompare(b.userId);
  });

  // RANK() semantics: same steps as the previous sorted row share its rank.
  let previousRank = 0;
  let previousSteps = Number.NaN;
  return sorted.map((row, index) => {
    const rank = row.steps === previousSteps ? previousRank : index + 1;
    previousRank = rank;
    previousSteps = row.steps;
    return {
      userId: row.userId,
      name: row.name,
      steps: row.steps,
      rank,
      isRequester: row.userId === requesterUserId,
    };
  });
}
