import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

export class AddLearningLibraryAndTutor1781913600000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'learning_chapters',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          { name: 'subjectId', type: 'uuid' },
          { name: 'title', type: 'text' },
          { name: 'summary', type: 'text' },
          { name: 'content', type: 'text' },
          { name: 'position', type: 'int', default: 0 },
          { name: 'status', type: 'text', default: "'draft'" },
          { name: 'createdAt', type: 'timestamp', default: 'now()' },
          { name: 'updatedAt', type: 'timestamp', default: 'now()' },
        ],
        foreignKeys: [
          {
            columnNames: ['subjectId'],
            referencedTableName: 'subjects',
            referencedColumnNames: ['id'],
            onDelete: 'CASCADE',
          },
        ],
      }),
      true,
    );
    await queryRunner.createIndex(
      'learning_chapters',
      new TableIndex({
        name: 'IDX_learning_chapter_subject_status_position',
        columnNames: ['subjectId', 'status', 'position'],
      }),
    );

    await queryRunner.createTable(
      new Table({
        name: 'tutor_conversations',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          { name: 'userId', type: 'uuid' },
          { name: 'chapterId', type: 'uuid' },
          { name: 'language', type: 'text' },
          { name: 'createdAt', type: 'timestamp', default: 'now()' },
          { name: 'updatedAt', type: 'timestamp', default: 'now()' },
        ],
        uniques: [
          {
            name: 'UQ_tutor_conversation_user_chapter_language',
            columnNames: ['userId', 'chapterId', 'language'],
          },
        ],
        foreignKeys: [
          {
            columnNames: ['userId'],
            referencedTableName: 'users',
            referencedColumnNames: ['id'],
            onDelete: 'CASCADE',
          },
          {
            columnNames: ['chapterId'],
            referencedTableName: 'learning_chapters',
            referencedColumnNames: ['id'],
            onDelete: 'CASCADE',
          },
        ],
      }),
      true,
    );

    await queryRunner.createTable(
      new Table({
        name: 'tutor_messages',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          { name: 'conversationId', type: 'uuid' },
          { name: 'role', type: 'text' },
          { name: 'content', type: 'text' },
          { name: 'createdAt', type: 'timestamp', default: 'now()' },
        ],
        foreignKeys: [
          {
            columnNames: ['conversationId'],
            referencedTableName: 'tutor_conversations',
            referencedColumnNames: ['id'],
            onDelete: 'CASCADE',
          },
        ],
      }),
      true,
    );
    await queryRunner.createIndex(
      'tutor_messages',
      new TableIndex({
        name: 'IDX_tutor_message_conversation_created',
        columnNames: ['conversationId', 'createdAt'],
      }),
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('tutor_messages', true);
    await queryRunner.dropTable('tutor_conversations', true);
    await queryRunner.dropTable('learning_chapters', true);
  }
}
