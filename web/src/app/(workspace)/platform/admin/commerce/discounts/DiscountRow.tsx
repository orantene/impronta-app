"use client";

/**
 * DiscountRow / AccountDiscountRow — one line each in the consolidated list.
 *
 * Both carry the same two honest signals the old table lacked:
 *   - a STRIPE dot (green synced / amber DB-only), because a discount that
 *     exists only in our database cannot discount anything;
 *   - the SOURCE badge on imported rows, so a code pulled in from Stripe is not
 *     mistaken for one this admin minted (its fields were never reviewed here).
 */

import { useState, useTransition } from "react";
import type { PricingDiscountRow } from "@/lib/pricing/pricing-types";
import type { AccountDiscountRow as AccountDiscountRowType } from "@/lib/billing/subscription-discounts";
import { archiveDiscount } from "@/lib/server-actions/admin-product-discounts";
import { endAccountDiscount } from "@/lib/server-actions/admin-subscription-discounts";
import { useT } from "@/i18n/use-t";
import { interpolate } from "@/i18n/interpolate";
import { HQ, F } from "../_tokens";
import { Pill } from "../_primitives";
import { ConfirmInline } from "./drawer-parts";
import {
  formatDiscountValue,
  formatAccountDiscountValue,
  formatDuration,
  formatScope,
  formatWindow,
  type DiscountTierOption,
} from "./discount-format";

const P = "dashboard.platform.commerce.discounts";

export const CODE_GRID =
  "minmax(110px, 1.1fr) 84px 1fr 110px 1fr 1fr 110px auto";
export const ACCOUNT_GRID = "minmax(140px, 1.4fr) 90px 1fr 1fr 130px auto";

export function DiscountCodeRow({
  row,
  tiers,
  dimmed,
}: {
  row: PricingDiscountRow;
  tiers: DiscountTierOption[];
  dimmed?: boolean;
}) {
  const t = useT();
  const [state, setState] = useState<"idle" | "confirm" | "busy" | "error">(
    "idle",
  );
  const [, startTransition] = useTransition();
  const stripeOk = row.stripePromotionCodeId !== null;
  const uses =
    row.maxRedemptions != null
      ? `${row.redemptionCount}/${row.maxRedemptions}`
      : `${row.redemptionCount}/∞`;

  function doArchive() {
    setState("busy");
    startTransition(async () => {
      const res = await archiveDiscount({ discountId: row.id });
      if (!res.ok) setState("error");
      // Success: the page revalidates and the row moves to Archived.
    });
  }

  return (
    <div role="row" style={rowStyle(CODE_GRID)}>
      <span style={{ display: "flex", flexDirection: "column", gap: 3 }}>
        <code style={codeChip}>{row.code}</code>
        {row.campaign && (
          <span style={{ fontSize: 10, color: HQ.inkDim }}>{row.campaign}</span>
        )}
      </span>
      <Pill
        color={
          row.kind === "percent"
            ? HQ.green
            : row.kind === "fixed"
              ? HQ.blue
              : HQ.amber
        }
      >
        {row.kind === "free_months" ? t(`${P}.kindFree`) : row.kind}
      </Pill>
      <span style={{ fontVariantNumeric: "tabular-nums" }}>
        {formatDiscountValue(row, t)}
        <span style={{ display: "block", fontSize: 10.5, color: HQ.inkDim }}>
          {formatDuration(row.duration, row.durationMonths, t)}
        </span>
      </span>
      <span style={{ color: HQ.inkMuted, fontVariantNumeric: "tabular-nums" }}>
        {uses}
        <span style={{ display: "block", fontSize: 10.5, color: HQ.inkDim }}>
          {interpolate(t(`${P}.perCustomerShort`), {
            count: row.perCustomerLimit,
          })}
        </span>
      </span>
      <span style={{ fontSize: 11.5, color: HQ.inkMuted }}>
        {formatScope(row.appliesTo, tiers, t)}
      </span>
      <span style={{ fontSize: 11.5, color: HQ.inkMuted }}>
        {formatWindow(row, t)}
      </span>
      <span style={{ display: "flex", flexDirection: "column", gap: 3 }}>
        <StripeDot ok={stripeOk} />
        {row.source === "stripe_import" && (
          <span style={{ fontSize: 10, color: HQ.inkDim }}>
            {t(`${P}.sourceImported`)}
          </span>
        )}
      </span>
      {dimmed ? (
        <span style={{ fontSize: 10.5, color: HQ.inkDim }}>
          {t(`${P}.archivedLabel`)}
        </span>
      ) : (
        <ConfirmInline
          state={state}
          idleLabel={t(`${P}.archive`)}
          busyLabel={t(`${P}.archiving`)}
          confirmLabel={t(`${P}.confirm`)}
          cancelLabel={t(`${P}.cancel`)}
          errorLabel={t(`${P}.archiveFailed`)}
          onArm={() => setState("confirm")}
          onConfirm={doArchive}
          onCancel={() => setState("idle")}
        />
      )}
    </div>
  );
}

export function AccountGrantRow({
  row,
}: {
  row: AccountDiscountRowType & { subjectLabel: string | null };
}) {
  const t = useT();
  const [state, setState] = useState<"idle" | "confirm" | "busy" | "error">(
    "idle",
  );
  const [, startTransition] = useTransition();
  const ended = row.status === "ended";

  function doEnd() {
    setState("busy");
    startTransition(async () => {
      const res = await endAccountDiscount({ discountId: row.id });
      if (!res.ok) setState("error");
    });
  }

  return (
    <div role="row" style={rowStyle(ACCOUNT_GRID)}>
      <span>
        {row.subjectLabel ?? row.tenantId ?? row.talentProfileId}
        <span style={{ display: "block", fontSize: 10.5, color: HQ.inkDim }}>
          {row.subjectType === "workspace"
            ? t(`${P}.subjectWorkspace`)
            : t(`${P}.subjectTalent`)}
        </span>
      </span>
      <Pill color={row.kind === "percent" ? HQ.green : HQ.blue}>{row.kind}</Pill>
      <span style={{ fontVariantNumeric: "tabular-nums" }}>
        {formatAccountDiscountValue(row, t)}
        <span style={{ display: "block", fontSize: 10.5, color: HQ.inkDim }}>
          {formatDuration(row.duration, row.durationMonths, t)}
        </span>
      </span>
      <span style={{ fontSize: 11.5, color: HQ.inkMuted }}>
        {row.appliedSubscriptionId
          ? t(`${P}.appliedToSubscription`)
          : t(`${P}.awaitingSubscription`)}
        {row.syncError && (
          <span style={{ display: "block", fontSize: 10.5, color: HQ.amber }}>
            {row.syncError}
          </span>
        )}
      </span>
      <StripeDot ok={row.stripeCouponId !== null} />
      {ended ? (
        <span style={{ fontSize: 10.5, color: HQ.inkDim }}>
          {t(`${P}.endedLabel`)}
        </span>
      ) : (
        <ConfirmInline
          state={state}
          idleLabel={t(`${P}.endGrant`)}
          busyLabel={t(`${P}.endingGrant`)}
          confirmLabel={t(`${P}.confirm`)}
          cancelLabel={t(`${P}.cancel`)}
          errorLabel={t(`${P}.endGrantFailed`)}
          onArm={() => setState("confirm")}
          onConfirm={doEnd}
          onCancel={() => setState("idle")}
        />
      )}
    </div>
  );
}

function StripeDot({ ok }: { ok: boolean }) {
  const t = useT();
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <span
        aria-hidden
        style={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: ok ? HQ.green : HQ.amber,
          display: "inline-block",
        }}
      />
      <span style={{ fontSize: 11, color: HQ.inkMuted }}>
        {ok ? t(`${P}.synced`) : t(`${P}.dbOnly`)}
      </span>
    </span>
  );
}

function rowStyle(grid: string): React.CSSProperties {
  return {
    display: "grid",
    gridTemplateColumns: grid,
    gap: 12,
    padding: "12px 14px",
    borderTop: `1px solid ${HQ.borderSoft}`,
    fontSize: 12.5,
    fontFamily: F,
    color: HQ.ink,
    alignItems: "center",
  };
}

const codeChip: React.CSSProperties = {
  fontSize: 12,
  color: HQ.ink,
  background: HQ.cardSoft,
  padding: "2px 7px",
  borderRadius: 4,
  fontFamily: "ui-monospace, SFMono-Regular, monospace",
  width: "fit-content",
};
