"use client";

/**
 * DiscountsTab — Phase 3 UI for the Product Pricing dashboard.
 *
 * Replaces the Phase 1 placeholder. Renders a table of every code in
 * `product_discounts` (via the Phase 1 `loadProductDiscounts` reader)
 * with an inline "+ New code" form. Each row has an Archive button.
 *
 * Stripe sync is automatic on create — when a key is present, the
 * matching Coupon + Promotion Code are created; when stubbed, the
 * row saves to DB only and shows a yellow "Saved in DB" chip.
 *
 * Out of scope for Phase 3 (deferred to Phase 4+):
 *   - tier-scope picker (creates always default to "all" tiers)
 *   - inline edit of an existing code (Stripe Coupons are mutable for
 *     name/metadata only, not value — so an "edit" is really
 *     "archive + create new")
 */

import { useState, useTransition } from "react";
import type { PricingDiscountRow } from "@/lib/pricing/pricing-types";
import {
  createDiscount,
  archiveDiscount,
} from "@/lib/server-actions/admin-product-discounts";
import {
  DEFAULT_CURRENCY_OPTIONS,
  type DefaultCurrencyCode,
} from "@/lib/billing/currencies";
import { useT } from "@/i18n/use-t";
import { interpolate, type Translator } from "@/i18n/interpolate";
import { HQ, F, FD } from "../_tokens";
import { Pill, SectionLabel, Field, inputStyle, EmptyHint } from "../_primitives";

export function DiscountsTab({
  discounts,
}: {
  discounts: PricingDiscountRow[];
}) {
  const t = useT();
  const active = discounts.filter((d) => d.isActive);
  const archived = discounts.filter((d) => !d.isActive);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
      <NewDiscountForm />

      <SectionLabel
        title={t("dashboard.platform.pricing.discountsTab.activeCodesTitle")}
        hint={interpolate(
          t("dashboard.platform.pricing.discountsTab.activeCodesHint"),
          { active: active.length, total: discounts.length },
        )}
      />
      {active.length === 0 ? (
        <EmptyHint
          text={t("dashboard.platform.pricing.discountsTab.emptyActive")}
        />
      ) : (
        <DiscountTable rows={active} />
      )}

      {archived.length > 0 && (
        <details
          style={{
            background: HQ.cardSoft,
            border: `1px solid ${HQ.borderSoft}`,
            borderRadius: 10,
            padding: 12,
            color: HQ.inkMuted,
            fontSize: 12,
            fontFamily: F,
          }}
        >
          <summary style={{ cursor: "pointer" }}>
            {interpolate(
              t("dashboard.platform.pricing.discountsTab.archivedSummary"),
              { count: archived.length },
            )}
          </summary>
          <div style={{ marginTop: 10 }}>
            <DiscountTable rows={archived} dimmed />
          </div>
        </details>
      )}
    </div>
  );
}

// ─── DiscountTable ───────────────────────────────────────────────────────────

function DiscountTable({
  rows,
  dimmed,
}: {
  rows: PricingDiscountRow[];
  dimmed?: boolean;
}) {
  const t = useT();
  return (
    <div
      role="table"
      style={{
        background: HQ.card,
        border: `1px solid ${HQ.borderSoft}`,
        borderRadius: 12,
        overflow: "hidden",
        fontFamily: F,
        opacity: dimmed ? 0.65 : 1,
      }}
    >
      <div
        role="row"
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(110px, 1.2fr) 90px 1fr 130px 1fr 1fr auto",
          gap: 12,
          padding: "10px 14px",
          borderBottom: `1px solid ${HQ.borderSoft}`,
          fontSize: 10.5,
          fontWeight: 600,
          color: HQ.inkMuted,
          textTransform: "uppercase",
          letterSpacing: 0.6,
        }}
      >
        <span>{t("dashboard.platform.pricing.discountsTab.colCode")}</span>
        <span>{t("dashboard.platform.pricing.discountsTab.colKind")}</span>
        <span>{t("dashboard.platform.pricing.discountsTab.colValue")}</span>
        <span>{t("dashboard.platform.pricing.discountsTab.colUses")}</span>
        <span>{t("dashboard.platform.pricing.discountsTab.colWindow")}</span>
        <span>{t("dashboard.platform.pricing.discountsTab.colStripe")}</span>
        <span></span>
      </div>
      {rows.map((d) => (
        <DiscountRow key={d.id} row={d} dimmed={dimmed} />
      ))}
    </div>
  );
}

function formatValue(d: PricingDiscountRow, t: Translator): string {
  if (d.kind === "percent")
    return interpolate(t("dashboard.platform.pricing.discountsTab.percentOff"), {
      value: d.value,
    });
  if (d.kind === "fixed")
    return interpolate(t("dashboard.platform.pricing.discountsTab.fixedOff"), {
      currency: d.currency ?? "USD",
      value: d.value,
    });
  const n = Math.round(d.value);
  return interpolate(
    t(
      n === 1
        ? "dashboard.platform.pricing.discountsTab.monthsFreeOne"
        : "dashboard.platform.pricing.discountsTab.monthsFreeMany",
    ),
    { count: n },
  );
}

function formatWindow(d: PricingDiscountRow, t: Translator): string {
  const fmt = (iso: string | null) =>
    iso ? new Date(iso).toISOString().slice(0, 10) : null;
  const s = fmt(d.startsAt);
  const e = fmt(d.endsAt);
  if (!s && !e) return t("dashboard.platform.pricing.discountsTab.windowAlways");
  if (s && !e)
    return interpolate(
      t("dashboard.platform.pricing.discountsTab.windowFrom"),
      { date: s },
    );
  if (!s && e)
    return interpolate(
      t("dashboard.platform.pricing.discountsTab.windowUntil"),
      { date: e },
    );
  return interpolate(t("dashboard.platform.pricing.discountsTab.windowRange"), {
    from: s,
    to: e,
  });
}

function DiscountRow({
  row,
  dimmed,
}: {
  row: PricingDiscountRow;
  dimmed?: boolean;
}) {
  const t = useT();
  const [state, setState] = useState<"idle" | "confirm" | "archiving" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const stripeOk = row.stripePromotionCodeId !== null;
  const usesLabel =
    row.maxRedemptions != null
      ? `${row.redemptionCount}/${row.maxRedemptions}`
      : `${row.redemptionCount}/∞`;

  function doArchive() {
    setState("archiving");
    setErrorMsg(null);
    startTransition(async () => {
      const res = await archiveDiscount({ discountId: row.id });
      if (!res.ok) {
        setState("error");
        setErrorMsg(res.error);
      }
      // Success: page revalidates and row disappears from `active` array.
    });
  }

  return (
    <div
      role="row"
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(110px, 1.2fr) 90px 1fr 130px 1fr 1fr auto",
        gap: 12,
        padding: "12px 14px",
        borderTop: `1px solid ${HQ.borderSoft}`,
        fontSize: 12.5,
        color: HQ.ink,
        alignItems: "center",
      }}
    >
      <code
        style={{
          fontSize: 12,
          color: HQ.ink,
          background: HQ.cardSoft,
          padding: "2px 7px",
          borderRadius: 4,
          fontFamily: "ui-monospace, SFMono-Regular, monospace",
          width: "fit-content",
        }}
      >
        {row.code}
      </code>
      <Pill
        color={
          row.kind === "percent"
            ? HQ.green
            : row.kind === "fixed"
              ? HQ.blue
              : HQ.amber
        }
      >
        {row.kind === "free_months"
          ? t("dashboard.platform.pricing.discountsTab.kindFree")
          : row.kind}
      </Pill>
      <span style={{ fontFamily: F, fontVariantNumeric: "tabular-nums" }}>
        {formatValue(row, t)}
      </span>
      <span style={{ color: HQ.inkMuted, fontVariantNumeric: "tabular-nums" }}>
        {usesLabel}
      </span>
      <span style={{ color: HQ.inkMuted, fontSize: 11.5 }}>
        {formatWindow(row, t)}
      </span>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: stripeOk ? HQ.green : HQ.amber,
            display: "inline-block",
          }}
          aria-hidden
        />
        <span style={{ fontSize: 11, color: HQ.inkMuted }}>
          {stripeOk
            ? t("dashboard.platform.pricing.discountsTab.synced")
            : t("dashboard.platform.pricing.discountsTab.dbOnly")}
        </span>
      </span>
      {dimmed ? (
        <span style={{ fontSize: 10.5, color: HQ.inkDim }}>
          {t("dashboard.platform.pricing.discountsTab.archivedLabel")}
        </span>
      ) : state === "confirm" ? (
        <div style={{ display: "flex", gap: 4 }}>
          <button
            type="button"
            onClick={doArchive}
            style={{
              background: HQ.red,
              color: HQ.bg,
              border: "none",
              borderRadius: 4,
              padding: "3px 8px",
              fontSize: 10.5,
              cursor: "pointer",
              fontWeight: 600,
            }}
          >
            {t("dashboard.platform.pricing.discountsTab.confirm")}
          </button>
          <button
            type="button"
            onClick={() => setState("idle")}
            style={{
              background: "transparent",
              color: HQ.inkMuted,
              border: `1px solid ${HQ.borderSoft}`,
              borderRadius: 4,
              padding: "3px 8px",
              fontSize: 10.5,
              cursor: "pointer",
            }}
          >
            {t("dashboard.platform.pricing.discountsTab.cancel")}
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setState("confirm")}
          disabled={state === "archiving"}
          style={{
            background: "transparent",
            color: HQ.inkDim,
            border: "none",
            padding: 0,
            fontSize: 11,
            cursor: state === "archiving" ? "wait" : "pointer",
            textDecoration: "underline",
          }}
        >
          {state === "archiving"
            ? t("dashboard.platform.pricing.discountsTab.archiving")
            : state === "error"
              ? interpolate(
                  t("dashboard.platform.pricing.discountsTab.archiveFailed"),
                  { error: errorMsg ?? "" },
                )
              : t("dashboard.platform.pricing.discountsTab.archive")}
        </button>
      )}
    </div>
  );
}

// ─── NewDiscountForm ────────────────────────────────────────────────────────

function NewDiscountForm() {
  const t = useT();
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{
          background: HQ.ink,
          color: HQ.bg,
          border: "none",
          borderRadius: 8,
          padding: "10px 16px",
          fontSize: 13,
          fontFamily: F,
          fontWeight: 600,
          cursor: "pointer",
          width: "fit-content",
        }}
      >
        {t("dashboard.platform.pricing.discountsTab.newCode")}
      </button>
    );
  }
  return <NewDiscountFormFields onCancel={() => setOpen(false)} />;
}

function NewDiscountFormFields({ onCancel }: { onCancel: () => void }) {
  const t = useT();
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [kind, setKind] = useState<"percent" | "fixed" | "free_months">("percent");
  const [value, setValue] = useState("");
  const [currency, setCurrency] = useState<DefaultCurrencyCode>("USD");
  const [maxRedemptions, setMaxRedemptions] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [state, setState] = useState<"idle" | "saving" | "saved" | "stub" | "error">(
    "idle",
  );
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [stubMsg, setStubMsg] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const valueNumber = Number(value);
  const validValue =
    /^[0-9]+(\.[0-9]{1,2})?$/.test(value) && valueNumber > 0;
  const validCode = /^[a-zA-Z0-9_-]{3,32}$/.test(code);
  const validName = name.trim().length > 0;
  const canSave = validCode && validName && validValue && state !== "saving";

  function save() {
    setState("saving");
    setErrorMsg(null);
    setStubMsg(null);
    startTransition(async () => {
      const isoOrNull = (s: string) => {
        if (!s) return null;
        try {
          return new Date(s).toISOString();
        } catch {
          return null;
        }
      };
      const res = await createDiscount({
        code,
        name,
        kind,
        value: valueNumber,
        currency: kind === "fixed" ? currency : undefined,
        maxRedemptions: maxRedemptions
          ? Math.max(1, Math.floor(Number(maxRedemptions)))
          : undefined,
        startsAt: isoOrNull(startsAt),
        endsAt: isoOrNull(endsAt),
      });
      if (!res.ok) {
        setState("error");
        setErrorMsg(res.error);
        return;
      }
      if (res.stripe.stub) {
        setState("stub");
        setStubMsg(
          res.stripe.reason ??
            t("dashboard.platform.pricing.discountsTab.savedDbOnlyDefault"),
        );
      } else {
        setState("saved");
      }
      // Clear after a short pause + close the form so the new row in
      // the page-revalidated table is what the user sees next.
      setTimeout(() => {
        onCancel();
      }, 1800);
    });
  }

  return (
    <div
      style={{
        background: HQ.cardElevated,
        border: `1px solid ${HQ.borderHover}`,
        borderRadius: 12,
        padding: 16,
        display: "flex",
        flexDirection: "column",
        gap: 14,
      }}
    >
      <div
        style={{
          fontFamily: FD,
          fontSize: 14,
          fontWeight: 600,
          color: HQ.ink,
        }}
      >
        {t("dashboard.platform.pricing.discountsTab.newCodeTitle")}
      </div>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <Field label={t("dashboard.platform.pricing.discountsTab.codeField")}>
          <input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="LATAM50"
            style={{ ...inputStyle(), width: 200 }}
            maxLength={32}
          />
        </Field>
        <Field label={t("dashboard.platform.pricing.discountsTab.internalName")}>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("dashboard.platform.pricing.discountsTab.internalNamePlaceholder")}
            style={{ ...inputStyle(), width: 260 }}
            maxLength={80}
          />
        </Field>
      </div>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <Field label={t("dashboard.platform.pricing.discountsTab.kindField")}>
          <select
            value={kind}
            onChange={(e) =>
              setKind(e.target.value as "percent" | "fixed" | "free_months")
            }
            style={{ ...inputStyle(), width: 160 }}
          >
            <option value="percent">
              {t("dashboard.platform.pricing.discountsTab.kindPercent")}
            </option>
            <option value="fixed">
              {t("dashboard.platform.pricing.discountsTab.kindFixed")}
            </option>
            <option value="free_months">
              {t("dashboard.platform.pricing.discountsTab.kindMonths")}
            </option>
          </select>
        </Field>
        <Field
          label={
            kind === "percent"
              ? t("dashboard.platform.pricing.discountsTab.valuePercent")
              : kind === "fixed"
                ? t("dashboard.platform.pricing.discountsTab.valueFixed")
                : t("dashboard.platform.pricing.discountsTab.valueMonths")
          }
        >
          <input
            type="text"
            inputMode="decimal"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={kind === "percent" ? "50" : kind === "fixed" ? "10" : "3"}
            style={{ ...inputStyle(), width: 120 }}
          />
        </Field>
        {kind === "fixed" && (
          <Field label={t("dashboard.platform.pricing.discountsTab.currencyField")}>
            <select
              value={currency}
              onChange={(e) =>
                setCurrency(e.target.value as DefaultCurrencyCode)
              }
              style={{ ...inputStyle(), width: 110 }}
            >
              {DEFAULT_CURRENCY_OPTIONS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </Field>
        )}
        <Field label={t("dashboard.platform.pricing.discountsTab.maxRedemptions")}>
          <input
            type="text"
            inputMode="numeric"
            value={maxRedemptions}
            onChange={(e) =>
              setMaxRedemptions(e.target.value.replace(/[^0-9]/g, ""))
            }
            placeholder={t("dashboard.platform.pricing.discountsTab.maxRedemptionsPlaceholder")}
            style={{ ...inputStyle(), width: 140 }}
          />
        </Field>
      </div>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <Field label={t("dashboard.platform.pricing.discountsTab.startsAt")}>
          <input
            type="datetime-local"
            value={startsAt}
            onChange={(e) => setStartsAt(e.target.value)}
            style={{ ...inputStyle(), width: 220 }}
          />
        </Field>
        <Field label={t("dashboard.platform.pricing.discountsTab.endsAt")}>
          <input
            type="datetime-local"
            value={endsAt}
            onChange={(e) => setEndsAt(e.target.value)}
            style={{ ...inputStyle(), width: 220 }}
          />
        </Field>
      </div>

      <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 4 }}>
        <button
          type="button"
          onClick={save}
          disabled={!canSave}
          style={{
            background: canSave ? HQ.ink : "transparent",
            color: canSave ? HQ.bg : HQ.inkMuted,
            border: canSave ? "none" : `1px solid ${HQ.borderHover}`,
            borderRadius: 6,
            padding: "9px 16px",
            fontFamily: F,
            fontSize: 12.5,
            cursor: canSave ? "pointer" : "default",
            fontWeight: 600,
          }}
        >
          {state === "saving"
            ? t("dashboard.platform.pricing.discountsTab.creating")
            : t("dashboard.platform.pricing.discountsTab.createCode")}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={state === "saving"}
          style={{
            background: "transparent",
            color: HQ.inkMuted,
            border: `1px solid ${HQ.borderSoft}`,
            borderRadius: 6,
            padding: "9px 14px",
            fontFamily: F,
            fontSize: 12.5,
            cursor: state === "saving" ? "default" : "pointer",
          }}
        >
          {t("dashboard.platform.pricing.discountsTab.cancel")}
        </button>
        {state === "saved" && (
          <span style={{ fontSize: 11.5, color: HQ.green }}>
            ✓ {t("dashboard.platform.pricing.discountsTab.createdSynced")}
          </span>
        )}
        {state === "stub" && (
          <span style={{ fontSize: 11.5, color: HQ.amber, lineHeight: 1.4 }}>
            ✓{" "}
            {interpolate(
              t("dashboard.platform.pricing.discountsTab.savedDbOnly"),
              { detail: stubMsg ?? "" },
            )}
          </span>
        )}
        {state === "error" && (
          <span style={{ fontSize: 11.5, color: HQ.red, lineHeight: 1.4 }}>
            {errorMsg}
          </span>
        )}
      </div>
    </div>
  );
}
