import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * Domain user profile (Cut 1, task #9).
 *
 * Auth itself is handled by better-auth in the separate authUser table; this
 * table is the domain profile that challenges reference via
 * FK. It is created here — additively, per docs/DATABASE.md — so the
 * challenge/membership/invite foreign keys have a real target.
 *
 * RECONCILIATION NOTE (issue 2): better-auth uses opaque string ids while this
 * profile uses numeric ids. The mapping must be implemented before production
 * challenge writes can use authenticated users. Until then nothing writes rows
 * here; the TypeORM challenges store maps the
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
