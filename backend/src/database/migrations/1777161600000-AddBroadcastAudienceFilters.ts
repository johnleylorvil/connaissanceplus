import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddBroadcastAudienceFilters1777161600000 implements MigrationInterface {
  name = 'AddBroadcastAudienceFilters1777161600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await this.addColumnIfMissing(
      queryRunner,
      'admin_broadcasts',
      new TableColumn({
        name: 'levelId',
        type: 'uuid',
        isNullable: true,
      }),
    );

    await this.addColumnIfMissing(
      queryRunner,
      'admin_broadcasts',
      new TableColumn({
        name: 'department',
        type: 'text',
        isNullable: true,
      }),
    );

    await this.addColumnIfMissing(
      queryRunner,
      'admin_broadcasts',
      new TableColumn({
        name: 'city',
        type: 'text',
        isNullable: true,
      }),
    );

    await this.addColumnIfMissing(
      queryRunner,
      'admin_broadcasts',
      new TableColumn({
        name: 'className',
        type: 'text',
        isNullable: true,
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await this.dropColumnIfExists(queryRunner, 'admin_broadcasts', 'className');
    await this.dropColumnIfExists(queryRunner, 'admin_broadcasts', 'city');
    await this.dropColumnIfExists(queryRunner, 'admin_broadcasts', 'department');
    await this.dropColumnIfExists(queryRunner, 'admin_broadcasts', 'levelId');
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