/**
 * Errors with a meaning for the engine. `Blocked` and `RobotsDisallowed` are outcomes,
 * not bugs: the engine marks the store / skips the path and alerts, without retrying
 * and without reporting to Sentry (01-foundation.md 1.7, 11-compliance-and-ops.md).
 */

export class AdapterError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = new.target.name;
  }
}

/** 403, 429 or a challenge page. Never retry, never work around it. */
export class Blocked extends AdapterError {
  constructor(
    readonly url: string,
    readonly reason: 'status_403' | 'status_429' | 'challenge',
  ) {
    super(`blocked (${reason}) at ${url}`);
  }
}

/** robots.txt disallows this path for CheapaBot. */
export class RobotsDisallowed extends AdapterError {
  constructor(readonly url: string) {
    super(`robots.txt disallows ${url}`);
  }
}

/** The page no longer has the shape the adapter expects (site redesign, API change). */
export class ParseError extends AdapterError {
  constructor(
    readonly adapterId: string,
    message: string,
    options?: ErrorOptions,
  ) {
    super(`${adapterId}: ${message}`, options);
  }
}

/** Body larger than the client's cap (5 MB). Retrying won't help. */
export class ResponseTooLarge extends AdapterError {
  constructor(
    readonly url: string,
    readonly limitBytes: number,
  ) {
    super(`response from ${url} exceeds ${limitBytes} bytes`);
  }
}

/** Still failing after the client's retries (5xx), or too many redirects. */
export class HttpError extends AdapterError {
  constructor(
    readonly url: string,
    readonly status: number,
    message = `HTTP ${status} from ${url}`,
  ) {
    super(message);
  }
}
