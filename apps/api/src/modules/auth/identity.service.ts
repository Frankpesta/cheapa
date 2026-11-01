import { createClerkClient } from '@clerk/backend';
import { type DeviceRow, devices, type UserRow, users, type UsersConnection } from '@cheapa/db/users';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';
import { API_ENV, type ApiEnv } from '../../config/env.js';
import { USERS_DB } from '../../infra/database.module.js';
import type { VerifiedSession } from './clerk-verifier.js';

export type Platform = NonNullable<DeviceRow['platform']>;

@Injectable()
export class IdentityService {
  private readonly log = new Logger(IdentityService.name);
  private readonly clerk;

  constructor(
    @Inject(USERS_DB) private readonly usersDb: UsersConnection,
    @Inject(API_ENV) env: ApiEnv,
  ) {
    this.clerk = env.CLERK_SECRET_KEY ? createClerkClient({ secretKey: env.CLERK_SECRET_KEY }) : null;
  }

  /**
   * Just-in-time user row for a verified Clerk session. One indexed read on the hot
   * path; writes only on first sight or when the role claim changes.
   */
  async userFor(session: VerifiedSession): Promise<UserRow> {
    const { db } = this.usersDb;
    const [existing] = await db.select().from(users).where(eq(users.clerkId, session.clerkUserId)).limit(1);
    if (existing) {
      if (session.role && session.role !== existing.role) {
        const [updated] = await db
          .update(users)
          .set({ role: session.role })
          .where(eq(users.id, existing.id))
          .returning();
        return updated ?? existing;
      }
      return existing;
    }

    const [inserted] = await db
      .insert(users)
      .values({
        clerkId: session.clerkUserId,
        role: session.role ?? 'user',
        email: await this.primaryEmail(session.clerkUserId),
      })
      .onConflictDoNothing({ target: users.clerkId })
      .returning();
    if (inserted) return inserted;
    // Lost a race with a concurrent first request: read the winner.
    const [row] = await db.select().from(users).where(eq(users.clerkId, session.clerkUserId)).limit(1);
    if (!row) throw new Error('user upsert failed');
    return row;
  }

  /**
   * Device row for an anonymous id. last_seen_at is refreshed at most hourly so a
   * busy device doesn't write on every request.
   */
  async deviceFor(anonId: string, platform: Platform | null, appVersion: string | null): Promise<DeviceRow> {
    const [row] = await this.usersDb.db
      .insert(devices)
      .values({ anonId, platform, appVersion })
      .onConflictDoUpdate({
        target: devices.anonId,
        set: {
          lastSeenAt: sql`now()`,
          platform: sql`coalesce(excluded.platform, ${devices.platform})`,
          appVersion: sql`coalesce(excluded.app_version, ${devices.appVersion})`,
        },
        setWhere: sql`${devices.lastSeenAt} < now() - interval '1 hour'
          or ${devices.platform} is distinct from coalesce(excluded.platform, ${devices.platform})
          or ${devices.appVersion} is distinct from coalesce(excluded.app_version, ${devices.appVersion})`,
      })
      .returning();
    if (row) return row;
    // Nothing to update: the row exists and is fresh.
    const [existing] = await this.usersDb.db
      .select()
      .from(devices)
      .where(eq(devices.anonId, anonId))
      .limit(1);
    if (!existing) throw new Error('device upsert failed');
    return existing;
  }

  /** Attach a device to a user (08-user-side.md 8.3). Search history moves with it once 8.5 lands. */
  async linkDevice(deviceId: string, userId: string): Promise<void> {
    await this.usersDb.db.update(devices).set({ userId }).where(eq(devices.id, deviceId));
  }

  /**
   * Email for alerts, fetched once when the user row is created. Phone numbers are NOT
   * copied from Clerk: we store a phone only with explicit WhatsApp opt-in (11.2).
   */
  private async primaryEmail(clerkUserId: string): Promise<string | null> {
    if (!this.clerk) return null;
    try {
      const user = await this.clerk.users.getUser(clerkUserId);
      return user.primaryEmailAddress?.emailAddress ?? null;
    } catch (error) {
      this.log.warn({ err: error instanceof Error ? error.message : 'unknown' }, 'clerk user lookup failed');
      return null;
    }
  }
}
