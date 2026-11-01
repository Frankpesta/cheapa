import type { LinkDeviceResponse, MeResponse } from '@cheapa/core';
import { BadRequestException, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { CurrentIdentity, DeviceOrUser, type Identity } from '../auth/auth.decorators.js';
import { AnalyticsService } from '../analytics/analytics.service.js';
import { IdentityService } from '../auth/identity.service.js';

@Controller('me')
export class UsersController {
  constructor(
    private readonly identities: IdentityService,
    private readonly analytics: AnalyticsService,
  ) {}

  /** The signed-in user (if any) and the calling device (if sent). */
  @Get()
  @DeviceOrUser()
  me(@CurrentIdentity() { user, device }: Identity): MeResponse {
    return {
      user: user && {
        id: user.id,
        email: user.email,
        city: user.city,
        whatsappOptIn: user.whatsappOptIn,
        plan: user.plan,
        role: user.role,
      },
      device: device && {
        id: device.id,
        anonId: device.anonId,
        platform: device.platform,
        linked: device.userId !== null,
      },
    };
  }

  /** After sign-in: attach this device (and, from 8.5, its history) to the user. */
  @Post('link-device')
  @HttpCode(200)
  async linkDevice(@CurrentIdentity() { user, device }: Identity): Promise<LinkDeviceResponse> {
    if (!user) throw new BadRequestException('Sign in first');
    if (!device) throw new BadRequestException('Send X-Cheapa-Device');
    await this.identities.linkDevice(device.id, user.id);
    this.analytics.alias(user.id, device.id);
    return { deviceId: device.id, userId: user.id };
  }
}
