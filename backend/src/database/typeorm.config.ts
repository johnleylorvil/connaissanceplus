import { ConfigService } from '@nestjs/config';
import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { join } from 'path';
import { DataSourceOptions } from 'typeorm';

import { databaseEntities } from './entities';

type TypeOrmContext = 'app' | 'cli';

function parseBoolean(
  value: string | undefined,
  defaultValue: boolean,
): boolean {
  if (value == null) {
    return defaultValue;
  }

  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
}

function readBoolean(
  key: string,
  fallback: boolean,
  configService?: ConfigService,
): boolean {
  return parseBoolean(readString(key, fallback ? 'true' : 'false', configService), fallback);
}

function readString(
  key: string,
  fallback: string,
  configService?: ConfigService,
): string {
  if (configService) {
    return configService.get<string>(key, fallback);
  }

  return process.env[key] ?? fallback;
}

function readNumber(
  key: string,
  fallback: number,
  configService?: ConfigService,
): number {
  if (configService) {
    return configService.get<number>(key, fallback);
  }

  const rawValue = process.env[key];
  if (!rawValue) {
    return fallback;
  }

  const parsedValue = Number(rawValue);
  return Number.isFinite(parsedValue) ? parsedValue : fallback;
}

export function createTypeOrmOptions(
  configService?: ConfigService,
  context: TypeOrmContext = 'app',
): TypeOrmModuleOptions & DataSourceOptions {
  const dbType = readString('DB_TYPE', 'sqlite', configService);
  const synchronize =
    context === 'app'
      ? parseBoolean(
          readString(
            'DB_SYNCHRONIZE',
            dbType === 'sqlite' ? 'true' : 'false',
            configService,
          ),
          dbType === 'sqlite',
        )
      : false;
  const migrationsRun =
    context === 'app'
      ? parseBoolean(
          readString(
            'DB_MIGRATIONS_RUN',
            dbType === 'postgres' ? 'true' : 'false',
            configService,
          ),
          dbType === 'postgres',
        )
      : false;

  const baseOptions = {
    entities: databaseEntities,
    migrations: [join(__dirname, 'migrations', '*{.ts,.js}')],
    migrationsTableName: 'typeorm_migrations',
    synchronize,
    migrationsRun: migrationsRun && !synchronize,
  } satisfies Partial<TypeOrmModuleOptions & DataSourceOptions>;

  if (dbType === 'postgres') {
    const sslEnabled = readBoolean('DB_SSL', false, configService);
    const rejectUnauthorized = readBoolean(
      'DB_SSL_REJECT_UNAUTHORIZED',
      true,
      configService,
    );

    return {
      ...baseOptions,
      type: 'postgres',
      host: readString('DB_HOST', 'localhost', configService),
      port: readNumber('DB_PORT', 5432, configService),
      username: readString('DB_USERNAME', 'postgres', configService),
      password: readString('DB_PASSWORD', 'postgres', configService),
      database: readString('DB_NAME', 'konesans_plus', configService),
      ssl: sslEnabled ? { rejectUnauthorized } : false,
    };
  }

  return {
    ...baseOptions,
    type: 'sqlite',
    database: readString('DB_SQLITE_PATH', 'konesans.sqlite', configService),
  };
}
