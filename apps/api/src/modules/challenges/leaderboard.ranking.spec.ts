import { describe, expect, it } from 'vitest';
import { rankLeaderboard, type LeaderboardRow } from './leaderboard.ranking';

describe('rankLeaderboard', () => {
  it('returns an empty array for no rows', () => {
    expect(rankLeaderboard([])).toEqual([]);
  });

  it('ranks a single row as rank 1', () => {
    expect(
      rankLeaderboard([
        { userId: 'u1', name: 'One', steps: 42, joinedAt: 100 },
      ]),
    ).toEqual([
      { userId: 'u1', name: 'One', steps: 42, rank: 1, isRequester: false },
    ]);
  });

  it('orders rows by steps descending', () => {
    const rows: LeaderboardRow[] = [
      { userId: 'u1', name: 'One', steps: 100, joinedAt: 100 },
      { userId: 'u2', name: 'Two', steps: 300, joinedAt: 300 },
      { userId: 'u3', name: 'Three', steps: 200, joinedAt: 200 },
    ];
    expect(rankLeaderboard(rows).map((row) => row.userId)).toEqual([
      'u2',
      'u3',
      'u1',
    ]);
    expect(rankLeaderboard(rows).map((row) => row.rank)).toEqual([1, 2, 3]);
  });

  it('gives tied rows the same rank, ordered by earliest joinedAt', () => {
    const rows: LeaderboardRow[] = [
      { userId: 'u-late', name: 'Late', steps: 100, joinedAt: 500 },
      { userId: 'u-early', name: 'Early', steps: 100, joinedAt: 100 },
    ];
    const ranked = rankLeaderboard(rows);
    expect(ranked.map((row) => row.userId)).toEqual(['u-early', 'u-late']);
    expect(ranked.map((row) => row.rank)).toEqual([1, 1]);
  });

  it('skips ranks after a tie (1, 1, 3)', () => {
    const rows: LeaderboardRow[] = [
      { userId: 'u1', name: 'One', steps: 100, joinedAt: 100 },
      { userId: 'u2', name: 'Two', steps: 100, joinedAt: 200 },
      { userId: 'u3', name: 'Three', steps: 50, joinedAt: 300 },
    ];
    expect(rankLeaderboard(rows).map((row) => row.rank)).toEqual([1, 1, 3]);
  });

  it('accepts Date objects for joinedAt and is deterministic regardless of input order', () => {
    const rowsA: LeaderboardRow[] = [
      { userId: 'u1', name: 'One', steps: 100, joinedAt: new Date(100) },
      { userId: 'u2', name: 'Two', steps: 300, joinedAt: new Date(300) },
      { userId: 'u3', name: 'Three', steps: 200, joinedAt: new Date(200) },
    ];
    const rowsB = [...rowsA].reverse();
    expect(rankLeaderboard(rowsA)).toEqual(rankLeaderboard(rowsB));
  });

  it('breaks full ties (same steps AND joinedAt) by userId ascending, regardless of input order', () => {
    const rowsA: LeaderboardRow[] = [
      { userId: 'u-b', name: 'Bee', steps: 100, joinedAt: 500 },
      { userId: 'u-a', name: 'Aye', steps: 100, joinedAt: 500 },
      { userId: 'u-c', name: 'Cee', steps: 100, joinedAt: 500 },
    ];
    const rowsB = [...rowsA].reverse();
    expect(rankLeaderboard(rowsA).map((row) => row.userId)).toEqual([
      'u-a',
      'u-b',
      'u-c',
    ]);
    expect(rankLeaderboard(rowsB).map((row) => row.userId)).toEqual([
      'u-a',
      'u-b',
      'u-c',
    ]);
    expect(rankLeaderboard(rowsA)).toEqual(rankLeaderboard(rowsB));
  });

  it('marks only the requester entry with isRequester true', () => {
    const rows: LeaderboardRow[] = [
      { userId: 'u1', name: 'One', steps: 100, joinedAt: 100 },
      { userId: 'u2', name: 'Two', steps: 300, joinedAt: 200 },
    ];
    const ranked = rankLeaderboard(rows, 'u2');
    expect(ranked.map((row) => row.isRequester)).toEqual([true, false]);
    expect(ranked[0]).toMatchObject({ userId: 'u2', isRequester: true });
    expect(ranked[1]).toMatchObject({ userId: 'u1', isRequester: false });
    // Backward compatible: without a requester every entry is false.
    expect(rankLeaderboard(rows).map((row) => row.isRequester)).toEqual([
      false,
      false,
    ]);
  });

  it('does not mutate the input array', () => {
    const rows: LeaderboardRow[] = [
      { userId: 'u1', name: 'One', steps: 100, joinedAt: 100 },
      { userId: 'u2', name: 'Two', steps: 300, joinedAt: 200 },
    ];
    const snapshot = [...rows];
    rankLeaderboard(rows);
    expect(rows).toEqual(snapshot);
  });
});
