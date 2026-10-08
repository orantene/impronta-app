/**
 * TUL-281 follow-up: the ONE way the messages-v5 module shows an amount.
 *
 * Every order / offer / payment view-model in `lib/messages-v5` and
 * `components/messages-v5` carries the record's own `currencyCode`; this turns
 * minor units plus that code into the shared dashboard format ("$850 MXN").
 * A record with no usable currency falls back to the platform currency, and
 * the code is still shown, so a fallback is visible rather than silently USD.
 *
 * Chain: formatRecordMoney -> formatOfferMoney -> formatDashboardMoney.
 * `currencyCode` is deliberately a REQUIRED positional argument (null is a
 * legal value, omission is not), so a new call site cannot forget it.
 */

import { formatOfferMoney, normalizeCurrencyCode, PLATFORM_FALLBACK_CURRENCY } from "@/lib/inquiry/offer-currency";
import { minorUnitDivisor } from "@/lib/orders/money-format";

/** The ISO code a record displays in: its own, else the platform currency. */
export function recordCurrency(currencyCode: string | null | undefined): string {
  return normalizeCurrencyCode(currencyCode) ?? PLATFORM_FALLBACK_CURRENCY;
}

/** Minor units (cents) in a record's currency to "$850 MXN". */
export function formatRecordMoney(cents: number, currencyCode: string | null | undefined): string {
  const code = recordCurrency(currencyCode);
  const safe = Number.isFinite(cents) ? cents : 0;
  return formatOfferMoney(safe / minorUnitDivisor(code), code);
}
