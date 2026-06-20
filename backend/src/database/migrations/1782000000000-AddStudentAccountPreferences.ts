import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddStudentAccountPreferences1782000000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumns('users', [
      new TableColumn({
        name: 'preferredTutorLanguage',
        type: 'text',
        default: "'fr'",
      }),
      new TableColumn({
        name: 'notificationsEnabled',
        type: 'boolean',
        default: true,
      }),
    ]);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('users', 'notificationsEnabled');
    await queryRunner.dropColumn('users', 'preferredTutorLanguage');
  }
}
