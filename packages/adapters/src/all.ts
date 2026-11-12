import { jumiaAdapter } from './jumia/index.js';
import type { SourceAdapter } from './types.js';

/**
 * Every adapter the worker can run. Add each new adapter here (phase 03 onwards); the
 * registry refuses duplicate ids, domains and platforms at startup.
 */
export const allAdapters: readonly SourceAdapter[] = [jumiaAdapter];
