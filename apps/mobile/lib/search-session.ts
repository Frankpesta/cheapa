/**
 * A search in flight. The client mints the request id, sends it as x-request-id (the API
 * reuses it as the search id, so history rows match), and routes to /search/[requestId]
 * straight away; that screen runs the query and shows Searching until it lands.
 *
 * Inputs live in memory only: the photo is never written anywhere we keep (rule 4).
 */
import type { SearchResponse, SearchSource } from '@cheapa/core/client';
import { useQuery } from '@tanstack/react-query';
import * as Crypto from 'expo-crypto';
import { api, type UploadImage } from './api';

export type SearchInput =
  | { kind: 'image'; image: UploadImage; source: Exclude<SearchSource, 'text'>; item?: number }
  | { kind: 'text'; query: string; source: SearchSource };

const inputs = new Map<string, SearchInput>();

export function startSearch(input: SearchInput): string {
  const id = Crypto.randomUUID();
  inputs.set(id, input);
  return id;
}

export const searchInput = (id: string) => inputs.get(id);

export const searchKey = (id: string) => ['search', id] as const;

export function useSearch(id: string) {
  const input = inputs.get(id);
  return useQuery<SearchResponse>({
    queryKey: searchKey(id),
    queryFn: ({ signal }) => {
      if (!input) throw new Error('expired');
      return input.kind === 'image'
        ? api.searchImage(input.image, {
            source: input.source,
            requestId: id,
            signal,
            ...(input.item !== undefined ? { item: input.item } : {}),
          })
        : api.searchText(input.query, { source: input.source, requestId: id, signal });
    },
    enabled: input !== undefined,
    // A search is a snapshot: back-navigation shows the same answer, no refetch.
    staleTime: Infinity,
    gcTime: 30 * 60_000,
    retry: 1,
  });
}
