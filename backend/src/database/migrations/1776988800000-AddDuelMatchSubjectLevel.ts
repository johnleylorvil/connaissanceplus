import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddDuelMatchSubjectLevel1776988800000 implements MigrationInterface {
  name = 'AddDuelMatchSubjectLevel1776988800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await this.addColumnIfMissing(
      queryRunner,
      'duel_matches',
      new TableColumn({
        name: 'subjectId',
        type: 'uuid',
        isNullable: true,
      }),
    );

    await this.addColumnIfMissing(
      queryRunner,
      'duel_matches',
      new TableColumn({
        name: 'levelId',
        type: 'uuid',
        isNullable: true,
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await this.dropColumnIfExists(queryRunner, 'duel_matches', 'levelId');
    await this.dropColumnIfExists(queryRunner, 'duel_matches', 'subjectId');
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