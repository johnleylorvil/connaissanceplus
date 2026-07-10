import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDuelProgressAbandonedAt1782345600000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "duel_progresses" ADD COLUMN IF NOT EXISTS "abandonedAt" TIMESTAMP NULL DEFAULT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "duel_progresses" DROP COLUMN IF EXISTS "abandonedAt"`,
    );
  }
}