/**
 * Money is integer kobo everywhere (CLAUDE.md rule 1). This module is the only
 * place that turns store price text into kobo and kobo into display text.
 */

export const KOBO_PER_NAIRA = 100;

export interface ParsedPrice {
  /** 'from' = lowest of several variant prices ("From ₦ 13,340"); 'range' = "₦ X - ₦ Y". Same values as PriceKind in types.ts. */
  kind: 'exact' | 'from' | 'range';
  minKobo: number;
  /** Equal to minKobo for 'exact'; null when the upper bound is unknown ('from'). */
  maxKobo: number | null;
}

export class PriceParseError extends Error {
  constructor(
    message: string,
    readonly input: string,
  ) {
    super(`${message}: ${JSON.stringify(input)}`);
    this.name = 'PriceParseError';
  }
}

export function isKobo(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

export function assertKobo(value: number): number {
  if (!isKobo(value)) throw new RangeError(`Not a valid kobo amount: ${String(value)}`);
  return value;
}

/** Naira as a JSON number (e.g. an API's `price: 45000.5`) to kobo. */
export function nairaToKobo(naira: number): number {
  if (!Number.isFinite(naira) || naira < 0) throw new RangeError(`Not a valid naira amount: ${naira}`);
  return assertKobo(Math.round(naira * KOBO_PER_NAIRA));
}

/**
 * Amount in a currency's minor units (e.g. WooCommerce Store API `prices.price` with
 * `currency_minor_unit`) to kobo. Integer maths only.
 */
export function minorUnitsToKobo(amount: string | number, minorUnit: number): number {
  if (!Number.isInteger(minorUnit) || minorUnit < 0 || minorUnit > 6) {
    throw new RangeError(`Unsupported minor unit: ${minorUnit}`);
  }
  const digits = String(amount).trim();
  if (!/^\d+$/.test(digits)) throw new PriceParseError('Minor-unit amount must be digits', digits);
  const value = BigInt(digits);
  const kobo =
    minorUnit >= 2 ? roundDiv(value, 10n ** BigInt(minorUnit - 2)) : value * 10n ** BigInt(2 - minorUnit);
  return assertKobo(Number(kobo));
}

function roundDiv(n: bigint, d: bigint): bigint {
  return (n + d / 2n) / d;
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

const NAIRA_MARKERS = /₦|&#8358;|&#x20a6;|\bNGN\b|\bN(?=\s*\d)/gi;
const FOREIGN_CURRENCY = /[$€£¥]|\b(?:USD|EUR|GBP|CNY)\b/i;
const NO_PRICE = /contact|call|ask|negotiable|request|\bdm\b|inbox/i;
/** One amount: digits with optional thousands commas or spaces, optional decimals, optional k/m/b suffix. */
const AMOUNT = /(\d{1,3}(?:[,\s]\d{3})+|\d+)(?:\.(\d+))?\s*(k|m|b|thousand|million|mil)?\b/i;

function clean(input: string): string {
  return input
    .replace(/[\u00a0\u202f\u2007\u2009]/g, ' ') // non-breaking / narrow / thin spaces
    .replace(/[\u2012-\u2015\u2212]/g, '-') // en/em dashes and minus sign
    .replace(NAIRA_MARKERS, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function amountToKobo(match: RegExpExecArray, input: string): number {
  const whole = (match[1] ?? '').replace(/[,\s]/g, '');
  const fraction = match[2] ?? '';
  const suffix = (match[3] ?? '').toLowerCase();
  const multiplier =
    suffix === 'k' || suffix === 'thousand'
      ? 1_000n
      : suffix === 'm' || suffix === 'million' || suffix === 'mil'
        ? 1_000_000n
        : suffix === 'b'
          ? 1_000_000_000n
          : 1n;

  if (multiplier === 1n && fraction.length > 2) {
    throw new PriceParseError('More than two decimal places', input);
  }
  // Exact decimal maths: kobo = (whole.fraction) * multiplier * 100, rounded half-up.
  const scale = 10n ** BigInt(fraction.length);
  const numerator = (BigInt(whole) * scale + BigInt(fraction || '0')) * multiplier * 100n;
  return assertKobo(Number(roundDiv(numerator, scale)));
}

/**
 * Parse store price text into kobo. Returns null when the text says there is no
 * price ("Contact for price"); throws PriceParseError when it can't be understood
 * or isn't in naira.
 *
 * Handles: "₦ 600,000", "₦600,000", "₦ 45,000.00", "N1.25m", "1250000", "93 K",
 * "From ₦ 13,340", "₦ 6,080 - ₦ 10,000", "NGN 15,000", "&#8358;4,500", "4.5k".
 */
export function parsePrice(input: string): ParsedPrice | null {
  if (FOREIGN_CURRENCY.test(input)) throw new PriceParseError('Not a naira price', input);
  if (input.trim() === '') return null;
  const text = clean(input);
  if (NO_PRICE.test(text) && !/\d/.test(text)) return null;
  // A currency marker with no amount means the scrape broke, not that there's no price.
  if (text === '') throw new PriceParseError('Currency marker with no amount', input);

  const isFrom = /^(?:from|starting(?: at| from)?|as low as)\b/i.test(text);
  const body = text.replace(/^(?:from|starting(?: at| from)?|as low as)\s*/i, '');

  const parts = body.split(/\s*(?:-|–|to)\s*/i).filter((p) => p !== '');
  if (parts.length === 0 || parts.length > 2) throw new PriceParseError('Unrecognised price', input);

  const amounts = parts.map((part) => {
    const match = AMOUNT.exec(part);
    if (!match || match.index !== 0 || match[0].length !== part.length) {
      throw new PriceParseError('Unrecognised price', input);
    }
    return { match, hasSuffix: match[3] !== undefined };
  });

  // "93 - 250 K": a suffix on the upper bound applies to the lower bound too.
  const [first, second] = amounts;
  const sharedSuffix = second?.match[3];
  if (first && !first.hasSuffix && sharedSuffix !== undefined) {
    first.match[3] = sharedSuffix;
  }

  const values = amounts.map(({ match }) => amountToKobo(match, input));
  const [min, max] = values as [number, number | undefined];
  if (min === 0) throw new PriceParseError('Zero price', input);

  if (max === undefined) {
    return isFrom
      ? { kind: 'from', minKobo: min, maxKobo: null }
      : { kind: 'exact', minKobo: min, maxKobo: min };
  }
  if (max < min) throw new PriceParseError('Range upper bound below lower bound', input);
  return { kind: 'range', minKobo: min, maxKobo: max };
}

/**
 * Strict single amount to kobo, e.g. toKobo("₦1,250,000") === 125_000_000.
 * Throws for ranges, "From" prices and missing prices; use parsePrice for those.
 */
export function toKobo(nairaString: string): number {
  const parsed = parsePrice(nairaString);
  if (parsed === null) throw new PriceParseError('No price', nairaString);
  if (parsed.kind !== 'exact')
    throw new PriceParseError(`Expected one amount, got a ${parsed.kind} price`, nairaString);
  return parsed.minKobo;
}

// ---------------------------------------------------------------------------
// Formatting (UI edge only)
// ---------------------------------------------------------------------------

function groupThousands(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/**
 * kobo to display text: formatNaira(125_000_000) === "₦1,250,000".
 * Whole naira unless there are leftover kobo ("₦45,000.50"). Negative amounts
 * (price changes) get a leading minus: "-₦23,000".
 */
export function formatNaira(kobo: number): string {
  if (!Number.isSafeInteger(kobo)) throw new RangeError(`Not an integer kobo amount: ${kobo}`);
  const sign = kobo < 0 ? '-' : '';
  const abs = Math.abs(kobo);
  const naira = groupThousands(String(Math.trunc(abs / KOBO_PER_NAIRA)));
  const rest = abs % KOBO_PER_NAIRA;
  return `${sign}₦${naira}${rest === 0 ? '' : `.${String(rest).padStart(2, '0')}`}`;
}

/** Display text for a parsed price: "₦8,940", "From ₦13,340", "₦6,080 – ₦10,000". */
export function formatPrice(price: ParsedPrice): string {
  if (price.kind === 'from') return `From ${formatNaira(price.minKobo)}`;
  if (price.kind === 'range' && price.maxKobo !== null) {
    return `${formatNaira(price.minKobo)} – ${formatNaira(price.maxKobo)}`;
  }
  return formatNaira(price.minKobo);
}
