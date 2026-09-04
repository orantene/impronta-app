/**
 * What a code brought in. Pure shaping; the caller does the reads.
 *
 * WHY THE MONEY COLUMN IS ABSENT RATHER THAN ZERO
 * Attribution needs `orders.link_id`, which is the Orders & Checkout Manager's
 * column and their write — I resolve the link and hand the id over, I do not
 * write their table. Until that column exists there is no way to know what a
 * code earned.
 *
 * So `broughtIn` is `null`, and every renderer must show an em-less "not
 * measured yet" rather than "$0". A zero is a MEASUREMENT: it says this code
 * earned nothing, which is a claim about the world. An absent value says we
 * did not measure, which is the truth. An operator who sees $0 next to a busy
 * table concludes the code is broken and stops printing them.
 */

export type ScanRow = {
  scanned_at: string;
  device_class: string;
  is_nfc: boolean;
  country: string | null;
  session_key: string | null;
  resolved_to: string | null;
};

export type LinkPerformance = {
  scans: number;
  /**
   * Distinct visitors, when it can be known. `null` when scans carry no
   * session key — which is the case whenever LINK_SCAN_SALT is unset, because
   * `scanSessionKey` refuses to fall back to an unsalted hash of an IP.
   * Reporting scans as visitors would overstate reach every time someone
   * refreshes.
   */
  visitors: number | null;
  /** Share of scans that were an NFC tap rather than a camera. */
  nfcTaps: number;
  byDevice: Record<string, number>;
  byCountry: Record<string, number>;
  /** Local-hour histogram, 24 entries, for "when is this code used". */
  byHour: number[];
  /** What the rules actually served, so a retarget can be judged. */
  byDestination: Record<string, number>;
  /** Always null until orders.link_id exists. Never 0. */
  broughtInCents: null;
};

/**
 * Summarise scans for one link.
 *
 * `hourOf` converts a timestamp to the VENUE's local hour and is passed in,
 * because "when is this code used" means local time — a peak at 21:00 in
 * Cancun is not a peak at 21:00 UTC, and this whole area learned that lesson
 * in the resolver.
 */
export function summariseScans(
  rows: readonly ScanRow[],
  hourOf: (iso: string) => number,
): LinkPerformance {
  const byDevice: Record<string, number> = {};
  const byCountry: Record<string, number> = {};
  const byDestination: Record<string, number> = {};
  const byHour = new Array<number>(24).fill(0);
  const sessions = new Set<string>();
  let sessionless = 0;
  let nfcTaps = 0;

  for (const row of rows) {
    byDevice[row.device_class] = (byDevice[row.device_class] ?? 0) + 1;
    if (row.country) byCountry[row.country] = (byCountry[row.country] ?? 0) + 1;
    if (row.resolved_to) {
      byDestination[row.resolved_to] = (byDestination[row.resolved_to] ?? 0) + 1;
    }
    const h = hourOf(row.scanned_at);
    if (Number.isInteger(h) && h >= 0 && h < 24) byHour[h] += 1;
    if (row.is_nfc) nfcTaps += 1;
    if (row.session_key) sessions.add(row.session_key);
    else sessionless += 1;
  }

  return {
    scans: rows.length,
    // If ANY scan lacks a session key the distinct count is unknowable, not
    // "the ones we happen to have". A partial count reported as a total is the
    // same class of lie as a zero reported as a measurement.
    visitors: sessionless > 0 ? null : sessions.size,
    nfcTaps,
    byDevice,
    byCountry,
    byHour,
    byDestination,
    broughtInCents: null,
  };
}

/**
 * How a performance figure should be rendered when it is not measurable.
 * Centralised so no surface invents "$0.00" for an absent value.
 */
export function formatBroughtIn(
  cents: number | null,
  currency: string,
  locale: string,
): { text: string; measured: boolean } {
  if (cents === null) {
    return {
      text: locale.startsWith("es") ? "Sin datos todavía" : "Not measured yet",
      measured: false,
    };
  }
  return {
    text: new Intl.NumberFormat(locale, { style: "currency", currency }).format(cents / 100),
    measured: true,
  };
}
