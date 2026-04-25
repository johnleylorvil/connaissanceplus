import { MigrationInterface, QueryRunner, Table } from 'typeorm';

export class RenameArenaTeamSchema1776643200000 implements MigrationInterface {
  name = 'RenameArenaTeamSchema1776643200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await this.renameColumnIfExists(
      queryRunner,
      'arena_competitions',
      'winnerTeamId',
      'winnerParticipantUserId',
    );
    await this.renameTableIfExists(
      queryRunner,
      'arena_team_registrations',
      'arena_participant_registrations',
    );
    await this.renameColumnIfExists(
      queryRunner,
      'arena_participant_registrations',
      'teamId',
      'participantUserId',
    );
    await this.renameTableIfExists(
      queryRunner,
      'arena_team_answers',
      'arena_participant_answers',
    );
    await this.renameColumnIfExists(
      queryRunner,
      'arena_participant_answers',
      'teamId',
      'participantUserId',
    );
    await this.renameColumnIfExists(
      queryRunner,
      'arena_chat_messages',
      'teamId',
      'participantUserId',
    );
    await this.renameColumnIfExists(
      queryRunner,
      'arena_score_adjustments',
      'teamId',
      'participantUserId',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await this.renameColumnIfExists(
      queryRunner,
      'arena_score_adjustments',
      'participantUserId',
      'teamId',
    );
    await this.renameColumnIfExists(
      queryRunner,
      'arena_chat_messages',
      'participantUserId',
      'teamId',
    );
    await this.renameColumnIfExists(
      queryRunner,
      'arena_participant_answers',
      'participantUserId',
      'teamId',
    );
    await this.renameTableIfExists(
      queryRunner,
      'arena_participant_answers',
      'arena_team_answers',
    );
    await this.renameColumnIfExists(
      queryRunner,
      'arena_participant_registrations',
      'participantUserId',
      'teamId',
    );
    await this.renameTableIfExists(
      queryRunner,
      'arena_participant_registrations',
      'arena_team_registrations',
    );
    await this.renameColumnIfExists(
      queryRunner,
      'arena_competitions',
      'winnerParticipantUserId',
      'winnerTeamId',
    );
  }

  private async renameTableIfExists(
    queryRunner: QueryRunner,
    fromTableName: string,
    toTableName: string,
  ): Promise<void> {
    const hasSourceTable = await queryRunner.hasTable(fromTableName);
    const hasTargetTable = await queryRunner.hasTable(toTableName);

    if (hasSourceTable && !hasTargetTable) {
      await queryRunner.renameTable(fromTableName, toTableName);
    }
  }

  private async renameColumnIfExists(
    queryRunner: QueryRunner,
    tableName: string,
    fromColumnName: string,
    toColumnName: string,
  ): Promise<void> {
    const table = await queryRunner.getTable(tableName);
    if (!table) {
      return;
    }

    const sourceColumn = table.findColumnByName(fromColumnName);
    const targetColumn = table.findColumnByName(toColumnName);

    if (sourceColumn && !targetColumn) {
      await queryRunner.renameColumn(table as Table, fromColumnName, toColumnName);
    }
  }
}