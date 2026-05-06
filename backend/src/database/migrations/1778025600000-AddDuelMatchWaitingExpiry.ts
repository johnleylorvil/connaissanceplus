import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddDuelMatchWaitingExpiry1778025600000 implements MigrationInterface {
  name = 'AddDuelMatchWaitingExpiry1778025600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const tableExists = await queryRunner.hasTable('duel_matches');
    if (!tableExists) {
      return;
    }

    const isPostgres = queryRunner.connection.options.type === 'postgres';
    const dateTimeType = isPostgres ? 'timestamp' : 'datetime';

    if (!(await queryRunner.hasColumn('duel_matches', 'waitingExpiresAt'))) {
      await queryRunner.addColumn(
        'duel_matches',
        new TableColumn({
          name: 'waitingExpiresAt',
          type: dateTimeType,
          isNullable: true,
          default: null,
        }),
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const tableExists = await queryRunner.hasTable('duel_matches');
    if (!tableExists) return;

    if (await queryRunner.hasColumn('duel_matches', 'waitingExpiresAt')) {
      await queryRunner.dropColumn('duel_matches', 'waitingExpiresAt');
    }
  }
}
