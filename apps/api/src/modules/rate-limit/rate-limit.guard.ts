import { DEVICE_HEADER } from '@cheapa/core';
import {
  type CanActivate,
  type ExecutionContext,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Redis } from 'ioredis';
import { z } from 'zod';
import { API_ENV, type ApiEnv } from '../../config/env.js';
import { REDIS_QUEUE } from '../../infra/redis.module.js';
import { takeToken } from './token-bucket.js';

export type RateLimitName = 'image_search';
const RATE_LIMIT_KEY = 'cheapa:rate-limit';
const HOUR_MS = 3_600_000;

/** Apply a named limit to a route: @RateLimit('image_search'). */
export const RateLimit = (name: RateLimitName) => SetMetadata(RATE_LIMIT_KEY, name);

const deviceId = z.uuid();

/**
 * Per-device limit first; a request without a valid device id gets the same strict
 * limit keyed by IP, so dropping the header doesn't help. A high per-IP backstop
 * catches abuse across many fake device ids without hurting carrier-NAT users.
 * Signed-in limits arrive with auth (1.6).
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(REDIS_QUEUE) private readonly redis: Redis,
    @Inject(API_ENV) private readonly env: ApiEnv,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const name = this.reflector.get<RateLimitName | undefined>(RATE_LIMIT_KEY, context.getHandler());
    if (!name) return true;

    const http = context.switchToHttp();
    const request = http.getRequest<FastifyRequest>();
    const reply = http.getResponse<FastifyReply>();

    const header = request.headers[DEVICE_HEADER];
    const device = deviceId.safeParse(Array.isArray(header) ? header[0] : header);
    const subject = device.success ? `dev:${device.data}` : `ip:${request.ip}`;

    const perSubject = { capacity: this.env.RATE_LIMIT_IMAGE_PER_DEVICE_HOUR, windowMs: HOUR_MS };
    const perIp = { capacity: this.env.RATE_LIMIT_IMAGE_PER_IP_HOUR, windowMs: HOUR_MS };

    const first = await takeToken(this.redis, `rl:${name}:${subject}`, perSubject);
    const second =
      first.allowed && device.success
        ? await takeToken(this.redis, `rl:${name}:ipmax:${request.ip}`, perIp)
        : null;
    const denied = !first.allowed ? first : second && !second.allowed ? second : null;

    void reply.header('ratelimit-limit', String(perSubject.capacity));
    void reply.header('ratelimit-remaining', String(first.remaining));
    if (denied) {
      void reply.header('retry-after', String(Math.ceil(denied.retryAfterMs / 1000)));
      throw new HttpException(
        {
          statusCode: 429,
          error: 'Too Many Requests',
          message: 'Too many searches. Try again a little later.',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    return true;
  }
}
