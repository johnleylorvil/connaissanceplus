import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

export class AddAccountVerificationCodes1777393200000 implements MigrationInterface {
  name = 'AddAccountVerificationCodes1777393200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const tableExists = await queryRunner.hasTable('account_verification_codes');
    if (!tableExists) {
      await queryRunner.createTable(
        new Table({
          name: 'account_verification_codes',
          columns: [
            {
              name: 'id',
              type: 'uuid',
              isPrimary: true,
              generationStrategy: 'uuid',
              default: queryRunner.connection.options.type === 'postgres' ? 'gen_random_uuid()' : undefined,
            },
            { name: 'email', type: 'varchar' },
            { name: 'purpose', type: 'text' },
            { name: 'codeHash', type: 'text' },
            { name: 'payload', type: 'text' },
            {
              name: 'expiresAt',
              type: queryRunner.connection.options.type === 'postgres' ? 'timestamp' : 'datetime',
            },
            {
              name: 'createdAt',
              type: queryRunner.connection.options.type === 'postgres' ? 'timestamp' : 'datetime',
              default: queryRunner.connection.options.type === 'postgres' ? 'CURRENT_TIMESTAMP' : "datetime('now')",
            },
            {
              name: 'updatedAt',
              type: queryRunner.connection.options.type === 'postgres' ? 'timestamp' : 'datetime',
              default: queryRunner.connection.options.type === 'postgres' ? 'CURRENT_TIMESTAMP' : "datetime('now')",
            },
          ],
          uniques: [
            {
              name: 'UQ_account_verification_codes_email_purpose',
              columnNames: ['email', 'purpose'],
            },
          ],
        }),
      );

      await queryRunner.createIndex(
        'account_verification_codes',
        new TableIndex({
          name: 'IDX_account_verification_codes_expiresAt',
          columnNames: ['expiresAt'],
        }),
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const tableExists = await queryRunner.hasTable('account_verification_codes');
    if (tableExists) {
      await queryRunner.dropTable('account_verification_codes');
    }
  }
}