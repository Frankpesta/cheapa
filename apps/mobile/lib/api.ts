/**
 * Cheapa API client. Every response is checked against the shared zod schemas from
 * @cheapa/core/client, so a contract drift fails loudly here rather than in a screen.
 */
import {
  APP_VERSION_HEADER,
  DEVICE_HEADER,
  PLATFORM_HEADER,
  ProductResponse,
  PriceHistoryResponse,
  REQUEST_ID_HEADER,
  SearchHistoryResponse,
  SearchResponse,
  type SearchSource,
} from '@cheapa/core/client';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import type { z } from 'zod';
import { deviceId } from './device';

export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8080').replace(/\/+$/, '');

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** Plain-English message for a failed call; the API's own text stays in logs. */
export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 429) return 'Too many searches. Try again in a minute.';
    if (error.status === 422) return "We couldn't read that photo. Try a clearer one.";
    if (error.status === 404) return "We couldn't find that.";
    if (error.status >= 500) return 'Cheapa is having a moment. Try again shortly.';
  }
  return 'No connection. Check your data and try again.';
}

async function headers(requestId?: string): Promise<Record<string, string>> {
  return {
    [DEVICE_HEADER]: await deviceId(),
    [PLATFORM_HEADER]: Platform.OS === 'ios' || Platform.OS === 'android' ? Platform.OS : 'web',
    [APP_VERSION_HEADER]: Constants.expoConfig?.version ?? '0.0.0',
    ...(requestId ? { [REQUEST_ID_HEADER]: requestId } : {}),
  };
}

async function call<S extends z.ZodType>(
  path: string,
  schema: S | null,
  init: RequestInit & { requestId?: string; signal?: AbortSignal } = {},
): Promise<z.infer<S>> {
  const { requestId, ...rest } = init;
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...rest,
      headers: { ...(await headers(requestId)), ...(rest.headers as Record<string, string> | undefined) },
    });
  } catch (error) {
    if ((error as Error).name === 'AbortError') throw error;
    throw new ApiError(0, 'network');
  }
  if (!res.ok) throw new ApiError(res.status, `${init.method ?? 'GET'} ${path} -> ${res.status}`);
  if (!schema || res.status === 204) return undefined as z.infer<S>;
  return schema.parse(await res.json());
}

/** One picked or captured photo, already downscaled (lib/image.ts). */
export interface UploadImage {
  uri: string;
  mimeType: string;
}

async function imagePart(img: UploadImage): Promise<Blob | { uri: string; name: string; type: string }> {
  // React Native's FormData takes a file descriptor; the browser needs real bytes.
  if (Platform.OS === 'web') return (await fetch(img.uri)).blob();
  return { uri: img.uri, name: 'photo.jpg', type: img.mimeType };
}

export const api = {
  async searchImage(
    img: UploadImage,
    opts: { source: Exclude<SearchSource, 'text'>; requestId: string; item?: number; signal?: AbortSignal },
  ) {
    const form = new FormData();
    // Fields before the file: the server reads them as they stream in.
    form.append('source', opts.source);
    if (opts.item !== undefined) form.append('item', String(opts.item));
    form.append('image', (await imagePart(img)) as Blob, 'photo.jpg');
    return call('/search/image', SearchResponse, {
      method: 'POST',
      body: form,
      requestId: opts.requestId,
      ...(opts.signal ? { signal: opts.signal } : {}),
    });
  },

  searchText(query: string, opts: { source: SearchSource; requestId: string; signal?: AbortSignal }) {
    return call('/search/text', SearchResponse, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query, source: opts.source }),
      requestId: opts.requestId,
      ...(opts.signal ? { signal: opts.signal } : {}),
    });
  },

  product: (slug: string) => call(`/products/${encodeURIComponent(slug)}`, ProductResponse),

  priceHistory: (productId: string, days: number) =>
    call(`/products/${productId}/history?days=${days}`, PriceHistoryResponse),

  searches: (cursor?: string | null) =>
    call(
      `/me/searches?limit=20${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`,
      SearchHistoryResponse,
    ),

  deleteSearch: (id: string) => call(`/me/searches/${id}`, null, { method: 'DELETE' }),

  clearSearches: () => call('/me/searches', null, { method: 'DELETE' }),
};

/** The tracked outbound link (/go/:listingId), opened in the in-app browser. */
export function goUrl(path: string, searchRequestId?: string): string {
  const url = path.startsWith('http') ? path : `${API_URL}${path}`;
  return searchRequestId ? `${url}${url.includes('?') ? '&' : '?'}s=${searchRequestId}` : url;
}
