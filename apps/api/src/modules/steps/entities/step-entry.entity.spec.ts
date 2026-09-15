import 'reflect-metadata';
import { getMetadataArgsStorage } from 'typeorm';
import { describe, expect, it } from 'vitest';
import { StepEntry } from './step-entry.entity';
import { StepEntrySchema1788307600000 } from '../../../migrations/1788307600000-StepEntrySchema';

const normalizeSql = (sql: string) => sql.replace(/\s+/g, ' ').trim();

describe('StepEntry schema contract', () => {
  const storage = getMetadataArgsStorage();

  it('describes the exact persistence metadata', () => {
    const table = storage.tables.find((metadata) => metadata.target === StepEntry);
    expect(table?.name).toBe('stepEntry');

    const columns = storage.columns.filter((metadata) => metadata.target === StepEntry);
    expect(columns.map((metadata) => metadata.propertyName)).toEqual([
      'id',
      'userId',
      'challengeId',
      'date',
      'steps',
      'syncedAt',
    ]);
    expect(columns.find((metadata) => metadata.propertyName === 'id')?.options.primary).toBe(true);
    expect(storage.generations.find((metadata) => metadata.target === StepEntry && metadata.propertyName === 'id')?.strategy).toBe('identity');
    expect(columns.filter((metadata) => ['userId', 'challengeId', 'date', 'steps'].includes(metadata.propertyName)).every((metadata) => metadata.options.nullable !== true)).toBe(true);
    expect(columns.find((metadata) => metadata.propertyName === 'date')?.options.type).toBe('date');
    expect(columns.find((metadata) => metadata.propertyName === 'steps')?.options.type).toBe('int');
    const syncedAt = columns.find((metadata) => metadata.propertyName === 'syncedAt');
    expect(syncedAt?.options.type).toBe('timestamptz');
    expect((syncedAt?.options.default as () => string)()).toBe('now()');

    const unique = storage.uniques.find((metadata) => metadata.target === StepEntry);
    expect(unique).toMatchObject({
      name: 'stepEntry_user_challenge_date_uq',
      columns: ['userId', 'challengeId', 'date'],
    });
    const index = storage.indices.find((metadata) => metadata.target === StepEntry);
    expect(index).toMatchObject({
      name: 'stepEntry_challengeId_date_idx',
      columns: ['challengeId', 'date'],
    });
    expect((index as { options?: { unique?: boolean } } | undefined)?.options?.unique).not.toBe(true);
    expect(storage.checks.find((metadata) => metadata.target === StepEntry)).toMatchObject({
      name: 'stepEntry_steps_nonnegative_chk',
      expression: '"steps" >= 0',
    });

    const relations = storage.relations.filter((metadata) => metadata.target === StepEntry);
    expect(relations).toEqual(expect.arrayContaining([
      expect.objectContaining({ propertyName: 'user', relationType: 'many-to-one', options: { onDelete: 'CASCADE' } }),
      expect.objectContaining({ propertyName: 'challenge', relationType: 'many-to-one', options: { onDelete: 'CASCADE' } }),
    ]));
    const joinColumns = storage.joinColumns.filter((metadata) => metadata.target === StepEntry);
    expect(joinColumns).toEqual(expect.arrayContaining([
      expect.objectContaining({ propertyName: 'user', name: 'userId', foreignKeyConstraintName: 'stepEntry_userId_fkey' }),
      expect.objectContaining({ propertyName: 'challenge', name: 'challengeId', foreignKeyConstraintName: 'stepEntry_challengeId_fkey' }),
    ]));
  });

  it('creates the table before its secondary index', async () => {
    const queries: string[] = [];
    const queryRunner = { query: async (sql: string) => { queries.push(sql); return []; } } as never;

    await new StepEntrySchema1788307600000().up(queryRunner);

    expect(queries).toHaveLength(2);
    expect(normalizeSql(queries[0])).toContain('CREATE TABLE "stepEntry"');
    expect(normalizeSql(queries[0])).toContain('"id" int GENERATED ALWAYS AS IDENTITY');
    expect(normalizeSql(queries[0])).toContain('"userId" int NOT NULL');
    expect(normalizeSql(queries[0])).toContain('"challengeId" int NOT NULL');
    expect(normalizeSql(queries[0])).toContain('"date" date NOT NULL');
    expect(normalizeSql(queries[0])).toContain('"steps" int NOT NULL');
    expect(normalizeSql(queries[0])).toContain('"syncedAt" timestamptz NOT NULL DEFAULT now()');
    expect(normalizeSql(queries[0])).toContain('CONSTRAINT "stepEntry_pkey" PRIMARY KEY ("id")');
    expect(normalizeSql(queries[0])).toContain('CONSTRAINT "stepEntry_user_challenge_date_uq" UNIQUE ("userId", "challengeId", "date")');
    expect(normalizeSql(queries[0])).toContain('CONSTRAINT "stepEntry_steps_nonnegative_chk" CHECK ("steps" >= 0)');
    expect(normalizeSql(queries[0])).toContain('CONSTRAINT "stepEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE');
    expect(normalizeSql(queries[0])).toContain('CONSTRAINT "stepEntry_challengeId_fkey" FOREIGN KEY ("challengeId") REFERENCES "challenge"("id") ON DELETE CASCADE');
    expect(normalizeSql(queries[1])).toBe('CREATE INDEX "stepEntry_challengeId_date_idx" ON "stepEntry" ("challengeId", "date")');
  });

  it('drops only the stepEntry table on rollback', async () => {
    const queries: string[] = [];
    const queryRunner = { query: async (sql: string) => { queries.push(sql); return []; } } as never;

    await new StepEntrySchema1788307600000().down(queryRunner);

    expect(queries).toEqual(['DROP TABLE IF EXISTS "stepEntry"']);
  });
});
