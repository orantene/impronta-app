"use client";

// ─── Field group / row helpers (shared by drawers) ───────────────────
//
// ChannelVisibilityStrip / FieldRow / TextInput / TextArea / Toggle /
// Divider + FieldChannel / FieldVisibility types.
// Extracted from primitives.tsx — Phase 1f decomposition.

import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { COLORS, FONTS, TRANSITION } from "../state";
import {
  FIELD_CATALOG,
  applyWorkspaceFieldOverride,
  useWorkspaceFieldOverrideSubscription,
} from "../field-catalog";
import { useDashboardText } from "../dashboard-i18n";

// ─── Field group / row helpers (shared by drawers) ───────────────────

// ── Channel-visibility chip strip ──
// Per-channel visibility for sensitive profile fields. The talent
// toggles which surfaces (Public hub / Agency / Private) see this
// value. Default sensible per field — height visible everywhere,
// phone agency-only, legal name private. Mock-state driven; the
// engine reads `fieldVisibility[fieldPath]` per channel in production.
export type FieldChannel = "public" | "agency" | "private";
export type FieldVisibility = ReadonlyArray<FieldChannel>;
const CHANNEL_META: Record<FieldChannel, { label: string; emoji: string; tooltip: string }> = {
  public:  { label: "Public",  emoji: "🌐", tooltip: "Discovery hub + your public profile page" },
  agency:  { label: "Agency",  emoji: "🏢", tooltip: "Coordinators at agencies that represent you" },
  private: { label: "Private", emoji: "🔒", tooltip: "Only you (and admins for compliance)" },
};

// Per-channel descriptions reused in the picker popover so the meaning
// of each audience is explained inline (audit #10 — no unexplained dots).
const CHANNEL_DESC: Record<FieldChannel, string> = {
  public:  "Discovery + your public profile page",
  agency:  "Coordinators at agencies that represent you",
  private: "Only you (admins for compliance)",
};
const CHANNEL_DOT: Record<FieldChannel, string> = {
  public:  "#2E7D5B",
  agency:  "#5B6BA0",
  private: "#C82828",
};

/**
 * Compact visibility control — ONE design across the whole editor
 * (every hardcoded section + the Specialty engine mirror this).
 *
 * Collapsed: a single small pill — coloured dot + one word
 * (Public / Agency / Private / Hidden) + caret — that summarises the
 * current audience. ~64px wide instead of the old ~170px triad, so it
 * fits inline-right of the label even in a 2-column grid cell and stops
 * wrapping below the field (audit #1/#2/#3). Repeated on every field
 * without becoming visual noise (audit #8).
 *
 * Expanded (on click): a labelled popover with the three audiences,
 * each with a plain-language description and a check — so the meaning
 * is never a mystery (audit #10).
 *
 * Same `value` + `onChange` API as before — callers don't change.
 */
export function ChannelVisibilityStrip({
  value, onChange, label = "Visible to",
}: {
  value: FieldVisibility;
  onChange?: (next: FieldVisibility) => void;
  label?: string;
}) {
  const copy = useDashboardText();
  const channels: FieldChannel[] = ["public", "agency", "private"];
  const has = (c: FieldChannel) => value.includes(c);
  const toggle = (c: FieldChannel) => {
    if (!onChange) return;
    // Private is exclusive — picking it clears the others. Picking
    // public/agency clears private.
    if (c === "private") { onChange(["private"]); return; }
    const without = value.filter(x => x !== "private");
    if (has(c)) onChange(without.filter(x => x !== c) as FieldChannel[]);
    else onChange([...without.filter(x => x !== c), c] as FieldChannel[]);
  };

  // Collapsed summary: broadest audience wins the label/colour.
  const summary = has("public")
    ? { word: "Public",  dot: CHANNEL_DOT.public }
    : has("agency")
      ? { word: "Agency",  dot: CHANNEL_DOT.agency }
      : has("private")
        ? { word: "Private", dot: CHANNEL_DOT.private }
        : { word: "Hidden", dot: "rgba(11,11,13,0.28)" };

  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={wrapRef} style={{ position: "relative", display: "inline-flex" }}>
      <button
        type="button"
        onClick={() => onChange && setOpen(o => !o)}
        disabled={!onChange}
        aria-haspopup="true"
        aria-expanded={open}
        title={`${copy.t(label)}: ${copy.t(summary.word)}`}
        style={{
          display: "inline-flex", alignItems: "center", gap: 5,
          padding: "2px 8px", borderRadius: 999,
          border: `1px solid ${open ? COLORS.accent : COLORS.borderSoft}`,
          background: open ? "rgba(15,79,62,0.06)" : "transparent",
          color: COLORS.inkMuted,
          fontFamily: FONTS.body, fontSize: 10.5, fontWeight: 600,
          cursor: onChange ? "pointer" : "default",
          letterSpacing: 0.1, whiteSpace: "nowrap",
        }}
      >
        <span aria-hidden style={{
          width: 6, height: 6, borderRadius: "50%", background: summary.dot,
        }} />
        {copy.t(summary.word)}
        {onChange && (
          <span aria-hidden style={{ fontSize: 8, opacity: 0.55, marginLeft: 1 }}>
            ▾
          </span>
        )}
      </button>
      {open && (
        <div
          role="menu"
          style={{
            position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 60,
            minWidth: 244, padding: 6, borderRadius: 12,
            background: "#fff", border: `1px solid ${COLORS.borderSoft}`,
            boxShadow: "0 8px 28px rgba(11,11,13,0.16)",
            fontFamily: FONTS.body,
          }}
        >
          <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase", padding: "4px 8px 6px" }} className="text-admin-ink-dim">
            {copy.t(label)}
          </div>
          {channels.map((c) => {
            const active = has(c);
            return (
              <button
                key={c}
                type="button"
                role="menuitemcheckbox"
                aria-checked={active}
                onClick={() => toggle(c)}
                style={{
                  width: "100%", display: "flex", alignItems: "flex-start", gap: 9,
                  padding: "7px 8px", borderRadius: 8, textAlign: "left",
                  border: "none", cursor: "pointer",
                  background: active ? "rgba(15,79,62,0.06)" : "transparent",
                }}
              >
                <span aria-hidden style={{
                  width: 8, height: 8, borderRadius: "50%", marginTop: 3, flexShrink: 0,
                  background: active ? CHANNEL_DOT[c] : "rgba(11,11,13,0.16)",
                }} />
                <span className="flex-1 min-w-0">
                  <span style={{
                    display: "block", fontSize: 12, fontWeight: 600,
                    color: active ? COLORS.ink : COLORS.inkMuted,
                  }}>
                    {copy.t({ public: "Public", agency: "Agency", private: "Private" }[c])}
                  </span>
                  <span style={{ display: "block", fontSize: 10.5, lineHeight: 1.35, marginTop: 1 }} className="text-admin-ink-dim">
                    {copy.t(CHANNEL_DESC[c])}
                  </span>
                </span>
                <span aria-hidden style={{
                  fontSize: 11, color: COLORS.accent, marginTop: 1,
                  opacity: active ? 1 : 0,
                }}>
                  ✓
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function FieldRow({
  label,
  children,
  hint,
  optional,
  recommended,
  required,
  error,
  visibility,
  onVisibilityChange,
  catalogId,
  tenantId,
  hideLabel,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
  optional?: boolean;
  /** Marks the field as platform-recommended — renders a small green
   *  "Recommended" pill in the top-right cluster. Mutually exclusive with
   *  `optional` and `required` (recommended wins visually). Used to nudge
   *  users toward an opt-in default-off setting we encourage them to enable. */
  recommended?: boolean;
  /** Marks the field as required with a small red asterisk after the label. */
  required?: boolean;
  /** Inline error message — replaces hint and tints the row red. */
  error?: string;
  /** Per-channel visibility — when set, renders the visibility chip strip
   *  below the field so the talent can decide who sees this value. */
  visibility?: FieldVisibility;
  onVisibilityChange?: (next: FieldVisibility) => void;
  /** Phase E (F1) — when supplied, FieldRow honors workspace overrides
   *  on the field's catalog entry. `customLabel` replaces the label;
   *  `customHelper` replaces the hint. Pass the catalog field id (e.g.
   *  "identity.legalName") and the row resolves overrides at render. */
  catalogId?: string;
  /** Real workspace scope used for catalog overrides. Intentionally no
   *  prototype fallback here — live tenant routes should pass the active
   *  tenant id/slug explicitly. */
  tenantId?: string | null;
  /** When true the row's own label is suppressed — used when an outer
   *  collapsible card already shows the field name in its header, so the
   *  label isn't duplicated. Right cluster (visibility chips) + hint
   *  still render. Defaults to false → unchanged for every caller. */
  hideLabel?: boolean;
}) {
  // Phase E — workspace override merge. When `catalogId` is provided,
  // resolve the merged catalog entry for the active tenant and let
  // customLabel / customHelper win over the explicit label / hint. The
  // hook subscribes the row to override changes so toggles from the
  // settings drawer flow through immediately.
  useWorkspaceFieldOverrideSubscription();
  if (catalogId) {
    const entry = FIELD_CATALOG.find(c => c.id === catalogId);
    if (entry) {
      const resolved = applyWorkspaceFieldOverride(entry, tenantId ?? null);
      if (resolved.hasOverride) {
        // Strip override hint? Just merge in.
        if (resolved.label && resolved.label !== entry.label) label = resolved.label;
        if (resolved.helper && resolved.helper !== entry.helper) hint = resolved.helper;
        // If the workspace disabled this field, hide the row entirely.
        if (!resolved.enabled) return null;
      }
    }
  }
  return (
    <div className="flex flex-col gap-1.5">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap", rowGap: 4 }}>
        {!hideLabel && (
        <label style={{ fontFamily: FONTS.body, fontSize: 12, fontWeight: 500, letterSpacing: 0.1 }} className="text-admin-ink">
          {label}
          {required && (
            <span
              aria-label="required"
              style={{
                color: COLORS.red,
                marginLeft: 3,
                fontWeight: 600,
              }}
            >
              *
            </span>
          )}
        </label>
        )}
        {/* Right cluster, inline across from the label: small visibility
            chips (+ recommended nudge). "Optional" removed — required is
            the only marker now (the red * on the label). Label row
            wraps so the chips drop below cleanly in narrow 2-col. */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0, marginLeft: "auto" }}>
          {recommended && (
            <span
              aria-label="recommended"
              style={{
                fontFamily: FONTS.body,
                fontSize: 9.5,
                fontWeight: 600,
                letterSpacing: 0.3,
                textTransform: "uppercase",
                padding: "1px 6px",
                borderRadius: 4,
                background: COLORS.successSoft ?? "rgba(15,79,62,0.10)",
                color: COLORS.successDeep ?? COLORS.success ?? "#0f4f3e",
              }}
            >
              Rec
            </span>
          )}
          {visibility && (
            <ChannelVisibilityStrip
              value={visibility}
              onChange={onVisibilityChange}
            />
          )}
        </div>
      </div>
      {children}
      {error ? (
        <>
          <style>{`@keyframes tulalaFieldError { from { opacity: 0; transform: translateY(-2px); } to { opacity: 1; transform: translateY(0); } }`}</style>
          <span
            role="alert"
            style={{
              fontFamily: FONTS.body,
              fontSize: 11.5,
              color: COLORS.red,
              fontWeight: 500,
              animation: "tulalaFieldError .18s ease",
            }}
          >
            {error}
          </span>
        </>
      ) : hint ? (
        <span style={{ fontFamily: FONTS.body, fontSize: 11.5 }} className="text-admin-ink-muted">
          {hint}
        </span>
      ) : null}
    </div>
  );
}

export function TextInput({
  defaultValue,
  value,
  onChange,
  placeholder,
  prefix,
  suffix,
  type = "text",
  autoFocus,
  readOnly,
  error,
  maxLength,
}: {
  defaultValue?: string;
  /** Controlled value. If provided, pair with `onChange`. */
  value?: string;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
  prefix?: ReactNode;
  suffix?: ReactNode;
  type?: "text" | "email" | "url" | "date";
  autoFocus?: boolean;
  readOnly?: boolean;
  /** Marks the input invalid — red border + background tint. Pair with FieldRow `error` for the message. */
  error?: boolean;
  maxLength?: number;
}) {
  const [focused, setFocused] = useState(false);
  const descId = useId();
  const currentLen = value?.length ?? 0;
  const showCount = maxLength !== undefined && currentLen >= Math.floor(maxLength * 0.75);
  const borderColor = error ? COLORS.red : focused ? COLORS.inkDim : COLORS.border;
  const shadow = error
    ? (focused ? "0 0 0 3px rgba(200,40,40,0.15)" : "none")
    : (focused ? "0 0 0 3px rgba(11,11,13,0.08)" : "none");
  return (
    <div
      style={{
        display: "flex",
        alignItems: "stretch",
        background: error ? "rgba(200,40,40,0.04)" : "#fff",
        border: `1px solid ${borderColor}`,
        borderRadius: 8,
        overflow: "hidden",
        minHeight: 44,
        boxShadow: shadow,
        transition: `border-color ${TRANSITION.sm}, box-shadow ${TRANSITION.sm}`,
      }}
    >
      {prefix && (
        <span style={{ display: "inline-flex", alignItems: "center", padding: "0 10px", background: "rgba(11,11,13,0.03)", borderRight: `1px solid ${COLORS.borderSoft}`, fontFamily: FONTS.body, fontSize: 12.5 }} className="text-admin-ink-muted">
          {prefix}
        </span>
      )}
      <input
        type={type}
        inputMode={type === "email" ? "email" : undefined}
        autoComplete={type === "email" ? "email" : undefined}
        defaultValue={value === undefined ? defaultValue : undefined}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        autoFocus={autoFocus}
        readOnly={readOnly}
        maxLength={maxLength}
        aria-invalid={error ? true : undefined}
        aria-describedby={showCount ? descId : undefined}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={{
          flex: 1,
          padding: "9px 12px",
          fontFamily: FONTS.body,
          fontSize: 13.5,
          color: COLORS.ink,
          background: "transparent",
          border: "none",
          outline: "none",
          minHeight: 42,
        }}
      />
      {showCount && maxLength && (
        <span
          id={descId}
          aria-live="polite"
          style={{
            display: "inline-flex",
            alignItems: "center",
            padding: "0 10px",
            fontFamily: FONTS.body,
            fontSize: 11,
            color: currentLen >= maxLength ? COLORS.red : COLORS.inkMuted,
            flexShrink: 0,
          }}
        >
          {currentLen}/{maxLength}
        </span>
      )}
      {suffix && !showCount && (
        <span style={{ display: "inline-flex", alignItems: "center", padding: "0 10px", background: "rgba(11,11,13,0.03)", borderLeft: `1px solid ${COLORS.borderSoft}`, fontFamily: FONTS.body, fontSize: 12.5 }} className="text-admin-ink-muted">
          {suffix}
        </span>
      )}
    </div>
  );
}

export function TextArea({
  defaultValue,
  value,
  onChange,
  placeholder,
  rows = 4,
  error,
}: {
  defaultValue?: string;
  /** Controlled value. Pair with onChange when supplied. */
  value?: string;
  onChange?: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  placeholder?: string;
  rows?: number;
  /** Marks the textarea invalid — red border + tint. Pair with FieldRow `error`. */
  error?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  const borderColor = error ? COLORS.red : focused ? COLORS.inkDim : COLORS.border;
  const shadow = error
    ? (focused ? "0 0 0 3px rgba(200,40,40,0.15)" : "none")
    : (focused ? "0 0 0 3px rgba(11,11,13,0.08)" : "none");
  return (
    <textarea
      defaultValue={value === undefined ? defaultValue : undefined}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      rows={rows}
      aria-invalid={error ? true : undefined}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={{
        padding: "9px 12px",
        fontFamily: FONTS.body,
        fontSize: 13.5,
        color: COLORS.ink,
        background: error ? "rgba(200,40,40,0.04)" : "#fff",
        border: `1px solid ${borderColor}`,
        borderRadius: 8,
        outline: "none",
        resize: "vertical",
        lineHeight: 1.55,
        boxShadow: shadow,
        transition: `border-color ${TRANSITION.sm}, box-shadow ${TRANSITION.sm}`,
      }}
    />
  );
}

export function Toggle({
  on,
  onChange,
  label,
}: {
  on: boolean;
  onChange?: (v: boolean) => void;
  label?: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange?.(!on)}
      role="switch"
      aria-checked={on}
      aria-label={label ?? "Toggle switch"}
      style={{
        position: "relative",
        width: 36,
        height: 20,
        borderRadius: 999,
        background: on ? COLORS.fill : "rgba(11,11,13,0.16)",
        border: "none",
        cursor: "pointer",
        padding: 0,
        flexShrink: 0,
        transition: `background ${TRANSITION.sm}`,
      }}
    >
      <span
        style={{
          position: "absolute",
          top: 2,
          left: on ? 18 : 2,
          width: 16,
          height: 16,
          borderRadius: "50%",
          background: "#fff",
          transition: "left .15s",
          boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
        }}
      />
    </button>
  );
}

export function Divider({ label }: { label?: string }) {
  if (!label) {
    return (
      <div
        role="separator"
        aria-orientation="horizontal"
        style={{
          height: 1,
          background: COLORS.borderSoft,
          margin: "16px 0",
        }}
      />
    );
  }
  return (
    <div
      role="separator"
      aria-label={label}
      data-tulala-divider-labelled
      style={{
        display: "flex",
        alignItems: "baseline",
        gap: 8,
        margin: "16px 0 8px",
      }}
    >
      <h2 style={{ margin: 0, fontFamily: FONTS.body, fontSize: 13, fontWeight: 600, letterSpacing: -0.05 }} className="text-admin-ink">{label}</h2>
      <div aria-hidden style={{ flex: 1, height: 1, background: COLORS.borderSoft }} />
      <style>{`
        @media (max-width: 540px) {
          [data-tulala-divider-labelled] { margin: 12px 0 6px !important; }
        }
      `}</style>
    </div>
  );
}
