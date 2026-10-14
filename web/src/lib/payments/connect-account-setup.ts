/**
 * Connect account setup: platform-aware create terms + localized refusals.
 *
 * TUL-739: the cross-border RECIPIENT service agreement is only for an account
 * whose country differs from the platform's (MX/AR/... on the US platform).
 * An MX account on the Mexico platform is domestic, so it takes the full
 * agreement; sending `recipient` there makes Stripe refuse the account.
 *
 * Pure module (no Stripe, no DB) so it is unit-testable.
 */

import type { StripeAccountKey } from "@/lib/stripe/client";
import { payoutCountryLabel, requiresRecipientAgreement } from "./payout-countries";

/** Country the Mexico platform account is registered in. */
const PLATFORM_COUNTRY: Record<StripeAccountKey, string> = { us: "US", mx: "MX" };

export type ConnectAccountTerms = { recipientAgreement: boolean; cardPayments: boolean };

export function connectAccountTermsFor(
  country: string,
  platform: StripeAccountKey,
): ConnectAccountTerms {
  const domestic = country.trim().toUpperCase() === PLATFORM_COUNTRY[platform];
  const recipientAgreement = !domestic && requiresRecipientAgreement(country);
  return { recipientAgreement, cardPayments: !recipientAgreement };
}

/** Server-side error codes; the payouts page renders them with
 *  `payoutSetupErrorText` in the viewer's language. */
export const MX_PLATFORM_UNCONFIGURED = "payout_setup:mx_platform_unconfigured";
const COUNTRY_PREFIX = "payout_setup:country_unavailable:";

export function payoutSetupErrorCode(
  country: string,
  rail: "connect" | "global_payouts",
): string {
  return `${COUNTRY_PREFIX}${country.trim().toUpperCase()}:${rail}`;
}

function spanishCountryName(iso2: string): string {
  try {
    return new Intl.DisplayNames(["es"], { type: "region" }).of(iso2) ?? iso2;
  } catch {
    return iso2;
  }
}

export function payoutSetupErrorText(message: string, isSpanish: boolean): string {
  if (message === MX_PLATFORM_UNCONFIGURED) {
    return isSpanish
      ? "Los pagos en México aún no están activados. Escríbenos a soporte y te ayudamos."
      : "Payouts in Mexico are not switched on yet. Please contact support and we will help.";
  }
  if (message.startsWith(COUNTRY_PREFIX)) {
    const [iso2 = "", rail = "connect"] = message.slice(COUNTRY_PREFIX.length).split(":");
    if (isSpanish) {
      const name = spanishCountryName(iso2);
      return rail === "global_payouts"
        ? `${name} no admite pagos directos con Stripe. Usa "Recibe pagos en tu banco local" abajo, cubre ${name}.`
        : `Aún no podemos activar pagos en ${name}. Escríbenos a soporte y te ayudamos.`;
    }
    const name = payoutCountryLabel(iso2);
    return rail === "global_payouts"
      ? `${name} isn't supported for direct Stripe payouts. Use "Get paid to your local bank" below, it covers ${name}.`
      : `We can't switch on payouts in ${name} yet. Please contact support and we will help.`;
  }
  return message;
}
