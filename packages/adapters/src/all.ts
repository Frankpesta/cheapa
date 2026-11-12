import { jijiAdapter } from './jiji/index.js';
import { jumiaAdapter } from './jumia/index.js';
import { shopifyAdapter } from './shopify/index.js';
import type { SourceAdapter } from './types.js';
import { wooAdapter } from './woocommerce/index.js';

/**
 * Every adapter the worker can run. Add each new adapter here (phase 03 onwards); the
 * registry refuses duplicate ids, domains and platforms at startup.
 */
export const allAdapters: readonly SourceAdapter[] = [jumiaAdapter, jijiAdapter, shopifyAdapter, wooAdapter];
