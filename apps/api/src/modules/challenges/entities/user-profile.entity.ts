import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * Domain user profile (Cut 1, task #9).
 *
 * Auth itself is handled by better-auth (currently on its memory adapter,
 * task #5); this table is the domain profile that challenges reference via
 * FK. It is created here — additively, per docs/DATABASE.md — so the
 * challenge/membership/invite foreign keys have a real target.
 *
 * RECONCILIATION NOTE (later Cut 1 task): when better-auth moves to the
 * database, its own `user` table (string ids, auth-managed columns) must be
 * reconciled with this domain profile — either this table absorbs the
 * better-auth id as a text column or a mapping view is introduced. Until
 * then nothing writes rows here; the TypeORM challenges store maps the
 * session user id with `Number(userId)` and requires numeric ids.
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

  @Column({ length: 255 })
  passwordHash: string;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  createdAt: Date;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  updatedAt: Date;
}
