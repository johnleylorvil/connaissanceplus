import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddStudentDepartmentAndClass1777075200000 implements MigrationInterface {
  name = 'AddStudentDepartmentAndClass1777075200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await this.addColumnIfMissing(
      queryRunner,
      'users',
      new TableColumn({
        name: 'department',
        type: 'text',
        isNullable: true,
      }),
    );

    await this.addColumnIfMissing(
      queryRunner,
      'users',
      new TableColumn({
        name: 'className',
        type: 'text',
        isNullable: true,
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await this.dropColumnIfExists(queryRunner, 'users', 'className');
    await this.dropColumnIfExists(queryRunner, 'users', 'department');
  }

  private async addColumnIfMissing(
    queryRunner: QueryRunner,
    tableName: string,
    column: TableColumn,
  ): Promise<void> {
    const table = await queryRunner.getTable(tableName);
    if (table && !table.findColumnByName(column.name)) {
      await queryRunner.addColumn(table, column);
    }
  }

  private async dropColumnIfExists(
    queryRunner: QueryRunner,
    tableName: string,
    columnName: string,
  ): Promise<void> {
    const table = await queryRunner.getTable(tableName);
    const column = table?.findColumnByName(columnName);

    if (table && column) {
      await queryRunner.dropColumn(table, column);
    }
  }
}