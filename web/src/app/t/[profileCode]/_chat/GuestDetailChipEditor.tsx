"use client";

/**
 * GuestDetailChipEditor — the per-kind inline editor that pops open when a
 * guest taps a detail chip (Date / Location / Headcount / Type / Budget).
 *
 * Designed to sit INSIDE the MiniChatPanel (the floating mini-chat popup) so
 * it must be compact and non-navigating — no full-page takeover. Each kind
 * renders its own small editor UI: toggles, plain text inputs, number stepper,
 * or preset buttons. The full InquiryDrawer (with Google Places, etc.) is the
 * "Add more details →" escalation path; this is the quick-capture MVP layer.
 *
 * House rules observed:
 *   • NO gold/rust accents — accent colour passed as prop (tenant brand).
 *   • NO fake presence signals.
 *   • Hook dependency arrays are real (no suppression of the deps lint).
 *   • Inline styles only (no Tailwind admin classes) — this is a public-facing
 *     surface, not the admin shell.
 *   • Under 800 lines.
 */

import { useState, useId } from "react";
import type { Translator } from "@/i18n/interpolate";
import { accentText, C, FONT, inputStyle, primaryBtnStyle, readableOn } from "./mini-chat-styles";
import a11y from "./mini-chat-a11y.module.css";
import type { GuestChipKind, GuestChipValue } from "@/lib/inquiry/guest-chat-contract";

// ─────────────────────────────────────────────────────────────────────────────
// GuestChipKind / GuestChipValue now live in the shared contract (consolidated
// at integration) and are imported above. Re-export the local bindings so the
// existing consumers that import them from THIS module (GuestDetailChips) keep
// resolving — they now resolve to the single canonical contract type.
// ─────────────────────────────────────────────────────────────────────────────

export type { GuestChipKind, GuestChipValue };

// ─────────────────────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────────────────────

export type GuestDetailChipEditorProps = {
  kind: GuestChipKind;
  /** Current captured value to pre-fill the editor. Null = empty. */
  initial?: Partial<GuestChipValue> | null;
  /** Tenant accent color. */
  accent: string;
  /** Readable text color on accent background. */
  accentInk: string;
  /** Guest-locale translator (resolved from brand.locale). */
  t: Translator;
  onSubmit: (value: GuestChipValue) => void;
  onCancel: () => void;
};

// ─────────────────────────────────────────────────────────────────────────────
// Style constants
// ─────────────────────────────────────────────────────────────────────────────

const editorWrap: React.CSSProperties = {
  padding: "12px 14px",
  background: C.surfaceFaint,
  borderTop: `1px solid ${C.borderSoft}`,
  display: "flex",
  flexDirection: "column",
  gap: 10,
  fontFamily: FONT,
};

const labelStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: "0.04em",
  color: C.inkMuted,
  textTransform: "uppercase",
};

const rowStyle: React.CSSProperties = {
  display: "flex",
  gap: 6,
  flexWrap: "wrap",
};

const footerStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "flex-end",
  gap: 8,
  paddingTop: 4,
};

function ghostBtnStyle(): React.CSSProperties {
  return {
    height: 32,
    padding: "0 12px",
    borderRadius: 8,
    border: `1px solid ${C.border}`,
    background: "transparent",
    fontFamily: FONT,
    fontSize: 12,
    fontWeight: 500,
    color: C.inkMuted,
    cursor: "pointer",
  };
}

function toggleStyle(active: boolean, accent: string): React.CSSProperties {
  return {
    height: 30,
    padding: "0 10px",
    borderRadius: 8,
    border: active ? `1.5px solid ${accent}` : `1px solid ${C.border}`,
    background: active ? `${accent}18` : C.surface,
    fontFamily: FONT,
    fontSize: 12,
    fontWeight: active ? 600 : 400,
    // Active toggle text sits on a pale `${accent}18` tint. A bright tenant accent
    // (Impronta ships GOLD) as raw text drops to ~2.27:1 there — a WCAG 1.4.3 AA
    // failure. accentText() darkens the accent until it clears >=4.5:1 on a light
    // surface (the conservative bound for the tint); the tint itself is unchanged.
    color: active ? accentText(accent) : C.ink,
    cursor: "pointer",
    transition: "all 100ms",
  };
}

// `accent` is threaded into a CSS custom property so the co-located .focusRing
// module can paint a keyboard-focus ring in the tenant brand color. The inline
// `outline: none` (from inputStyle) keeps mouse focus ring-free; :focus-visible
// re-adds the ring for keyboard users only (WCAG 2.4.7).
function smallInputStyle(accent?: string): React.CSSProperties {
  return {
    ...inputStyle,
    height: 34,
    padding: "0 10px",
    fontSize: 13,
    ...(accent ? { ["--chat-focus-accent" as string]: accent } : {}),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Per-kind editor sub-renderers
// ─────────────────────────────────────────────────────────────────────────────

// --- Date ---

type DateStatus = "exact" | "flexible" | "not_sure";

function DateEditor({
  initial,
  accent,
  accentInk,
  t,
  onSubmit,
  onCancel,
}: {
  initial?: Partial<GuestChipValue> | null;
  accent: string;
  accentInk: string;
  t: Translator;
  onSubmit: (v: GuestChipValue) => void;
  onCancel: () => void;
}) {
  const [status, setStatus] = useState<DateStatus>(
    (initial?.dateStatus as DateStatus) ?? "exact",
  );
  const [eventDate, setEventDate] = useState<string>(initial?.eventDate ?? "");
  const inputId = useId();

  // "Exact date" needs an actual date before it can commit, otherwise it would
  // save an empty exact date that renders as "Date TBD". Flexible / Not sure yet
  // carry no date, so they stay committable.
  const canConfirm = status !== "exact" || eventDate.trim().length > 0;

  function handleConfirm() {
    if (!canConfirm) return;
    onSubmit({
      dateStatus: status,
      eventDate: status === "exact" && eventDate ? eventDate : null,
    });
  }

  const statusOptions: { value: DateStatus; label: string }[] = [
    { value: "exact", label: t("public.guestChat.dateExact") },
    { value: "flexible", label: t("public.guestChat.dateFlexible") },
    { value: "not_sure", label: t("public.guestChat.dateNotSure") },
  ];

  return (
    <div style={editorWrap}>
      <span style={labelStyle}>{t("public.guestChat.editorDateLabel")}</span>
      <div style={rowStyle}>
        {statusOptions.map((opt) => (
          <button
            key={opt.value}
            type="button"
            style={toggleStyle(status === opt.value, accent)}
            onClick={() => setStatus(opt.value)}
          >
            {opt.label}
          </button>
        ))}
      </div>
      {status === "exact" && (
        <div>
          <label htmlFor={inputId} style={{ display: "none" }}>
            {t("public.guestChat.editorDateLabel")}
          </label>
          <input
            id={inputId}
            type="date"
            value={eventDate}
            onChange={(e) => setEventDate(e.target.value)}
            className={a11y.focusRing}
            style={smallInputStyle(accent)}
          />
        </div>
      )}
      <div style={footerStyle}>
        <button type="button" style={ghostBtnStyle()} onClick={onCancel}>
          {t("public.guestChat.cancel")}
        </button>
        <button
          type="button"
          disabled={!canConfirm}
          style={{
            ...primaryBtnStyle(accent, accentInk),
            height: 32,
            padding: "0 14px",
            fontSize: 12,
            opacity: canConfirm ? 1 : 0.5,
            cursor: canConfirm ? "pointer" : "not-allowed",
          }}
          onClick={handleConfirm}
        >
          {t("public.guestChat.confirm")}
        </button>
      </div>
    </div>
  );
}

// --- Location ---

type LocationStatus = "confirmed" | "unconfirmed" | "online" | "not_sure";

function LocationEditor({
  initial,
  accent,
  accentInk,
  t,
  onSubmit,
  onCancel,
}: {
  initial?: Partial<GuestChipValue> | null;
  accent: string;
  accentInk: string;
  t: Translator;
  onSubmit: (v: GuestChipValue) => void;
  onCancel: () => void;
}) {
  const [city, setCity] = useState<string>(initial?.city ?? "");
  const [locStatus, setLocStatus] = useState<LocationStatus>(
    (initial?.locationStatus as LocationStatus) ?? "unconfirmed",
  );
  const inputId = useId();

  const statusOptions: { value: LocationStatus; label: string }[] = [
    { value: "confirmed", label: t("public.guestChat.locationConfirmed") },
    { value: "unconfirmed", label: t("public.guestChat.locationTbd") },
    { value: "online", label: t("public.guestChat.locationOnline") },
    { value: "not_sure", label: t("public.guestChat.locationNotSure") },
  ];

  function handleConfirm() {
    onSubmit({
      city: city.trim() || null,
      locationStatus: locStatus,
    });
  }

  return (
    <div style={editorWrap}>
      <span style={labelStyle}>{t("public.guestChat.editorLocationLabel")}</span>
      {locStatus !== "online" && locStatus !== "not_sure" && (
        <div>
          <label htmlFor={inputId} style={{ display: "none" }}>
            {t("public.guestChat.locationCityFieldAria")}
          </label>
          <input
            id={inputId}
            type="text"
            placeholder={t("public.guestChat.locationCityPlaceholder")}
            value={city}
            onChange={(e) => setCity(e.target.value)}
            className={a11y.focusRing}
            style={smallInputStyle(accent)}
          />
          <p style={{ margin: "4px 0 0", fontSize: 11, color: C.inkDim }}>
            {t("public.guestChat.locationCityHelper")}
          </p>
        </div>
      )}
      <div style={rowStyle}>
        {statusOptions.map((opt) => (
          <button
            key={opt.value}
            type="button"
            style={toggleStyle(locStatus === opt.value, accent)}
            onClick={() => setLocStatus(opt.value)}
          >
            {opt.label}
          </button>
        ))}
      </div>
      <div style={footerStyle}>
        <button type="button" style={ghostBtnStyle()} onClick={onCancel}>
          {t("public.guestChat.cancel")}
        </button>
        <button
          type="button"
          style={{ ...primaryBtnStyle(accent, accentInk), height: 32, padding: "0 14px", fontSize: 12 }}
          onClick={handleConfirm}
        >
          {t("public.guestChat.confirm")}
        </button>
      </div>
    </div>
  );
}

// --- Headcount ---

function HeadcountEditor({
  initial,
  accent,
  accentInk,
  t,
  onSubmit,
  onCancel,
}: {
  initial?: Partial<GuestChipValue> | null;
  accent: string;
  accentInk: string;
  t: Translator;
  onSubmit: (v: GuestChipValue) => void;
  onCancel: () => void;
}) {
  const [count, setCount] = useState<number>(initial?.headcount ?? 1);
  const inputId = useId();

  function clamp(n: number) {
    return Math.max(1, Math.min(9999, n));
  }

  return (
    <div style={editorWrap}>
      <span style={labelStyle}>{t("public.guestChat.editorHeadcountLabel")}</span>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <button
          type="button"
          aria-label={t("public.guestChat.headcountDecreaseAria")}
          style={{
            ...ghostBtnStyle(),
            width: 34,
            height: 34,
            padding: 0,
            fontSize: 18,
            borderRadius: 8,
          }}
          onClick={() => setCount((c) => clamp(c - 1))}
        >
          −
        </button>
        <label htmlFor={inputId} style={{ display: "none" }}>
          {t("public.guestChat.headcountCountAria")}
        </label>
        <input
          id={inputId}
          type="number"
          min={1}
          max={9999}
          value={count}
          onChange={(e) => {
            const n = parseInt(e.target.value, 10);
            if (!Number.isNaN(n)) setCount(clamp(n));
          }}
          className={a11y.focusRing}
          style={{ ...smallInputStyle(accent), width: 72, textAlign: "center" }}
        />
        <button
          type="button"
          aria-label={t("public.guestChat.headcountIncreaseAria")}
          style={{
            ...ghostBtnStyle(),
            width: 34,
            height: 34,
            padding: 0,
            fontSize: 18,
            borderRadius: 8,
          }}
          onClick={() => setCount((c) => clamp(c + 1))}
        >
          +
        </button>
        <span style={{ fontSize: 13, color: C.inkMuted }}>
          {count === 1
            ? t("public.guestChat.guestOne")
            : t("public.guestChat.guestOther")}
        </span>
      </div>
      <div style={footerStyle}>
        <button type="button" style={ghostBtnStyle()} onClick={onCancel}>
          {t("public.guestChat.cancel")}
        </button>
        <button
          type="button"
          style={{ ...primaryBtnStyle(accent, accentInk), height: 32, padding: "0 14px", fontSize: 12 }}
          onClick={() => onSubmit({ headcount: count })}
        >
          {t("public.guestChat.confirm")}
        </button>
      </div>
    </div>
  );
}

// --- Event Type ---

/**
 * Event-type presets. `value` is the canonical English string PERSISTED into
 * interpreted_query.source_context.ai_event_type (kept stable across locales so
 * stored data + reconcile reads stay consistent); `labelKey` is the localized
 * display label shown on the toggle.
 */
const EVENT_TYPE_PRESETS: { value: string; labelKey: string }[] = [
  { value: "Wedding", labelKey: "public.guestChat.eventTypeWedding" },
  { value: "Corporate event", labelKey: "public.guestChat.eventTypeCorporate" },
  { value: "Private dinner", labelKey: "public.guestChat.eventTypePrivateDinner" },
  { value: "Brand shoot", labelKey: "public.guestChat.eventTypeBrandShoot" },
  { value: "Birthday party", labelKey: "public.guestChat.eventTypeBirthday" },
  { value: "Product launch", labelKey: "public.guestChat.eventTypeProductLaunch" },
  { value: "Other", labelKey: "public.guestChat.eventTypeOther" },
];

function EventTypeEditor({
  initial,
  accent,
  accentInk,
  t,
  onSubmit,
  onCancel,
}: {
  initial?: Partial<GuestChipValue> | null;
  accent: string;
  accentInk: string;
  t: Translator;
  onSubmit: (v: GuestChipValue) => void;
  onCancel: () => void;
}) {
  const [selected, setSelected] = useState<string>(initial?.eventType ?? "");
  const [custom, setCustom] = useState<string>("");
  const inputId = useId();

  function handlePreset(preset: string) {
    if (preset === "Other") {
      setSelected("Other");
    } else {
      setSelected(preset);
      setCustom("");
    }
  }

  function handleConfirm() {
    const value =
      selected === "Other" ? custom.trim() || "Other" : selected || custom.trim() || null;
    onSubmit({ eventType: value || null });
  }

  return (
    <div style={editorWrap}>
      <span style={labelStyle}>{t("public.guestChat.editorEventTypeLabel")}</span>
      <div style={rowStyle}>
        {EVENT_TYPE_PRESETS.map((preset) => (
          <button
            key={preset.value}
            type="button"
            style={toggleStyle(selected === preset.value, accent)}
            onClick={() => handlePreset(preset.value)}
          >
            {t(preset.labelKey)}
          </button>
        ))}
      </div>
      {selected === "Other" && (
        <div>
          <label htmlFor={inputId} style={{ display: "none" }}>
            {t("public.guestChat.eventTypeDescribeAria")}
          </label>
          <input
            id={inputId}
            type="text"
            placeholder={t("public.guestChat.eventTypeDescribePlaceholder")}
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            className={a11y.focusRing}
            style={smallInputStyle(accent)}
            autoFocus
          />
        </div>
      )}
      <div style={footerStyle}>
        <button type="button" style={ghostBtnStyle()} onClick={onCancel}>
          {t("public.guestChat.cancel")}
        </button>
        <button
          type="button"
          style={{ ...primaryBtnStyle(accent, accentInk), height: 32, padding: "0 14px", fontSize: 12 }}
          onClick={handleConfirm}
        >
          {t("public.guestChat.confirm")}
        </button>
      </div>
    </div>
  );
}

// --- Budget ---

const CURRENCY_OPTIONS = ["USD", "EUR", "GBP", "MXN", "CAD", "AUD"];

type BudgetPreference =
  | "agency_recommends"
  | "total_budget"
  | "per_hour"
  | "per_day"
  | "per_week"
  | "per_contract"
  | "per_talent"
  | "not_sure";

function BudgetEditor({
  initial,
  accent,
  accentInk,
  t,
  onSubmit,
  onCancel,
}: {
  initial?: Partial<GuestChipValue> | null;
  accent: string;
  accentInk: string;
  t: Translator;
  onSubmit: (v: GuestChipValue) => void;
  onCancel: () => void;
}) {
  const [preference, setPreference] = useState<BudgetPreference>(
    (initial?.budgetPreference as BudgetPreference) ?? "not_sure",
  );
  const [amount, setAmount] = useState<string>(
    initial?.budgetAmount !== null && initial?.budgetAmount !== undefined
      ? String(initial.budgetAmount)
      : "",
  );
  const [currency, setCurrency] = useState<string>(initial?.currency ?? "USD");
  const amountId = useId();
  const currencyId = useId();

  const preferenceOptions: { value: BudgetPreference; label: string }[] = [
    { value: "total_budget", label: t("public.guestChat.budgetTotal") },
    { value: "per_hour", label: t("public.guestChat.budgetPerHour") },
    { value: "per_day", label: t("public.guestChat.budgetPerDay") },
    { value: "per_talent", label: t("public.guestChat.budgetPerTalent") },
    { value: "agency_recommends", label: t("public.guestChat.budgetAgencyRecommends") },
    { value: "not_sure", label: t("public.guestChat.budgetNotSure") },
  ];

  function handleConfirm() {
    const parsedAmount = parseFloat(amount.replace(/[^0-9.]/g, ""));
    onSubmit({
      budgetPreference: preference,
      budgetAmount: !Number.isNaN(parsedAmount) && parsedAmount > 0 ? parsedAmount : null,
      currency: currency || null,
    });
  }

  const showAmount =
    preference !== "not_sure" && preference !== "agency_recommends";

  return (
    <div style={editorWrap}>
      <span style={labelStyle}>{t("public.guestChat.editorBudgetLabel")}</span>
      <div style={rowStyle}>
        {preferenceOptions.map((opt) => (
          <button
            key={opt.value}
            type="button"
            style={toggleStyle(preference === opt.value, accent)}
            onClick={() => setPreference(opt.value)}
          >
            {opt.label}
          </button>
        ))}
      </div>
      {showAmount && (
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <div>
            <label htmlFor={currencyId} style={{ display: "none" }}>
              {t("public.guestChat.budgetCurrencyAria")}
            </label>
            <select
              id={currencyId}
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className={a11y.focusRing}
              style={{
                ...smallInputStyle(accent),
                width: 76,
                cursor: "pointer",
                appearance: "none",
                WebkitAppearance: "none",
              }}
            >
              {CURRENCY_OPTIONS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <label htmlFor={amountId} style={{ display: "none" }}>
              {t("public.guestChat.budgetAmountAria")}
            </label>
            <input
              id={amountId}
              type="number"
              min={0}
              placeholder={t("public.guestChat.budgetAmountPlaceholder")}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className={a11y.focusRing}
              style={{ ...smallInputStyle(accent), width: "100%" }}
            />
          </div>
        </div>
      )}
      <div style={footerStyle}>
        <button type="button" style={ghostBtnStyle()} onClick={onCancel}>
          {t("public.guestChat.cancel")}
        </button>
        <button
          type="button"
          style={{ ...primaryBtnStyle(accent, accentInk), height: 32, padding: "0 14px", fontSize: 12 }}
          onClick={handleConfirm}
        >
          {t("public.guestChat.confirm")}
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main export — GuestDetailChipEditor
// ─────────────────────────────────────────────────────────────────────────────

export function GuestDetailChipEditor({
  kind,
  initial,
  accent,
  accentInk,
  t,
  onSubmit,
  onCancel,
}: GuestDetailChipEditorProps) {
  const ink = accentInk || readableOn(accent);

  switch (kind) {
    case "date":
      return (
        <DateEditor
          initial={initial}
          accent={accent}
          accentInk={ink}
          t={t}
          onSubmit={onSubmit}
          onCancel={onCancel}
        />
      );
    case "location":
      return (
        <LocationEditor
          initial={initial}
          accent={accent}
          accentInk={ink}
          t={t}
          onSubmit={onSubmit}
          onCancel={onCancel}
        />
      );
    case "headcount":
      return (
        <HeadcountEditor
          initial={initial}
          accent={accent}
          accentInk={ink}
          t={t}
          onSubmit={onSubmit}
          onCancel={onCancel}
        />
      );
    case "event_type":
      return (
        <EventTypeEditor
          initial={initial}
          accent={accent}
          accentInk={ink}
          t={t}
          onSubmit={onSubmit}
          onCancel={onCancel}
        />
      );
    case "budget":
      return (
        <BudgetEditor
          initial={initial}
          accent={accent}
          accentInk={ink}
          t={t}
          onSubmit={onSubmit}
          onCancel={onCancel}
        />
      );
    default:
      return null;
  }
}
