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

/**
 * Membership entity (Cut 1, task #9).
 *
 * UNIQUE(userId, challengeId) enforces "a user joins a challenge only once"
 * at the database level; the 20-member cap is a service-level business rule
 * (per docs/DATABASE.md), not a CHECK constraint.
 */
@Entity('membership')
@Unique(['userId', 'challengeId'])
@Check(`"role" IN ('owner', 'member')`)
export class Membership {
  @PrimaryGeneratedColumn('identity')
  id: number;

  @Index()
  @Column({ type: 'int' })
  userId: number;

  @Index()
  @Column({ type: 'int' })
  challengeId: number;

  @Column({ length: 10, default: 'member' })
  role: string;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  joinedAt: Date;

  @ManyToOne('UserProfile', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: never;

  @ManyToOne('Challenge', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'challengeId' })
  challenge: never;
}
