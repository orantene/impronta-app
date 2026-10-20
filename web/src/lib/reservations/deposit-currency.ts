/**
 * The currency a table deposit is charged and shown in: FAIL CLOSED.
 *
 * `displayCurrencyFromSettings` falls back to USD for an unset or malformed
 * value, which is right for DISPLAY and wrong for a CHARGE: a Mexican venue
 * that never picked a currency would charge MXN 100 x 6 as USD 600. Here only
 * an explicitly set, valid ISO 4217 code counts; anything else is `null`, and
 * a deposit with no currency is refused (online) or not quoted (POS floor).
 */

const CODE = /^[A-Z]{3}$/;

/** The workspace's EXPLICIT display currency, or null. Never a default. */
export function explicitDisplayCurrency(settings: unknown): string | null {
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) return null;
  const raw = (settings as Record<string, unknown>).display_currency;
  if (typeof raw !== "string") return null;
  const code = raw.trim().toUpperCase();
  return CODE.test(code) ? code : null;
}

export type FloorDepositQuote =
  | { ok: true; depositCents: number; currency: string | null }
  | { ok: false; reason: "currency_not_set" };

/**
 * What the POS floor may quote. A deposit needs a known currency; a table with
 * no deposit shows no amount, so it needs none and none is invented.
 */
export function floorDepositQuote(depositCents: number, currency: string | null): FloorDepositQuote {
  if (depositCents > 0 && !currency) return { ok: false, reason: "currency_not_set" };
  return { ok: true, depositCents, currency };
}
