import { MigrationInterface, QueryRunner, Table, TableColumn, TableForeignKey } from 'typeorm';

export class AddInstitutionalLiveSchools1782432000000 implements MigrationInterface {
  name = 'AddInstitutionalLiveSchools1782432000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const isPostgres = queryRunner.connection.options.type === 'postgres';
    const dateTimeType = isPostgres ? 'timestamp' : 'datetime';

    if (!(await queryRunner.hasTable('schools'))) {
      await queryRunner.createTable(new Table({
        name: 'schools',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true, isGenerated: true, generationStrategy: 'uuid' },
          { name: 'name', type: 'text', isUnique: true },
          { name: 'city', type: 'text', isNullable: true },
          { name: 'department', type: 'text', isNullable: true },
          { name: 'address', type: 'text', isNullable: true },
          { name: 'contactName', type: 'text', isNullable: true },
          { name: 'contactEmail', type: 'text', isNullable: true },
          { name: 'contactPhone', type: 'text', isNullable: true },
          { name: 'logoUrl', type: 'text', isNullable: true },
          { name: 'isActive', type: 'boolean', default: true },
          { name: 'createdAt', type: dateTimeType, default: isPostgres ? 'now()' : 'CURRENT_TIMESTAMP' },
        ],
      }));
    }

    if (await queryRunner.hasTable('users')) {
      if (!(await queryRunner.hasColumn('users', 'schoolId'))) {
        await queryRunner.addColumn('users', new TableColumn({ name: 'schoolId', type: 'uuid', isNullable: true }));
      }
      const usersTable = await queryRunner.getTable('users');
      if (!usersTable?.foreignKeys.some((key) => key.name === 'FK_users_school')) {
        await queryRunner.createForeignKey('users', new TableForeignKey({
          name: 'FK_users_school',
          columnNames: ['schoolId'],
          referencedTableName: 'schools',
          referencedColumnNames: ['id'],
          onDelete: 'SET NULL',
        }));
      }
    }

    if (await queryRunner.hasTable('arena_competitions')) {
      const schoolColumns = [
        'schoolAId',
        'schoolBId',
        'schoolARepresentativeUserId',
        'schoolBRepresentativeUserId',
        'winnerSchoolId',
      ];
      for (const columnName of schoolColumns) {
        if (!(await queryRunner.hasColumn('arena_competitions', columnName))) {
          await queryRunner.addColumn('arena_competitions', new TableColumn({
            name: columnName,
            type: 'uuid',
            isNullable: true,
          }));
        }
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('arena_competitions')) {
      for (const columnName of [
        'winnerSchoolId',
        'schoolBRepresentativeUserId',
        'schoolARepresentativeUserId',
        'schoolBId',
        'schoolAId',
      ]) {
        if (await queryRunner.hasColumn('arena_competitions', columnName)) {
          await queryRunner.dropColumn('arena_competitions', columnName);
        }
      }
    }

    if (await queryRunner.hasTable('users')) {
      const usersTable = await queryRunner.getTable('users');
      const fk = usersTable?.foreignKeys.find((key) => key.name === 'FK_users_school');
      if (fk) await queryRunner.dropForeignKey('users', fk);
      if (await queryRunner.hasColumn('users', 'schoolId')) {
        await queryRunner.dropColumn('users', 'schoolId');
      }
    }

    if (await queryRunner.hasTable('schools')) {
      await queryRunner.dropTable('schools');
    }
  }
}