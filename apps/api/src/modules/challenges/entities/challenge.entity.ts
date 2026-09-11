import {
  Check,
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * Challenge entity (Cut 1, task #9 — GREEN challenges).
 *
 * Schema follows `docs/DATABASE.md`. One deliberate deviation: DATABASE.md
 * documents `startDate`/`endDate` as `date`, but the API contract
 * (`ChallengeDtoSchema` in `@fitness/contracts` and the RED contract tests)
 * round-trips full ISO-8601 datetimes. The columns are therefore
 * `timestamptz`; promote to plain `date` only if the contract changes.
 *
 * Status starts as `pending` and is derived from the date window by clients;
 * lifecycle transitions land with the steps/leaderboard work.
 */
@Entity('challenge')
@Check(`"type" IN ('step', 'run', 'walk', 'bike')`)
@Check(`"status" IN ('pending', 'active', 'ended')`)
@Check(`"endDate" > "startDate"`)
export class Challenge {
  @PrimaryGeneratedColumn('identity')
  id: number;

  @Column({ length: 120 })
  name: string;

  @Column({ length: 10 })
  type: string;

  @Column({ length: 10, default: 'pending' })
  status: string;

  @Column({ type: 'timestamptz' })
  startDate: Date;

  @Column({ type: 'timestamptz' })
  endDate: Date;

  /**
   * References the domain `user` profile table. NOTE: auth is still backed
   * by the better-auth memory adapter (task #5), whose user ids are opaque
   * strings — the TypeORM store maps them with `Number(userId)` until the
   * auth database reconciliation task lands. See challenges.typeorm.store.ts.
   */
  @Index()
  @Column({ type: 'int' })
  createdById: number;

  @ManyToOne('UserProfile', { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'createdById' })
  createdBy: never;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  createdAt: Date;
}
