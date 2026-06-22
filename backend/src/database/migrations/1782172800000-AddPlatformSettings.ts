import { MigrationInterface, QueryRunner, Table } from 'typeorm';

export class AddPlatformSettings1782172800000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    const dateType =
      queryRunner.connection.options.type === 'postgres'
        ? 'timestamp'
        : 'datetime';
    await queryRunner.createTable(
      new Table({
        name: 'platform_settings',
        columns: [
          { name: 'id', type: 'text', isPrimary: true },
          { name: 'organizationName', type: 'text', default: "'Konesans+'" },
          { name: 'legalName', type: 'text', isNullable: true },
          { name: 'supportEmail', type: 'text', isNullable: true },
          { name: 'websiteUrl', type: 'text', isNullable: true },
          { name: 'country', type: 'text', default: "'Haïti'" },
          {
            name: 'timezone',
            type: 'text',
            default: "'America/Port-au-Prince'",
          },
          { name: 'logoUrl', type: 'text', isNullable: true },
          { name: 'minimumPasswordLength', type: 'int', default: 8 },
          { name: 'registrationEnabled', type: 'boolean', default: true },
          { name: 'tutorEnabled', type: 'boolean', default: true },
          { name: 'correspondenceEnabled', type: 'boolean', default: true },
          { name: 'notificationsEnabled', type: 'boolean', default: true },
          {
            name: 'updatedAt',
            type: dateType,
            default:
              queryRunner.connection.options.type === 'postgres'
                ? 'now()'
                : 'CURRENT_TIMESTAMP',
          },
        ],
      }),
      true,
    );
  }
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('platform_settings');
  }
}
