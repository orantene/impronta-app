/**
 * LegacyCodesSection — the Stripe-only discount-code surface, mounted inside
 * the Discounts tab as a clearly labelled interim section.
 *
 * This is the second of the two discount systems the audit found. It writes
 * ONLY to Stripe (no `product_discounts` row), which is why codes minted here
 * are invisible to the `?promo=` funnel above it. It is kept mounted rather
 * than deleted for one reason: the codes it can list are real and live, and the
 * consolidation pass imports them into `product_discounts` before this file
 * dies. Deleting it first would strand them.
 *
 * The old standalone page carried the heading, the "Stripe not configured"
 * amber notice and the list-error banner. Those move here so the section is
 * self-explaining; the shell below it is unchanged.
 */

import { isStripeConfigured } from "@/lib/stripe/client";
import { getRequestLocale } from "@/i18n/request-locale";
import { createTranslator } from "@/i18n/messages";
import { interpolate } from "@/i18n/interpolate";
import { HQ, F, FD } from "../../_tokens";
import { listPlatformDiscountCodes, type DiscountCodeSummary } from "./actions";
import { DiscountCodeShell } from "./DiscountCodeShell";

export async function LegacyCodesSection() {
  const stripeReady = isStripeConfigured();

  let codes: DiscountCodeSummary[] = [];
  let listError: string | null = null;
  if (stripeReady) {
    const list = await listPlatformDiscountCodes();
    if (list.ok) codes = list.data;
    else listError = list.error;
  }

  const t = createTranslator(await getRequestLocale());

  return (
    <section
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 16,
        fontFamily: F,
        color: HQ.ink,
        borderTop: `1px solid ${HQ.borderSoft}`,
        paddingTop: 22,
        marginTop: 4,
      }}
    >
      <div>
        <div
          style={{
            fontSize: 10.5,
            fontWeight: 700,
            letterSpacing: 0.7,
            textTransform: "uppercase",
            color: HQ.green,
            marginBottom: 6,
          }}
        >
          {t("dashboard.platform.billing.discountCodes.eyebrow")}
        </div>
        <h2
          style={{
            fontFamily: FD,
            fontSize: 18,
            fontWeight: 600,
            margin: 0,
            letterSpacing: -0.3,
          }}
        >
          {t("dashboard.platform.billing.discountCodes.title")}
        </h2>
        <p
          style={{
            margin: "6px 0 0",
            fontSize: 12.5,
            color: HQ.inkMuted,
            maxWidth: 760,
            lineHeight: 1.55,
          }}
        >
          {t("dashboard.platform.billing.discountCodes.subtitle")}
        </p>
      </div>

      {!stripeReady && (
        <div
          style={{
            background: "rgba(232,184,100,0.06)",
            border: "1px solid rgba(232,184,100,0.18)",
            borderRadius: 12,
            padding: 14,
            color: HQ.amber,
            fontSize: 13,
          }}
        >
          {t("dashboard.platform.billing.discountCodes.notConfigured")}
        </div>
      )}

      {stripeReady && listError && (
        <div
          style={{
            background: "rgba(243,103,114,0.06)",
            border: "1px solid rgba(243,103,114,0.18)",
            borderRadius: 12,
            padding: 14,
            color: HQ.red,
            fontSize: 13,
          }}
        >
          {interpolate(t("dashboard.platform.billing.discountCodes.loadFailed"), {
            error: listError,
          })}
        </div>
      )}

      <DiscountCodeShell initialCodes={codes} stripeReady={stripeReady} />
    </section>
  );
}
