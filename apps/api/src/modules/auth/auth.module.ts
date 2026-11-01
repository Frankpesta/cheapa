import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthGuard } from './auth.guard.js';
import { ClerkVerifier } from './clerk-verifier.js';
import { IdentityService } from './identity.service.js';

/** Registers AuthGuard globally: every route needs a user unless marked @Public/@DeviceOrUser. */
@Global()
@Module({
  providers: [ClerkVerifier, IdentityService, { provide: APP_GUARD, useClass: AuthGuard }],
  exports: [IdentityService],
})
export class AuthModule {}
