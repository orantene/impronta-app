"use client";

import * as React from "react";
import {
  createPlatformDiscountCode,
  disablePlatformDiscountCode,
  type DiscountCodeSummary,
  type CreateDiscountCodeArgs,
} from "./actions";
import { useT } from "@/i18n/use-t";
import { interpolate, type Translator } from "@/i18n/interpolate";

const HQ = {
  card:       "#16161A",
  cardSoft:   "rgba(255,255,255,0.04)",
  border:     "rgba(255,255,255,0.10)",
  borderSoft: "rgba(255,255,255,0.06)",
  ink:        "#F5F2EB",
  inkMuted:   "rgba(245,242,235,0.62)",
  inkDim:     "rgba(245,242,235,0.38)",
  green:      "#5DD3A0",
  amber:      "#F0B461",
  red:        "#F36772",
} as const;

const F = '"Inter", system-ui, sans-serif';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function describeDiscount(code: DiscountCodeSummary, t: Translator): string {
  if (code.percentOff != null)
    return interpolate(t("dashboard.platform.billing.discountCodes.descPercentOff"), {
      value: code.percentOff,
    });
  if (code.amountOffCents != null && code.currency)
    return interpolate(t("dashboard.platform.billing.discountCodes.descAmountOff"), {
      amount: (code.amountOffCents / 100).toLocaleString("en-US", {
        style: "currency",
        currency: code.currency.toUpperCase(),
      }),
    });
  return "—";
}

function describeDuration(code: DiscountCodeSummary, t: Translator): string {
  if (code.duration === "once")
    return t("dashboard.platform.billing.discountCodes.durFirstInvoice");
  if (code.duration === "forever")
    return t("dashboard.platform.billing.discountCodes.durEveryRenewal");
  if (code.duration === "repeating" && code.durationInMonths)
    return interpolate(
      t(
        code.durationInMonths === 1
          ? "dashboard.platform.billing.discountCodes.durMonthsOne"
          : "dashboard.platform.billing.discountCodes.durMonthsMany",
      ),
      { count: code.durationInMonths },
    );
  return code.duration;
}

// ─── Shell ────────────────────────────────────────────────────────────────────

export function DiscountCodeShell({
  initialCodes,
  stripeReady,
}: {
  initialCodes: DiscountCodeSummary[];
  stripeReady: boolean;
}) {
  const t = useT();
  const [codes, setCodes] = React.useState<DiscountCodeSummary[]>(initialCodes);
  const [showForm, setShowForm] = React.useState(false);
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState<string | null>(null);

  const visibleCodes = codes.filter((c) => c.active);
  const archivedCodes = codes.filter((c) => !c.active);

  function handleDisable(promotionCodeId: string, code: string) {
    if (
      !confirm(
        interpolate(
          t("dashboard.platform.billing.discountCodes.disablePrompt"),
          { code },
        ),
      )
    )
      return;
    setError(null);
    startTransition(async () => {
      const result = await disablePlatformDiscountCode(promotionCodeId);
      if (result.ok) {
        setCodes((prev) =>
          prev.map((c) => (c.promotionCodeId === promotionCodeId ? { ...c, active: false } : c)),
        );
        setSuccess(
          interpolate(
            t("dashboard.platform.billing.discountCodes.disabledToast"),
            { code },
          ),
        );
      } else {
        setError(result.error);
      }
    });
  }

  function handleCreated(newCode: DiscountCodeSummary) {
    setCodes((prev) => [newCode, ...prev]);
    setSuccess(
      interpolate(t("dashboard.platform.billing.discountCodes.mintedToast"), {
        code: newCode.code,
      }),
    );
    setShowForm(false);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {/* Top toolbar */}
      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <button
          type="button"
          onClick={() => {
            setShowForm((v) => !v);
            setError(null);
            setSuccess(null);
          }}
          disabled={!stripeReady}
          style={{
            background: showForm ? "transparent" : HQ.green,
            color: showForm ? HQ.ink : "#0F0F11",
            border: showForm ? `1px solid ${HQ.border}` : "none",
            padding: "8px 14px",
            borderRadius: 8,
            fontSize: 13,
            fontWeight: 600,
            fontFamily: F,
            cursor: stripeReady ? "pointer" : "not-allowed",
            opacity: stripeReady ? 1 : 0.5,
          }}
        >
          {showForm
            ? t("dashboard.platform.billing.discountCodes.cancel")
            : t("dashboard.platform.billing.discountCodes.mintNew")}
        </button>
        <span style={{ fontSize: 12, color: HQ.inkDim, fontFamily: F }}>
          {interpolate(
            t("dashboard.platform.billing.discountCodes.countSummary"),
            { active: visibleCodes.length, disabled: archivedCodes.length },
          )}
        </span>
      </div>

      {success && (
        <div
          style={{
            background: "rgba(93,211,160,0.08)",
            border: `1px solid rgba(93,211,160,0.22)`,
            borderRadius: 10,
            padding: 12,
            fontSize: 13,
            color: HQ.green,
            fontFamily: F,
          }}
        >
          {success}
        </div>
      )}
      {error && (
        <div
          style={{
            background: "rgba(243,103,114,0.08)",
            border: `1px solid rgba(243,103,114,0.22)`,
            borderRadius: 10,
            padding: 12,
            fontSize: 13,
            color: HQ.red,
            fontFamily: F,
          }}
        >
          {error}
        </div>
      )}

      {showForm && (
        <CreateForm
          pending={pending}
          onSubmit={(args) => {
            setError(null);
            setSuccess(null);
            startTransition(async () => {
              const result = await createPlatformDiscountCode(args);
              if (result.ok) {
                handleCreated(result.data);
              } else {
                setError(result.error);
              }
            });
          }}
        />
      )}

      {/* Active codes */}
      <CodeList
        title="Active"
        label={t("dashboard.platform.billing.discountCodes.titleActive")}
        codes={visibleCodes}
        pending={pending}
        onDisable={handleDisable}
      />

      {/* Archived */}
      {archivedCodes.length > 0 && (
        <CodeList
          title="Disabled"
          label={t("dashboard.platform.billing.discountCodes.titleDisabled")}
          codes={archivedCodes}
          pending={pending}
          onDisable={() => {}}
          hideActions
        />
      )}
    </div>
  );
}

// ─── Create form ──────────────────────────────────────────────────────────────

function CreateForm({
  onSubmit,
  pending,
}: {
  onSubmit: (args: CreateDiscountCodeArgs) => void;
  pending: boolean;
}) {
  const t = useT();
  const [code, setCode] = React.useState("");
  const [percentOff, setPercentOff] = React.useState("100");
  const [duration, setDuration] = React.useState<"once" | "forever" | "repeating">("forever");
  const [durationInMonths, setDurationInMonths] = React.useState("3");
  const [maxRedemptions, setMaxRedemptions] = React.useState("");
  const [expiresAt, setExpiresAt] = React.useState("");
  const [internalNote, setInternalNote] = React.useState("");

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!code.trim()) return;

    const parsedPercent = Number(percentOff);
    const parsedMax = maxRedemptions ? Number(maxRedemptions) : undefined;
    const parsedMonths = duration === "repeating" ? Number(durationInMonths) : undefined;

    onSubmit({
      code: code.trim().toUpperCase(),
      percentOff: parsedPercent,
      duration,
      durationInMonths: parsedMonths,
      maxRedemptions: parsedMax,
      expiresAt: expiresAt || undefined,
      internalNote: internalNote.trim() || undefined,
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      style={{
        background: HQ.card,
        border: `1px solid ${HQ.borderSoft}`,
        borderRadius: 12,
        padding: 18,
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: 14,
        fontFamily: F,
      }}
    >
      <Field label={t("dashboard.platform.billing.discountCodes.codeField")}>
        <input
          required
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder={t("dashboard.platform.billing.discountCodes.codePlaceholder")}
          style={inputStyle()}
        />
      </Field>
      <Field label={t("dashboard.platform.billing.discountCodes.percentField")}>
        <input
          required
          type="number"
          min={1}
          max={100}
          value={percentOff}
          onChange={(e) => setPercentOff(e.target.value)}
          style={inputStyle()}
        />
      </Field>

      <Field label={t("dashboard.platform.billing.discountCodes.durationField")}>
        <select
          value={duration}
          onChange={(e) => setDuration(e.target.value as "once" | "forever" | "repeating")}
          style={inputStyle()}
        >
          <option value="forever">{t("dashboard.platform.billing.discountCodes.durationForever")}</option>
          <option value="once">{t("dashboard.platform.billing.discountCodes.durationOnce")}</option>
          <option value="repeating">{t("dashboard.platform.billing.discountCodes.durationRepeating")}</option>
        </select>
      </Field>
      {duration === "repeating" ? (
        <Field label={t("dashboard.platform.billing.discountCodes.durationMonthsField")}>
          <input
            type="number"
            min={1}
            value={durationInMonths}
            onChange={(e) => setDurationInMonths(e.target.value)}
            style={inputStyle()}
          />
        </Field>
      ) : (
        <div />
      )}

      <Field label={t("dashboard.platform.billing.discountCodes.maxRedemptionsField")}>
        <input
          type="number"
          min={1}
          value={maxRedemptions}
          onChange={(e) => setMaxRedemptions(e.target.value)}
          placeholder={t("dashboard.platform.billing.discountCodes.maxRedemptionsPlaceholder")}
          style={inputStyle()}
        />
      </Field>
      <Field label={t("dashboard.platform.billing.discountCodes.expiresField")}>
        <input
          type="datetime-local"
          value={expiresAt}
          onChange={(e) => setExpiresAt(e.target.value)}
          style={inputStyle()}
        />
      </Field>

      <Field label={t("dashboard.platform.billing.discountCodes.noteField")} full>
        <input
          value={internalNote}
          onChange={(e) => setInternalNote(e.target.value)}
          placeholder={t("dashboard.platform.billing.discountCodes.notePlaceholder")}
          style={inputStyle()}
        />
      </Field>

      <div style={{ gridColumn: "1 / -1", display: "flex", gap: 10, alignItems: "center" }}>
        <button
          type="submit"
          disabled={pending}
          style={{
            background: HQ.green,
            color: "#0F0F11",
            border: "none",
            padding: "8px 16px",
            borderRadius: 8,
            fontSize: 13,
            fontWeight: 600,
            cursor: pending ? "not-allowed" : "pointer",
            opacity: pending ? 0.6 : 1,
          }}
        >
          {pending
            ? t("dashboard.platform.billing.discountCodes.minting")
            : t("dashboard.platform.billing.discountCodes.mintCode")}
        </button>
        <span style={{ fontSize: 11, color: HQ.inkDim }}>
          {t("dashboard.platform.billing.discountCodes.mintNote")}
        </span>
      </div>
    </form>
  );
}

// ─── List ─────────────────────────────────────────────────────────────────────

function CodeList({
  title,
  label,
  codes,
  pending,
  onDisable,
  hideActions,
}: {
  /** Logic discriminant (stable, never localized): "Active" | "Disabled". */
  title: string;
  /** Localized heading shown to the user. */
  label: string;
  codes: DiscountCodeSummary[];
  pending: boolean;
  onDisable: (id: string, code: string) => void;
  hideActions?: boolean;
}) {
  const t = useT();
  if (codes.length === 0 && title === "Active") {
    return (
      <div
        style={{
          background: HQ.card,
          border: `1px dashed ${HQ.border}`,
          borderRadius: 12,
          padding: 32,
          textAlign: "center",
          color: HQ.inkDim,
          fontSize: 13,
          fontFamily: F,
        }}
      >
        {t("dashboard.platform.billing.discountCodes.emptyActive")}
      </div>
    );
  }
  if (codes.length === 0) return null;

  return (
    <div>
      <div
        style={{
          fontSize: 10.5,
          fontWeight: 700,
          letterSpacing: 0.7,
          textTransform: "uppercase",
          color: HQ.inkDim,
          marginBottom: 8,
          fontFamily: F,
        }}
      >
        {label}
      </div>
      <div
        style={{
          background: HQ.card,
          border: `1px solid ${HQ.borderSoft}`,
          borderRadius: 12,
          overflow: "hidden",
        }}
      >
        {codes.map((code, idx) => (
          <div
            key={code.promotionCodeId}
            style={{
              padding: "14px 16px",
              borderTop: idx === 0 ? "none" : `1px solid ${HQ.borderSoft}`,
              display: "flex",
              alignItems: "center",
              gap: 14,
              fontFamily: F,
              opacity: code.active ? 1 : 0.55,
            }}
          >
            <div className="flex-1 min-w-0">
              <div style={{ fontSize: 14, fontWeight: 600, color: HQ.ink, letterSpacing: 0.2 }}>
                {code.code}
              </div>
              <div style={{ fontSize: 11.5, color: HQ.inkMuted, marginTop: 3 }}>
                {describeDiscount(code, t)} · {describeDuration(code, t)} ·{" "}
                {interpolate(
                  t("dashboard.platform.billing.discountCodes.redeemedSuffix"),
                  {
                    redeemed: code.timesRedeemed,
                    max:
                      code.maxRedemptions ??
                      t("dashboard.platform.billing.discountCodes.unlimited"),
                  },
                )}
                {code.expiresAt &&
                  ` · ${interpolate(
                    t("dashboard.platform.billing.discountCodes.expiresSuffix"),
                    { date: new Date(code.expiresAt).toLocaleDateString() },
                  )}`}
              </div>
              {code.metadata.internal_note && (
                <div style={{ fontSize: 11, color: HQ.inkDim, marginTop: 4, fontStyle: "italic" }}>
                  {code.metadata.internal_note}
                </div>
              )}
            </div>

            {!hideActions && code.active && (
              <button
                type="button"
                onClick={() => onDisable(code.promotionCodeId, code.code)}
                disabled={pending}
                style={{
                  background: "transparent",
                  border: `1px solid ${HQ.border}`,
                  color: HQ.inkMuted,
                  padding: "6px 11px",
                  borderRadius: 7,
                  fontSize: 12,
                  fontWeight: 500,
                  cursor: pending ? "not-allowed" : "pointer",
                }}
              >
                {t("dashboard.platform.billing.discountCodes.disable")}
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Atoms ────────────────────────────────────────────────────────────────────

function Field({
  label,
  full,
  children,
}: {
  label: string;
  full?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label style={{ gridColumn: full ? "1 / -1" : "auto", display: "flex", flexDirection: "column", gap: 6 }}>
      <span style={{ fontSize: 11, color: HQ.inkMuted, letterSpacing: 0.2 }}>{label}</span>
      {children}
    </label>
  );
}

function inputStyle(): React.CSSProperties {
  return {
    background: HQ.cardSoft,
    border: `1px solid ${HQ.border}`,
    color: HQ.ink,
    padding: "8px 10px",
    borderRadius: 7,
    fontSize: 13,
    fontFamily: F,
    outline: "none",
  };
}
