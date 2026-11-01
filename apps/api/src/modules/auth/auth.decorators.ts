import type { DeviceRow, UserRow } from '@cheapa/db/users';
import { createParamDecorator, type ExecutionContext, SetMetadata } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';

/**
 * Who is calling. Every route requires a signed-in user unless it opts out:
 *   @Public()        no identity needed (health, search, products)
 *   @DeviceOrUser()  a signed-in user OR a known device (X-Cheapa-Device): /me, history
 *   @Roles('admin')  signed-in user with that role
 */
export type AccessLevel = 'public' | 'device_or_user' | 'user';
export const ACCESS_KEY = 'cheapa:access';
export const ROLES_KEY = 'cheapa:roles';

export const Public = () => SetMetadata(ACCESS_KEY, 'public' satisfies AccessLevel);
export const DeviceOrUser = () => SetMetadata(ACCESS_KEY, 'device_or_user' satisfies AccessLevel);
export const Roles = (...roles: UserRow['role'][]) => SetMetadata(ROLES_KEY, roles);

export interface Identity {
  user: UserRow | null;
  device: DeviceRow | null;
}

declare module 'fastify' {
  interface FastifyRequest {
    identity?: Identity;
  }
}

/** The caller's identity, set by AuthGuard. */
export const CurrentIdentity = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): Identity =>
    ctx.switchToHttp().getRequest<FastifyRequest>().identity ?? { user: null, device: null },
);
