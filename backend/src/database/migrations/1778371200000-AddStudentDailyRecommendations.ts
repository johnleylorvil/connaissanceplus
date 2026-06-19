import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableIndex,
  TableUnique,
} from 'typeorm';

export class AddStudentDailyRecommendations1778371200000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'student_daily_recommendations',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          { name: 'userId', type: 'uuid' },
          { name: 'recommendationDate', type: 'text' },
          { name: 'slot', type: 'int' },
          { name: 'candidateKey', type: 'text' },
          { name: 'category', type: 'text' },
          { name: 'title', type: 'text' },
          { name: 'reason', type: 'text' },
          { name: 'action', type: 'text' },
          { name: 'createdAt', type: 'timestamp', default: 'now()' },
          { name: 'updatedAt', type: 'timestamp', default: 'now()' },
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
      true,
    );
    await queryRunner.createUniqueConstraint(
      'student_daily_recommendations',
      new TableUnique({
        name: 'UQ_student_recommendation_day_slot',
        columnNames: ['userId', 'recommendationDate', 'slot'],
      }),
    );
    await queryRunner.createIndex(
      'student_daily_recommendations',
      new TableIndex({
        name: 'IDX_student_recommendation_user_day',
        columnNames: ['userId', 'recommendationDate'],
      }),
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('student_daily_recommendations', true);
  }
}
