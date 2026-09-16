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
 * earliest `joinedAt` (ms epoch or Date) so the output is deterministic
 * regardless of input order. The input array is never mutated.
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
}

function joinedAtMs(joinedAt: Date | number): number {
  return joinedAt instanceof Date ? joinedAt.getTime() : joinedAt;
}

export function rankLeaderboard(
  rows: LeaderboardRow[],
): LeaderboardEntryRecord[] {
  // Sort a copy — the caller's array must never be mutated. Steps DESC, then
  // earliest joiner first within a tie.
  const sorted = [...rows].sort((a, b) => {
    if (b.steps !== a.steps) return b.steps - a.steps;
    return joinedAtMs(a.joinedAt) - joinedAtMs(b.joinedAt);
  });

  // RANK() semantics: same steps as the previous sorted row share its rank.
  let previousRank = 0;
  let previousSteps = Number.NaN;
  return sorted.map((row, index) => {
    const rank = row.steps === previousSteps ? previousRank : index + 1;
    previousRank = rank;
    previousSteps = row.steps;
    return { userId: row.userId, name: row.name, steps: row.steps, rank };
  });
}
