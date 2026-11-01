import fastifyMultipart from '@fastify/multipart';
import { REQUEST_ID_HEADER } from '@cheapa/core';
import type { Type } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import * as Sentry from '@sentry/nestjs';
import { LogController } from 'fastify';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module.js';
import { createLogger, genReqId } from './common/logger.js';
import type { ApiEnv } from './config/env.js';
import { MAX_IMAGE_BYTES } from './modules/search/image-upload.js';

/** Build the HTTP app. Shared by main.ts and the e2e tests. */
export async function createApp(env: ApiEnv, extraModules: Type[] = []): Promise<NestFastifyApplication> {
  const logger = createLogger(env, 'api');
  const adapter = new FastifyAdapter({
    loggerInstance: logger,
    genReqId,
    logController: new LogController({ requestIdLogLabel: 'requestId' }),
    trustProxy: env.TRUST_PROXY,
    bodyLimit: 64 * 1024, // JSON bodies are small; images use multipart
  });
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule.forRoot(env, logger, extraModules),
    adapter,
    {
      bufferLogs: true,
    },
  );
  app.useLogger(app.get(Logger));
  app.enableShutdownHooks();
  app.enableCors({
    origin: env.CORS_ORIGINS,
    exposedHeaders: [REQUEST_ID_HEADER, 'ratelimit-remaining', 'retry-after'],
  });

  const fastify = app.getHttpAdapter().getInstance();
  // In-memory only: never call saveRequestFiles (CLAUDE.md rule 4).
  await app.register(fastifyMultipart, { limits: { fileSize: MAX_IMAGE_BYTES, files: 1 } });
  // Every Sentry event from this request carries its id, matching the logs and x-request-id.
  fastify.addHook('onRequest', (request, _reply, done) => {
    Sentry.getIsolationScope().setTag('requestId', request.id);
    done();
  });
  fastify.addHook('onSend', async (request, reply) => {
    void reply.header(REQUEST_ID_HEADER, request.id);
  });
  return app;
}
