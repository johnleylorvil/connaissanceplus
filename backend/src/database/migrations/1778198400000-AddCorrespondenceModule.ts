import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

/**
 * Migration: Add Correspondence Contest module tables.
 *
 * Tables created:
 *   correspondence_sessions
 *   correspondence_letters
 *   correspondence_assignments
 *   correspondence_threads
 *   correspondence_messages
 *   correspondence_votes
 *   correspondence_moderation_cases
 *
 * Feature-flag: FEATURE_CORRESPONDENCE_CONTEST=true (runtime check in service)
 */
export class AddCorrespondenceModule1778198400000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── correspondence_sessions ─────────────────────────────────────────────────
    await queryRunner.createTable(
      new Table({
        name: 'correspondence_sessions',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true, generationStrategy: 'uuid', default: 'uuid_generate_v4()' },
          { name: 'title', type: 'text' },
          { name: 'themePrompt', type: 'text' },
          { name: 'startAt', type: 'timestamp' },
          { name: 'endAt', type: 'timestamp' },
          { name: 'gracePeriodHours', type: 'int', default: 48 },
          { name: 'status', type: 'text', default: "'draft'" },
          { name: 'rules', type: 'text', isNullable: true },
          { name: 'createdBy', type: 'uuid' },
          { name: 'createdAt', type: 'timestamp', default: 'now()' },
        ],
      }),
      true,
    );

    // ── correspondence_letters ──────────────────────────────────────────────────
    await queryRunner.createTable(
      new Table({
        name: 'correspondence_letters',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true, generationStrategy: 'uuid', default: 'uuid_generate_v4()' },
          { name: 'sessionId', type: 'uuid' },
          { name: 'authorUserId', type: 'uuid' },
          { name: 'body', type: 'text' },
          { name: 'metadata', type: 'text', isNullable: true },
          { name: 'createdAt', type: 'timestamp', default: 'now()' },
          { name: 'submittedAt', type: 'timestamp', isNullable: true },
          { name: 'status', type: 'text', default: "'draft'" },
        ],
        foreignKeys: [
          { columnNames: ['sessionId'], referencedTableName: 'correspondence_sessions', referencedColumnNames: ['id'], onDelete: 'CASCADE' },
          { columnNames: ['authorUserId'], referencedTableName: 'users', referencedColumnNames: ['id'], onDelete: 'CASCADE' },
        ],
      }),
      true,
    );

    await queryRunner.createIndex('correspondence_letters', new TableIndex({ name: 'IDX_letter_session_author', columnNames: ['sessionId', 'authorUserId'] }));
    await queryRunner.createIndex('correspondence_letters', new TableIndex({ name: 'IDX_letter_session_status', columnNames: ['sessionId', 'status'] }));

    // ── correspondence_assignments ──────────────────────────────────────────────
    await queryRunner.createTable(
      new Table({
        name: 'correspondence_assignments',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true, generationStrategy: 'uuid', default: 'uuid_generate_v4()' },
          { name: 'sessionId', type: 'uuid' },
          { name: 'letterId', type: 'uuid', isUnique: true },
          { name: 'recipientUserId', type: 'uuid' },
          { name: 'assignedAt', type: 'timestamp' },
          { name: 'deliveredAt', type: 'timestamp', isNullable: true },
          { name: 'openedAt', type: 'timestamp', isNullable: true },
        ],
        foreignKeys: [
          { columnNames: ['sessionId'], referencedTableName: 'correspondence_sessions', referencedColumnNames: ['id'], onDelete: 'CASCADE' },
          { columnNames: ['letterId'], referencedTableName: 'correspondence_letters', referencedColumnNames: ['id'], onDelete: 'CASCADE' },
          { columnNames: ['recipientUserId'], referencedTableName: 'users', referencedColumnNames: ['id'], onDelete: 'CASCADE' },
        ],
      }),
      true,
    );

    await queryRunner.createIndex('correspondence_assignments', new TableIndex({ name: 'IDX_assignment_session_recipient', columnNames: ['sessionId', 'recipientUserId'] }));

    // ── correspondence_threads ──────────────────────────────────────────────────
    await queryRunner.createTable(
      new Table({
        name: 'correspondence_threads',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true, generationStrategy: 'uuid', default: 'uuid_generate_v4()' },
          { name: 'sessionId', type: 'uuid' },
          { name: 'assignmentId', type: 'uuid', isUnique: true },
          { name: 'createdAt', type: 'timestamp', default: 'now()' },
          { name: 'lastMessageAt', type: 'timestamp', isNullable: true },
          { name: 'isAnonymous', type: 'boolean', default: true },
        ],
        foreignKeys: [
          { columnNames: ['sessionId'], referencedTableName: 'correspondence_sessions', referencedColumnNames: ['id'], onDelete: 'CASCADE' },
          { columnNames: ['assignmentId'], referencedTableName: 'correspondence_assignments', referencedColumnNames: ['id'], onDelete: 'CASCADE' },
        ],
      }),
      true,
    );

    // ── correspondence_messages ─────────────────────────────────────────────────
    await queryRunner.createTable(
      new Table({
        name: 'correspondence_messages',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true, generationStrategy: 'uuid', default: 'uuid_generate_v4()' },
          { name: 'threadId', type: 'uuid' },
          { name: 'senderUserId', type: 'uuid' },
          { name: 'body', type: 'text' },
          { name: 'createdAt', type: 'timestamp', default: 'now()' },
        ],
        foreignKeys: [
          { columnNames: ['threadId'], referencedTableName: 'correspondence_threads', referencedColumnNames: ['id'], onDelete: 'CASCADE' },
          { columnNames: ['senderUserId'], referencedTableName: 'users', referencedColumnNames: ['id'], onDelete: 'CASCADE' },
        ],
      }),
      true,
    );

    await queryRunner.createIndex('correspondence_messages', new TableIndex({ name: 'IDX_message_thread_created', columnNames: ['threadId', 'createdAt'] }));

    // ── correspondence_votes ────────────────────────────────────────────────────
    await queryRunner.createTable(
      new Table({
        name: 'correspondence_votes',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true, generationStrategy: 'uuid', default: 'uuid_generate_v4()' },
          { name: 'sessionId', type: 'uuid' },
          { name: 'voterUserId', type: 'uuid' },
          { name: 'letterId', type: 'uuid' },
          { name: 'score', type: 'int', default: 1 },
          { name: 'createdAt', type: 'timestamp', default: 'now()' },
        ],
        uniques: [{ name: 'UQ_vote_session_voter_letter', columnNames: ['sessionId', 'voterUserId', 'letterId'] }],
        foreignKeys: [
          { columnNames: ['sessionId'], referencedTableName: 'correspondence_sessions', referencedColumnNames: ['id'], onDelete: 'CASCADE' },
          { columnNames: ['voterUserId'], referencedTableName: 'users', referencedColumnNames: ['id'], onDelete: 'CASCADE' },
          { columnNames: ['letterId'], referencedTableName: 'correspondence_letters', referencedColumnNames: ['id'], onDelete: 'CASCADE' },
        ],
      }),
      true,
    );

    // ── correspondence_moderation_cases ─────────────────────────────────────────
    await queryRunner.createTable(
      new Table({
        name: 'correspondence_moderation_cases',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true, generationStrategy: 'uuid', default: 'uuid_generate_v4()' },
          { name: 'reporterUserId', type: 'uuid' },
          { name: 'targetType', type: 'text' },
          { name: 'targetId', type: 'uuid' },
          { name: 'reason', type: 'text' },
          { name: 'details', type: 'text', isNullable: true },
          { name: 'status', type: 'text', default: "'pending'" },
          { name: 'createdAt', type: 'timestamp', default: 'now()' },
          { name: 'handledBy', type: 'uuid', isNullable: true },
          { name: 'handledAt', type: 'timestamp', isNullable: true },
        ],
        foreignKeys: [
          { columnNames: ['reporterUserId'], referencedTableName: 'users', referencedColumnNames: ['id'], onDelete: 'CASCADE' },
        ],
      }),
      true,
    );

    await queryRunner.createIndex('correspondence_moderation_cases', new TableIndex({ name: 'IDX_modcase_target', columnNames: ['targetType', 'targetId'] }));
    await queryRunner.createIndex('correspondence_moderation_cases', new TableIndex({ name: 'IDX_modcase_status', columnNames: ['status'] }));
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('correspondence_moderation_cases', true);
    await queryRunner.dropTable('correspondence_votes', true);
    await queryRunner.dropTable('correspondence_messages', true);
    await queryRunner.dropTable('correspondence_threads', true);
    await queryRunner.dropTable('correspondence_assignments', true);
    await queryRunner.dropTable('correspondence_letters', true);
    await queryRunner.dropTable('correspondence_sessions', true);
  }
}
