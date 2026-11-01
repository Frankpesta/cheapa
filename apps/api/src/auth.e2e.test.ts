/**
 * 01-foundation.md 1.6 acceptance: GET /me signed out (device returned) and signed in
 * (user upserted on first call); invalid tokens get 401. Plus access levels and linking.
 */
import { LinkDeviceResponse, MeResponse } from '@cheapa/core';
import { devices, users } from '@cheapa/db/users';
import { count, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type Harness, startHarness } from './test/harness.js';

let h: Harness;
const DEVICE = '0f0f0f0f-1111-4222-8333-444444444444';
const ORIGIN = 'http://localhost:3000';

beforeAll(async () => {
  h = await startHarness();
});

afterAll(async () => {
  await h?.stop();
});

const get = (url: string, headers: Record<string, string> = {}) =>
  h.app.inject({ method: 'GET', url, headers });
const bearer = (claims: Record<string, unknown>, opts?: Parameters<Harness['signer']['sign']>[1]) => ({
  authorization: `Bearer ${h.signer.sign({ azp: ORIGIN, ...claims }, opts)}`,
});

describe('GET /me signed out', () => {
  it('401s with no identity at all', async () => {
    expect((await get('/me')).statusCode).toBe(401);
  });

  it('401s with a malformed device id', async () => {
    expect((await get('/me', { 'x-cheapa-device': 'not-a-uuid' })).statusCode).toBe(401);
  });

  it('returns the device, creating it once', async () => {
    const headers = {
      'x-cheapa-device': DEVICE,
      'x-cheapa-platform': 'android',
      'x-cheapa-app-version': '1.0.0',
    };
    const first = MeResponse.parse((await get('/me', headers)).json());
    const second = MeResponse.parse((await get('/me', headers)).json());
    expect(first.user).toBeNull();
    expect(first.device).toMatchObject({ anonId: DEVICE, platform: 'android', linked: false });
    expect(second.device?.id).toBe(first.device?.id);
    const [row] = await h.users.db.select({ n: count() }).from(devices).where(eq(devices.anonId, DEVICE));
    expect(row?.n).toBe(1);
  });
});

describe('GET /me signed in', () => {
  it('upserts the user on first call and reuses it after', async () => {
    const first = await get('/me', bearer({ sub: 'user_abc' }));
    expect(first.statusCode).toBe(200);
    const me = MeResponse.parse(first.json());
    expect(me.user).toMatchObject({ plan: 'free', role: 'user', whatsappOptIn: false });

    const again = MeResponse.parse((await get('/me', bearer({ sub: 'user_abc' }))).json());
    expect(again.user?.id).toBe(me.user?.id);
    const [row] = await h.users.db.select({ n: count() }).from(users).where(eq(users.clerkId, 'user_abc'));
    expect(row?.n).toBe(1);
  });

  it('takes the admin role from the session claim', async () => {
    const me = MeResponse.parse((await get('/me', bearer({ sub: 'user_admin', role: 'admin' }))).json());
    expect(me.user?.role).toBe('admin');
  });

  it('ignores unknown role claims', async () => {
    const me = MeResponse.parse((await get('/me', bearer({ sub: 'user_odd', role: 'superuser' }))).json());
    expect(me.user?.role).toBe('user');
  });
});

describe('invalid tokens get 401', () => {
  it.each([
    ['wrong signing key', () => bearer({ sub: 'user_x' }, { key: 'other' })],
    ['expired', () => bearer({ sub: 'user_x' }, { expiresInSec: -120 })],
    [
      'wrong authorized party',
      () => ({ authorization: `Bearer ${h.signer.sign({ sub: 'user_x', azp: 'https://evil.example' })}` }),
    ],
    ['missing sub', () => bearer({})],
    ['garbage', () => ({ authorization: 'Bearer not.a.jwt' })],
    ['not a bearer scheme', () => ({ authorization: 'Basic dXNlcjpwYXNz' })],
  ])('%s', async (_label, headers) => {
    expect((await get('/me', headers())).statusCode).toBe(401);
  });

  it('even on public routes, so clients refresh instead of silently searching signed out', async () => {
    const res = await get('/health', bearer({ sub: 'user_x' }, { key: 'other' }));
    expect(res.statusCode).toBe(401);
  });

  it('creates no user row for a rejected token', async () => {
    const [row] = await h.users.db.select({ n: count() }).from(users).where(eq(users.clerkId, 'user_x'));
    expect(row?.n).toBe(0);
  });
});

describe('public routes stay open', () => {
  it('health and search need no identity', async () => {
    expect((await get('/health')).statusCode).toBe(200);
    const res = await h.app.inject({
      method: 'POST',
      url: '/search/text',
      payload: { query: 'ankara gown' },
    });
    expect(res.statusCode).toBe(200);
  });
});

describe('POST /me/link-device', () => {
  it('needs a signed-in user', async () => {
    const res = await h.app.inject({
      method: 'POST',
      url: '/me/link-device',
      headers: { 'x-cheapa-device': DEVICE },
    });
    expect(res.statusCode).toBe(401);
  });

  it('needs a device header', async () => {
    const res = await h.app.inject({
      method: 'POST',
      url: '/me/link-device',
      headers: bearer({ sub: 'user_abc' }),
    });
    expect(res.statusCode).toBe(400);
  });

  it('links the device to the user', async () => {
    const res = await h.app.inject({
      method: 'POST',
      url: '/me/link-device',
      headers: { ...bearer({ sub: 'user_abc' }), 'x-cheapa-device': DEVICE },
    });
    expect(res.statusCode).toBe(200);
    const linked = LinkDeviceResponse.parse(res.json());
    const me = MeResponse.parse((await get('/me', { 'x-cheapa-device': DEVICE })).json());
    expect(me.device).toMatchObject({ id: linked.deviceId, linked: true });
  });
});
