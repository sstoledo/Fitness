import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * Domain user profile (Cut 1, task #9).
 *
 * Auth itself is handled by better-auth in the separate authUser table; this
 * table is the domain profile that challenges reference via
 * FK. It is created here — additively, per docs/DATABASE.md — so the
 * challenge/membership/invite foreign keys have a real target.
 *
 * ID RECONCILIATION: better-auth uses opaque string ids while this profile
 * uses numeric ids. Domain rows are reconciled lazily at the challenges
 * guard via `DomainUserMapper` (find-or-create by unique email), so the
 * TypeORM store always receives numeric ids it can persist.
 */
@Entity('user')
export class UserProfile {
  @PrimaryGeneratedColumn('identity')
  id: number;

  @Index({ unique: true })
  @Column({ length: 255 })
  email: string;

  @Column({ length: 80 })
  name: string;

  // Nullable on purpose: better-auth owns credentials (hashed password) in
  // its own authAccount table; the domain profile only mirrors identity
  // fields, so a reconciled profile has no password hash to store. Migration
  // `1788307500000-UserProfilePasswordHashNullable` drops the NOT NULL.
  // Explicit `type: 'varchar'` mirrors the Invite.inviteeEmail pattern —
  // `string | null` reflects as Object under emitDecoratorMetadata.
  @Column({ type: 'varchar', length: 255, nullable: true })
  passwordHash: string | null;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  createdAt: Date;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  updatedAt: Date;
}
