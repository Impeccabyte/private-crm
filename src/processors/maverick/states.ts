/**
 * Maverick addresses carry its own numeric state id (e.g. 44 = Texas), not the postal code.
 * The adapter loads the real list from GET /api/country/{countryId}/states; this table is only the fallback
 * for US states (Maverick numbers them alphabetically, with DC at 9; 1–30 are in Maverick's API docs,
 * the rest follow the same order, and 44 = TX matches live data).
 */
export const US_COUNTRY_ID = 199;

const US_ORDER = ["AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "DC", "FL", "GA", "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME",
  "MD", "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ", "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI",
  "SC", "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY"];

export const US_STATE_FALLBACK: ReadonlyMap<string, string> = new Map(US_ORDER.map((code, i) => [String(i + 1), code]));

/** Turns whatever Maverick sent into a postal code: "TX" stays, 44 → "TX". Unknown ids become null rather than a number. */
export function stateCode(raw: unknown, lookup?: ReadonlyMap<string, string>): string | null {
  if (raw == null || raw === "") return null;
  const v = String(raw).trim();
  if (/^[A-Za-z]{2}$/.test(v)) return v.toUpperCase();
  if (/^\d+$/.test(v)) return lookup?.get(v) ?? US_STATE_FALLBACK.get(v) ?? null;
  return v.length <= 3 ? v.toUpperCase() : v; // e.g. a full state name from free-text data
}
