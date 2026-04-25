import 'reflect-metadata';
import { config as loadEnv } from 'dotenv';
import { DataSource } from 'typeorm';

import { createTypeOrmOptions } from './typeorm.config';

loadEnv({ path: '.env', quiet: true });

export default new DataSource(createTypeOrmOptions(undefined, 'cli'));