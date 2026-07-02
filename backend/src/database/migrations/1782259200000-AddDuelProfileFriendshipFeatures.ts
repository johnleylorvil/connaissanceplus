import { MigrationInterface, QueryRunner, Table, TableColumn, TableUnique } from 'typeorm';

export class AddDuelProfileFriendshipFeatures1782259200000 implements MigrationInterface {
  name = 'AddDuelProfileFriendshipFeatures1782259200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const isPostgres = queryRunner.connection.options.type === 'postgres';
    const dateTimeType = isPostgres ? 'timestamp' : 'datetime';
    const uuidType = isPostgres ? 'uuid' : 'varchar';

    if (await queryRunner.hasTable('users')) {
      if (!(await queryRunner.hasColumn('users', 'gender'))) {
        await queryRunner.addColumn('users', new TableColumn({ name: 'gender', type: 'text', isNullable: true }));
      }
      if (!(await queryRunner.hasColumn('users', 'avatarUrl'))) {
        await queryRunner.addColumn('users', new TableColumn({ name: 'avatarUrl', type: 'text', isNullable: true }));
      }
    }

    if (await queryRunner.hasTable('duel_matches')) {
      if (!(await queryRunner.hasColumn('duel_matches', 'durationMinutes'))) {
        await queryRunner.addColumn('duel_matches', new TableColumn({ name: 'durationMinutes', type: 'int', default: 3 }));
      }
      if (!(await queryRunner.hasColumn('duel_matches', 'matchStartsAt'))) {
        await queryRunner.addColumn('duel_matches', new TableColumn({ name: 'matchStartsAt', type: dateTimeType, isNullable: true }));
      }
    }

    if (!(await queryRunner.hasTable('friendships'))) {
      await queryRunner.createTable(
        new Table({
          name: 'friendships',
          columns: [
            { name: 'id', type: uuidType, isPrimary: true, isGenerated: true, generationStrategy: 'uuid' },
            { name: 'requesterUserId', type: uuidType },
            { name: 'addresseeUserId', type: uuidType },
            { name: 'status', type: 'text', default: "'pending'" },
            { name: 'createdAt', type: dateTimeType, default: isPostgres ? 'now()' : "datetime('now')" },
            { name: 'updatedAt', type: dateTimeType, default: isPostgres ? 'now()' : "datetime('now')" },
          ],
          foreignKeys: [
            {
              columnNames: ['requesterUserId'],
              referencedTableName: 'users',
              referencedColumnNames: ['id'],
              onDelete: 'CASCADE',
            },
            {
              columnNames: ['addresseeUserId'],
              referencedTableName: 'users',
              referencedColumnNames: ['id'],
              onDelete: 'CASCADE',
            },
          ],
        }),
      );
      await queryRunner.createUniqueConstraint(
        'friendships',
        new TableUnique({ name: 'UQ_friendships_requester_addressee', columnNames: ['requesterUserId', 'addresseeUserId'] }),
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('friendships')) {
      await queryRunner.dropTable('friendships');
    }

    if (await queryRunner.hasTable('duel_matches')) {
      if (await queryRunner.hasColumn('duel_matches', 'matchStartsAt')) {
        await queryRunner.dropColumn('duel_matches', 'matchStartsAt');
      }
      if (await queryRunner.hasColumn('duel_matches', 'durationMinutes')) {
        await queryRunner.dropColumn('duel_matches', 'durationMinutes');
      }
    }

    if (await queryRunner.hasTable('users')) {
      if (await queryRunner.hasColumn('users', 'avatarUrl')) {
        await queryRunner.dropColumn('users', 'avatarUrl');
      }
      if (await queryRunner.hasColumn('users', 'gender')) {
        await queryRunner.dropColumn('users', 'gender');
      }
    }
  }
}
