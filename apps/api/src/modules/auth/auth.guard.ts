import { APP_VERSION_HEADER, DEVICE_HEADER, PLATFORM_HEADER } from '@cheapa/core';
import type { UserRow } from '@cheapa/db/users';
import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { FastifyRequest } from 'fastify';
import { z } from 'zod';
import { ACCESS_KEY, type AccessLevel, type Identity, ROLES_KEY } from './auth.decorators.js';
import { ClerkVerifier } from './clerk-verifier.js';
import { IdentityService, type Platform } from './identity.service.js';

const Uuid = z.uuid();
const PlatformHeader = z.enum(['android', 'ios', 'web']);
const AppVersion = z.string().regex(/^[0-9A-Za-z.+-]{1,32}$/);

const header = (request: FastifyRequest, name: string): string | undefined => {
  const value = request.headers[name];
  return Array.isArray(value) ? value[0] : value;
};

/**
 * Global guard (registered as APP_GUARD). Resolves the caller from the Bearer token
 * and/or X-Cheapa-Device, then enforces the route's access level. A Bearer token that
 * fails verification is always 401, even on public routes, so clients refresh it.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly verifier: ClerkVerifier,
    private readonly identities: IdentityService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    const access = this.reflector.getAllAndOverride<AccessLevel | undefined>(ACCESS_KEY, targets) ?? 'user';
    const roles = this.reflector.getAllAndOverride<UserRow['role'][] | undefined>(ROLES_KEY, targets);
    const request = context.switchToHttp().getRequest<FastifyRequest>();

    const identity: Identity = { user: null, device: null };
    request.identity = identity;

    const authorization = header(request, 'authorization');
    if (authorization) {
      const [scheme, token] = authorization.split(' ');
      if (scheme?.toLowerCase() !== 'bearer' || !token) throw new UnauthorizedException('Use a Bearer token');
      identity.user = await this.identities.userFor(await this.verifier.verify(token));
    }

    const anonId = Uuid.safeParse(header(request, DEVICE_HEADER));
    if (anonId.success) {
      const platform = PlatformHeader.safeParse(header(request, PLATFORM_HEADER));
      const version = AppVersion.safeParse(header(request, APP_VERSION_HEADER));
      identity.device = await this.identities.deviceFor(
        anonId.data,
        platform.success ? (platform.data satisfies Platform) : null,
        version.success ? version.data : null,
      );
    }

    if (identity.user) request.log = request.log.child({ userId: identity.user.id });
    else if (identity.device) request.log = request.log.child({ deviceId: identity.device.id });

    if (access === 'public' && !roles) return true;
    if (access === 'device_or_user' && !roles) {
      if (identity.user || identity.device) return true;
      throw new UnauthorizedException('Sign in or send X-Cheapa-Device');
    }
    if (!identity.user) throw new UnauthorizedException('Sign in required');
    if (roles && !roles.includes(identity.user.role)) throw new ForbiddenException('Not allowed');
    return true;
  }
}
