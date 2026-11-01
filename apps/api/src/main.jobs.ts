// instrument must be first: Sentry hooks modules as they load.
import './instrument.js';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { loadApiEnv } from './config/env.js';
import { JobsModule } from './jobs.module.js';

const env = loadApiEnv();
const app = await NestFactory.createApplicationContext(JobsModule.forRoot(env), { bufferLogs: true });
const logger = app.get(Logger);
app.useLogger(logger);
app.enableShutdownHooks();
logger.log('started (no consumers yet)', 'api-jobs');
