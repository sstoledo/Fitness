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
 * Invite entity (Cut 1, task #9).
 *
 * `inviteeEmail` is NULL for link/code invites (anyone with the token can
 * join), matching docs/DATABASE.md. Expired invites are rejected at join
 * time by comparing `expiresAt`.
 */
@Entity('invite')
@Check(`"status" IN ('pending', 'accepted', 'expired')`)
export class Invite {
  @PrimaryGeneratedColumn('identity')
  id: number;

  @Index()
  @Column({ type: 'int' })
  challengeId: number;

  @Column({ type: 'int' })
  inviterId: number;

  // Explicit `type` required: `string | null` reflects as Object under
  // emitDecoratorMetadata, and TypeORM would reject the inferred type.
  @Column({ type: 'varchar', length: 255, nullable: true })
  inviteeEmail: string | null;

  @Index({ unique: true })
  @Column({ length: 64 })
  token: string;

  @Column({ length: 10, default: 'pending' })
  status: string;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  createdAt: Date;

  @Column({ type: 'timestamptz' })
  expiresAt: Date;

  @ManyToOne('Challenge', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'challengeId' })
  challenge: never;
}
