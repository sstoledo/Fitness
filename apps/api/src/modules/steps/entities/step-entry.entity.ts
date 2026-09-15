import {
  Check,
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';

/** Daily steps reference the numeric domain user, not the auth user. */
@Entity('stepEntry')
@Unique('stepEntry_user_challenge_date_uq', ['userId', 'challengeId', 'date'])
@Index('stepEntry_challengeId_date_idx', ['challengeId', 'date'])
@Check('stepEntry_steps_nonnegative_chk', '"steps" >= 0')
export class StepEntry {
  @PrimaryGeneratedColumn('identity', { primaryKeyConstraintName: 'stepEntry_pkey' })
  id: number;

  @Column({ type: 'int' })
  userId: number;

  @Column({ type: 'int' })
  challengeId: number;

  // PostgreSQL date is represented as a string to preserve the calendar day.
  @Column({ type: 'date' })
  date: string;

  @Column({ type: 'int' })
  steps: number;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  syncedAt: Date;

  @ManyToOne('UserProfile', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId', foreignKeyConstraintName: 'stepEntry_userId_fkey' })
  user: never;

  @ManyToOne('Challenge', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'challengeId', foreignKeyConstraintName: 'stepEntry_challengeId_fkey' })
  challenge: never;
}
