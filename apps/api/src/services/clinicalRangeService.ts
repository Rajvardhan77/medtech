import { evaluateRangeStatus, RangeStatus } from '@medlens/shared-types';

export interface ParsedReferenceRange {
  low: number | null;
  high: number | null;
}

/**
 * Deterministically parses common reference range string formats:
 * - "3.5 - 5.0"
 * - "13.5-17.5"
 * - "< 150" / "<= 200"
 * - "> 60" / ">= 60"
 */
export function parseReferenceRangeString(rangeStr?: string | null): ParsedReferenceRange {
  if (!rangeStr) {
    return { low: null, high: null };
  }

  const clean = rangeStr.trim();

  // Pattern: "< 150" or "<= 150"
  const lessThanMatch = clean.match(/^<(=)?\s*([0-9]+(?:\.[0-9]+)?)/i);
  if (lessThanMatch) {
    return { low: null, high: parseFloat(lessThanMatch[2]) };
  }

  // Pattern: "> 60" or ">= 60"
  const greaterThanMatch = clean.match(/^>(=)?\s*([0-9]+(?:\.[0-9]+)?)/i);
  if (greaterThanMatch) {
    return { low: parseFloat(greaterThanMatch[2]), high: null };
  }

  // Pattern: "3.5 - 5.0" or "3.5-5.0" or "3.5 to 5.0"
  const rangeMatch = clean.match(/([0-9]+(?:\.[0-9]+)?)\s*(?:-|–|to)\s*([0-9]+(?:\.[0-9]+)?)/i);
  if (rangeMatch) {
    return {
      low: parseFloat(rangeMatch[1]),
      high: parseFloat(rangeMatch[2]),
    };
  }

  return { low: null, high: null };
}

/**
 * Computes deterministic clinical range status using pure arithmetic.
 */
export function computeClinicalRangeStatus(
  numericValue: number | null | undefined,
  refLow: number | null | undefined,
  refHigh: number | null | undefined,
  rawRange?: string | null
): { status: RangeStatus; low: number | null; high: number | null } {
  let low = refLow ?? null;
  let high = refHigh ?? null;

  if (low === null && high === null && rawRange) {
    const parsed = parseReferenceRangeString(rawRange);
    low = parsed.low;
    high = parsed.high;
  }

  const status = evaluateRangeStatus(numericValue, low, high);
  return { status, low, high };
}
