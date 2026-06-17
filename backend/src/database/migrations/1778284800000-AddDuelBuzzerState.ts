import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddDuelBuzzerState1778284800000 implements MigrationInterface {
  name = 'AddDuelBuzzerState1778284800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('duel_matches'))) {
      return;
    }

    const isPostgres = queryRunner.connection.options.type === 'postgres';
    const dateTimeType = isPostgres ? 'timestamp' : 'datetime';
    const uuidType = isPostgres ? 'uuid' : 'varchar';

    const columns: TableColumn[] = [
      new TableColumn({
        name: 'currentQuestionPosition',
        type: 'int',
        default: 1,
      }),
      new TableColumn({
        name: 'buzzerPhase',
        type: 'text',
        default: "'waiting_for_buzz'",
      }),
      new TableColumn({
        name: 'activeResponderUserId',
        type: uuidType,
        isNullable: true,
        default: null,
      }),
      new TableColumn({
        name: 'firstResponderUserId',
        type: uuidType,
        isNullable: true,
        default: null,
      }),
      new TableColumn({
        name: 'responseDeadlineAt',
        type: dateTimeType,
        isNullable: true,
        default: null,
      }),
    ];

    for (const column of columns) {
      if (!(await queryRunner.hasColumn('duel_matches', column.name))) {
        await queryRunner.addColumn('duel_matches', column);
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('duel_matches'))) {
      return;
    }

    for (const columnName of [
      'responseDeadlineAt',
      'firstResponderUserId',
      'activeResponderUserId',
      'buzzerPhase',
      'currentQuestionPosition',
    ]) {
      if (await queryRunner.hasColumn('duel_matches', columnName)) {
        await queryRunner.dropColumn('duel_matches', columnName);
      }
    }
  }
}
