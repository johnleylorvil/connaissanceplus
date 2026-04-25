import { MigrationInterface, QueryRunner, Table, TableColumn } from 'typeorm';

export class RemoveLegacyPrimeSchema1776729600000 implements MigrationInterface {
  name = 'RemoveLegacyPrimeSchema1776729600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await this.dropColumnIfExists(queryRunner, 'users', 'primeBalance');
    await this.dropColumnIfExists(queryRunner, 'duel_matches', 'winnerPrimeReward');
    await this.dropColumnIfExists(queryRunner, 'arena_competitions', 'primeReward');

    if (await queryRunner.hasTable('prime_transactions')) {
      await queryRunner.dropTable('prime_transactions');
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await this.addColumnIfMissing(
      queryRunner,
      'users',
      new TableColumn({
        name: 'primeBalance',
        type: 'int',
        isNullable: false,
        default: 0,
      }),
    );

    await this.addColumnIfMissing(
      queryRunner,
      'duel_matches',
      new TableColumn({
        name: 'winnerPrimeReward',
        type: 'int',
        isNullable: false,
        default: 0,
      }),
    );

    await this.addColumnIfMissing(
      queryRunner,
      'arena_competitions',
      new TableColumn({
        name: 'primeReward',
        type: 'int',
        isNullable: false,
        default: 500,
      }),
    );

    if (!(await queryRunner.hasTable('prime_transactions'))) {
      await queryRunner.createTable(
        new Table({
          name: 'prime_transactions',
          columns: [
            {
              name: 'id',
              type: 'uuid',
              isPrimary: true,
              generationStrategy: 'uuid',
              default: this.uuidDefault(queryRunner),
            },
            {
              name: 'userId',
              type: 'uuid',
              isNullable: false,
            },
            {
              name: 'amount',
              type: 'int',
              isNullable: false,
            },
            {
              name: 'reason',
              type: 'text',
              isNullable: false,
            },
            {
              name: 'metadata',
              type: 'text',
              isNullable: true,
            },
            {
              name: 'createdAt',
              type: 'datetime',
              isNullable: false,
              default: this.timestampDefault(queryRunner),
            },
          ],
          foreignKeys: [
            {
              columnNames: ['userId'],
              referencedTableName: 'users',
              referencedColumnNames: ['id'],
              onDelete: 'CASCADE',
            },
          ],
        }),
      );
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

  private uuidDefault(queryRunner: QueryRunner): string | undefined {
    return queryRunner.connection.options.type === 'postgres'
      ? 'gen_random_uuid()'
      : undefined;
  }

  private timestampDefault(queryRunner: QueryRunner): string {
    return queryRunner.connection.options.type === 'postgres'
      ? 'CURRENT_TIMESTAMP'
      : "datetime('now')";
  }
}