import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class EnhanceAccountVerificationCodes1777400400000 implements MigrationInterface {
  name = 'EnhanceAccountVerificationCodes1777400400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const tableExists = await queryRunner.hasTable('account_verification_codes');
    if (!tableExists) {
      return;
    }

    const isPostgres = queryRunner.connection.options.type === 'postgres';
    const dateTimeType = isPostgres ? 'timestamp' : 'datetime';
    const nowExpression = isPostgres ? 'CURRENT_TIMESTAMP' : "datetime('now')";

    if (!(await queryRunner.hasColumn('account_verification_codes', 'verifyAttempts'))) {
      await queryRunner.addColumn(
        'account_verification_codes',
        new TableColumn({
          name: 'verifyAttempts',
          type: 'int',
          default: 0,
        }),
      );
    }

    if (!(await queryRunner.hasColumn('account_verification_codes', 'sendCount'))) {
      await queryRunner.addColumn(
        'account_verification_codes',
        new TableColumn({
          name: 'sendCount',
          type: 'int',
          default: 1,
        }),
      );
    }

    if (!(await queryRunner.hasColumn('account_verification_codes', 'lastSentAt'))) {
      await queryRunner.addColumn(
        'account_verification_codes',
        new TableColumn({
          name: 'lastSentAt',
          type: dateTimeType,
          default: nowExpression,
        }),
      );
    }

    if (!(await queryRunner.hasColumn('account_verification_codes', 'blockedUntil'))) {
      await queryRunner.addColumn(
        'account_verification_codes',
        new TableColumn({
          name: 'blockedUntil',
          type: dateTimeType,
          isNullable: true,
        }),
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const tableExists = await queryRunner.hasTable('account_verification_codes');
    if (!tableExists) {
      return;
    }

    for (const columnName of ['blockedUntil', 'lastSentAt', 'sendCount', 'verifyAttempts']) {
      if (await queryRunner.hasColumn('account_verification_codes', columnName)) {
        await queryRunner.dropColumn('account_verification_codes', columnName);
      }
    }
  }
}