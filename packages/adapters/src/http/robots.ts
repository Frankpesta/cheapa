import robotsParserModule from 'robots-parser';

// robots-parser is CommonJS (`module.exports = fn`) but its .d.ts claims `export default`.
// Node hands us the function itself; accept either shape.
type ParseRobots = typeof robotsParserModule.default;
const robotsParser: ParseRobots =
  typeof robotsParserModule === 'function' ? robotsParserModule : robotsParserModule.default;

/** What the client needs from robots.txt for one origin. */
export interface RobotsRules {
  isAllowed(url: string): boolean;
}

/** Fetches the raw robots.txt; the client passes one that is itself rate limited. */
export type RobotsFetcher = (robotsUrl: string) => Promise<{ status: number; body: string }>;

export const ROBOTS_TTL_MS = 24 * 60 * 60 * 1000;
/** A failing robots.txt (5xx/network) is retried sooner than a good one. */
export const ROBOTS_ERROR_TTL_MS = 60 * 60 * 1000;

const ALLOW_ALL: RobotsRules = { isAllowed: () => true };
const DISALLOW_ALL: RobotsRules = { isAllowed: () => false };

/**
 * robots.txt per origin, cached in process for 24 h (02-crawler-core.md 2.2).
 * - 2xx: parsed; rules for our agent token ("CheapaBot") or "*".
 * - 404/410 and other 4xx: no rules, everything allowed (RFC 9309).
 * - 5xx or network error: everything disallowed until retried (RFC 9309 2.3.1.4).
 * - 403/429/challenge pages never reach here: the client throws Blocked for them.
 */
export class RobotsCache {
  private readonly cache = new Map<string, { rules: RobotsRules; expires: number }>();
  private readonly inflight = new Map<string, Promise<RobotsRules>>();

  constructor(
    private readonly agent: string,
    private readonly now: () => number = Date.now,
  ) {}

  async rulesFor(url: URL, fetchRobots: RobotsFetcher): Promise<RobotsRules> {
    const origin = url.origin;
    const hit = this.cache.get(origin);
    if (hit && hit.expires > this.now()) return hit.rules;

    let pending = this.inflight.get(origin);
    if (!pending) {
      pending = this.load(origin, fetchRobots).finally(() => this.inflight.delete(origin));
      this.inflight.set(origin, pending);
    }
    return pending;
  }

  private async load(origin: string, fetchRobots: RobotsFetcher): Promise<RobotsRules> {
    const robotsUrl = `${origin}/robots.txt`;
    let rules: RobotsRules;
    let ttl = ROBOTS_TTL_MS;
    try {
      const res = await fetchRobots(robotsUrl);
      if (res.status >= 200 && res.status < 300) {
        const parsed = robotsParser(robotsUrl, res.body);
        rules = { isAllowed: (u) => parsed.isAllowed(u, this.agent) !== false };
      } else if (res.status >= 500) {
        rules = DISALLOW_ALL;
        ttl = ROBOTS_ERROR_TTL_MS;
      } else {
        rules = ALLOW_ALL;
      }
    } catch (err) {
      if (!isNetworkError(err)) throw err;
      rules = DISALLOW_ALL;
      ttl = ROBOTS_ERROR_TTL_MS;
    }
    this.cache.set(origin, { rules, expires: this.now() + ttl });
    return rules;
  }
}

/** Blocked and caller aborts must surface; connection failures and timeouts mean "unreachable". */
function isNetworkError(err: unknown): boolean {
  return err instanceof TypeError || (err instanceof Error && err.name === 'TimeoutError');
}
