import {
  MigrationInterface,
  QueryRunner,
  TableColumn,
  TableForeignKey,
} from 'typeorm';

export class AddUserAccountLifecycle1782086400000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    const dateType =
      queryRunner.connection.options.type === 'postgres'
        ? 'timestamp'
        : 'datetime';
    await queryRunner.addColumns('users', [
      new TableColumn({ name: 'isActive', type: 'boolean', default: true }),
      new TableColumn({
        name: 'suspendedAt',
        type: dateType,
        isNullable: true,
      }),
      new TableColumn({
        name: 'suspendedByUserId',
        type: 'uuid',
        isNullable: true,
      }),
      new TableColumn({
        name: 'suspensionReason',
        type: 'text',
        isNullable: true,
      }),
    ]);
    await queryRunner.createForeignKey(
      'users',
      new TableForeignKey({
        name: 'FK_users_suspended_by',
        columnNames: ['suspendedByUserId'],
        referencedTableName: 'users',
        referencedColumnNames: ['id'],
        onDelete: 'SET NULL',
      }),
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('users');
    const foreignKey = table?.foreignKeys.find(
      (key) => key.name === 'FK_users_suspended_by',
    );
    if (foreignKey) await queryRunner.dropForeignKey('users', foreignKey);
    await queryRunner.dropColumn('users', 'suspensionReason');
    await queryRunner.dropColumn('users', 'suspendedByUserId');
    await queryRunner.dropColumn('users', 'suspendedAt');
    await queryRunner.dropColumn('users', 'isActive');
  }
}
