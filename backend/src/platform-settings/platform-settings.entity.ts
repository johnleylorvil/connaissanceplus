import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

@Entity('platform_settings')
export class PlatformSettings {
  @PrimaryColumn({ type: 'text', default: 'default' })
  id: string;

  @Column({ type: 'text', default: 'Konesans+' })
  organizationName: string;

  @Column({ type: 'text', nullable: true })
  legalName: string | null;

  @Column({ type: 'text', nullable: true })
  supportEmail: string | null;

  @Column({ type: 'text', nullable: true })
  websiteUrl: string | null;

  @Column({ type: 'text', default: 'Haïti' })
  country: string;

  @Column({ type: 'text', default: 'America/Port-au-Prince' })
  timezone: string;

  @Column({ type: 'text', nullable: true })
  logoUrl: string | null;

  @Column({ type: 'int', default: 8 })
  minimumPasswordLength: number;

  @Column({ type: 'boolean', default: true })
  registrationEnabled: boolean;

  @Column({ type: 'boolean', default: true })
  tutorEnabled: boolean;

  @Column({ type: 'boolean', default: true })
  correspondenceEnabled: boolean;

  @Column({ type: 'boolean', default: true })
  notificationsEnabled: boolean;

  @UpdateDateColumn()
  updatedAt: Date;
}
