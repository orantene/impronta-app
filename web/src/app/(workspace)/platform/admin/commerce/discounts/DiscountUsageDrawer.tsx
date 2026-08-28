"use client";

/**
 * DiscountUsageDrawer — who actually redeemed a code.
 *
 * The `0/30` on a discount row proved a code had been used but not by whom, so
 * "did the launch cohort redeem?" meant opening Stripe and matching
 * subscription ids by hand.
 *
 * One honesty note carried into the UI: the billing email is RESOLVED from the
 * workspace's Stripe customer record, not recorded at redemption time (the
 * ledger has a `user_id` column but the RPC that writes rows has no parameter
 * for it). Talent redemptions therefore have no email at all, and the drawer
 * says so rather than showing a blank cell that reads like missing data.
 */

import { useEffect, useState } from "react";
import { Users } from "lucide-react";
import { DrawerShell } from "@/components/admin/drawer/drawer-shell";
import { listDiscountRedemptions } from "@/lib/server-actions/admin-product-discounts";
import type { DiscountRedemptionRow } from "@/lib/billing/discount-redemptions";
import type { PricingDiscountRow } from "@/lib/pricing/pricing-types";
import { useT } from "@/i18n/use-t";
import { interpolate } from "@/i18n/interpolate";
import { HQ, F } from "../_tokens";
import { EmptyHint } from "../_primitives";

const P = "dashboard.platform.commerce.discounts";

/** Matches the loader's cap; drives the "showing the N most recent" note. */
const MAX_ROWS = 200;

export function DiscountUsageDrawer({
  row,
  onClose,
}: {
  row: PricingDiscountRow;
  onClose: () => void;
}) {
  const t = useT();
  const [rows, setRows] = useState<DiscountRedemptionRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    listDiscountRedemptions({ discountId: row.id })
      .then((res) => {
        if (!live) return;
        if (res.ok) setRows(res.redemptions);
        else setError(res.error);
      })
      .catch(() => {
        if (live) setError(t(`${P}.archiveFailed`));
      });
    return () => {
      live = false;
    };
  }, [row.id, t]);

  return (
    <DrawerShell
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title={t(`${P}.usageTitle`)}
      subtitle={interpolate(t(`${P}.usageSubtitle`), { code: row.code })}
      icon={Users}
      size="md"
    >
      <div
        style={{
          fontFamily: F,
          color: HQ.ink,
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        {error && (
          <span style={{ fontSize: 12, color: HQ.red }}>{error}</span>
        )}

        {rows === null && !error && (
          <span style={{ fontSize: 12, color: HQ.inkMuted }}>
            {t(`${P}.usageLoading`)}
          </span>
        )}

        {rows !== null && rows.length === 0 && (
          <EmptyHint text={t(`${P}.usageEmpty`)} />
        )}

        {rows !== null && rows.length > 0 && (
          <>
            <div
              style={{
                border: `1px solid ${HQ.borderSoft}`,
                borderRadius: 10,
                overflow: "hidden",
              }}
            >
              <Head />
              {rows.map((r) => (
                <Row key={r.id} r={r} />
              ))}
            </div>
            {rows.length >= MAX_ROWS && (
              <span style={{ fontSize: 11, color: HQ.inkDim }}>
                {interpolate(t(`${P}.usageCapped`), { count: MAX_ROWS })}
              </span>
            )}
            <p style={{ fontSize: 11, color: HQ.inkDim, margin: 0, lineHeight: 1.5 }}>
              {t(`${P}.emailDerivedHint`)}
            </p>
          </>
        )}
      </div>
    </DrawerShell>
  );
}

const GRID = "120px minmax(120px, 1.2fr) minmax(140px, 1.2fr) 110px";

function Head() {
  const t = useT();
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: GRID,
        gap: 10,
        padding: "9px 12px",
        borderBottom: `1px solid ${HQ.borderSoft}`,
        fontSize: 10,
        fontWeight: 600,
        letterSpacing: 0.6,
        textTransform: "uppercase",
        color: HQ.inkMuted,
      }}
    >
      <span>{t(`${P}.colWhen`)}</span>
      <span>{t(`${P}.colAccount`)}</span>
      <span>{t(`${P}.colEmail`)}</span>
      <span>{t(`${P}.colSubscription`)}</span>
    </div>
  );
}

function Row({ r }: { r: DiscountRedemptionRow }) {
  const t = useT();
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: GRID,
        gap: 10,
        padding: "9px 12px",
        borderTop: `1px solid ${HQ.borderSoft}`,
        fontSize: 12,
        alignItems: "baseline",
      }}
    >
      <span style={{ color: HQ.inkMuted, fontVariantNumeric: "tabular-nums" }}>
        {new Date(r.redeemedAt).toLocaleDateString()}
      </span>
      <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <span>{r.subjectLabel ?? "—"}</span>
        <span style={{ fontSize: 10, color: HQ.inkDim }}>
          {t(
            r.subjectType === "talent"
              ? `${P}.subjectTalent`
              : `${P}.subjectWorkspace`,
          )}
        </span>
      </span>
      <span style={{ color: r.email ? HQ.ink : HQ.inkDim }}>
        {r.email ?? "—"}
      </span>
      <span
        style={{
          fontSize: 10.5,
          color: HQ.inkDim,
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {r.stripeSubscriptionId ?? "—"}
      </span>
    </div>
  );
}
