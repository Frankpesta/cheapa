import { RawListing } from '@cheapa/core';
import type { z } from 'zod';
import type { RawPayload, SourceAdapter, StoreRef } from './types.js';

export interface RejectedListing {
  index: number;
  externalId?: string;
  issues: z.core.$ZodIssue[];
}

export interface ParsedListings {
  listings: RawListing[];
  /** Rows that failed validation. One bad row never sinks the page. */
  rejected: RejectedListing[];
}

/**
 * Runs `adapter.parse` and validates each row against `RawListing` (the adapter output
 * boundary). The engine and every fixture test go through here, never `parse` alone.
 */
export function parseListings(adapter: SourceAdapter, raw: RawPayload, store: StoreRef): ParsedListings {
  return validateListings(adapter.parse(raw, store));
}

export function validateListings(rows: readonly unknown[]): ParsedListings {
  const listings: RawListing[] = [];
  const rejected: RejectedListing[] = [];
  rows.forEach((row, index) => {
    const result = RawListing.safeParse(row);
    if (result.success) {
      listings.push(result.data);
      return;
    }
    const externalId = (row as { externalId?: unknown } | null)?.externalId;
    rejected.push({
      index,
      ...(typeof externalId === 'string' ? { externalId } : {}),
      issues: result.error.issues,
    });
  });
  return { listings, rejected };
}
