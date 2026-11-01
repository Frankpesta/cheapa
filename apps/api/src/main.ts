import 'reflect-metadata';
import { createApp } from './bootstrap.js';
import { loadApiEnv } from './config/env.js';

const env = loadApiEnv();
const app = await createApp(env);
await app.listen({ port: env.API_PORT, host: env.API_HOST });
