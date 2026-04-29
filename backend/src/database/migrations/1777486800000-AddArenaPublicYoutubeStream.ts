import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddArenaPublicYoutubeStream1777486800000 implements MigrationInterface {
  name = 'AddArenaPublicYoutubeStream1777486800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const tableExists = await queryRunner.hasTable('arena_competitions');
    if (!tableExists) {
      return;
    }

    const isPostgres = queryRunner.connection.options.type === 'postgres';
    const dateTimeType = isPostgres ? 'timestamp' : 'datetime';

    if (!(await queryRunner.hasColumn('arena_competitions', 'publicStreamProvider'))) {
      await queryRunner.addColumn(
        'arena_competitions',
        new TableColumn({
          name: 'publicStreamProvider',
          type: 'text',
          default: "'none'",
        }),
      );
    }

    if (!(await queryRunner.hasColumn('arena_competitions', 'publicStreamUrl'))) {
      await queryRunner.addColumn(
        'arena_competitions',
        new TableColumn({
          name: 'publicStreamUrl',
          type: 'text',
          isNullable: true,
        }),
      );
    }

    if (!(await queryRunner.hasColumn('arena_competitions', 'publicStreamChatUrl'))) {
      await queryRunner.addColumn(
        'arena_competitions',
        new TableColumn({
          name: 'publicStreamChatUrl',
          type: 'text',
          isNullable: true,
        }),
      );
    }

    if (!(await queryRunner.hasColumn('arena_competitions', 'publicStreamStatus'))) {
      await queryRunner.addColumn(
        'arena_competitions',
        new TableColumn({
          name: 'publicStreamStatus',
          type: 'text',
          default: "'idle'",
        }),
      );
    }

    if (!(await queryRunner.hasColumn('arena_competitions', 'publicStreamStartedAt'))) {
      await queryRunner.addColumn(
        'arena_competitions',
        new TableColumn({
          name: 'publicStreamStartedAt',
          type: dateTimeType,
          isNullable: true,
        }),
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const tableExists = await queryRunner.hasTable('arena_competitions');
    if (!tableExists) {
      return;
    }

    for (const columnName of [
      'publicStreamStartedAt',
      'publicStreamStatus',
      'publicStreamChatUrl',
      'publicStreamUrl',
      'publicStreamProvider',
    ]) {
      if (await queryRunner.hasColumn('arena_competitions', columnName)) {
        await queryRunner.dropColumn('arena_competitions', columnName);
      }
    }
  }
}