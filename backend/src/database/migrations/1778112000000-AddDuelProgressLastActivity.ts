import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDuelProgressLastActivity1778112000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "duel_progresses" ADD COLUMN IF NOT EXISTS "lastActivityAt" TIMESTAMP NULL DEFAULT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "duel_progresses" DROP COLUMN IF EXISTS "lastActivityAt"`,
    );
  }
}
