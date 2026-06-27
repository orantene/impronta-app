"use client";

/**
 * GuestDetailChips — the horizontal chip row rendered ABOVE the composer
 * inside MiniChatPanel once an inquiry exists (progressive disclosure: chips
 * only appear after the first message, never before).
 *
 * Each chip (Date · Location · Headcount · Type · Budget) maps 1:1 to an
 * InquiryIntent field. Tapping a chip opens GuestDetailChipEditor inline
 * (no navigation). On confirm the parent's onCapture() is called, which
 * hits captureGuestChip() server action to write interpreted_query + flat
 * columns. A confirmed chip shows its value label and remains re-editable.
 *
 * "Add more details →" escalates to the full InquiryDrawer via onAddMoreDetails.
 * Two wiring options (documented below) — the integration agent wires the one
 * that fits. This component just surfaces the button and passes captured state up.
 *
 * Strategy §10 (progressive disclosure):
 *   • Chips appear only AFTER inquiryId is non-null — they refine an existing
 *     thread, they do NOT gate the first message.
 *   • Strategy §11 (hard rule): chips write the structured spine only; nothing
 *     here calls engine_send_offer / createOffer. Those remain coordinator-driven.
 *
 * House rules:
 *   • NO gold/rust accents — tenant accent passed as prop.
 *   • NO fake presence signals.
 *   • Hook dependency arrays are real (no suppression of the deps lint).
 *   • Inline styles only (no admin-shell Tailwind classes).
 *   • Under 800 lines total (this file + GuestDetailChipEditor.tsx).
 *
 * WIRING NOTE for the integration agent:
 *   Mount GuestDetailChips ABOVE the composer inside MiniChatPanel. Pass:
 *     inquiryId={inquiryId}           // from MiniChatPanel state
 *     accent={accent}
 *     accentInk={accentInk}
 *     capturedKinds={capturedKinds}   // lifted state from MiniChatPanel
 *     onCapture={captureGuestChipAction}   // the bound server action
 *     onAddMoreDetails={() => {
 *       // OPTION A (default): deep-link to the client messages page.
 *       //   window.open(`/${tenantSlug}/client/messages?new=1&talent=${talentProfileId}`, '_blank');
 *       // OPTION B: if the DirectoryInquiryModalProvider is accessible in scope,
 *       //   call its open(prefill) method with the captured values + contact info.
 *       //   const prefill = buildPrefillFromCapture(capturedValues, contact);
 *       //   openInquiryDrawer(prefill);
 *     }}
 *   The panel must also expose capturedValues (the partial GuestChipValue map)
 *   as lifted state so onAddMoreDetails can assemble the prefill.
 */

import { useState } from "react";
import type { GuestChipKind, GuestChipValue, GuestChipInput, GuestChipResult } from "@/lib/inquiry/guest-chat-contract";
import type { Translator } from "@/i18n/interpolate";
import { interpolate } from "@/i18n/interpolate";
import type { UnifiedSyncState } from "./use-unified-inquiry";
import {
  GuestDetailChipEditor,
} from "./GuestDetailChipEditor";
import {
  FONT,
  DEFAULT_ACCENT,
  paletteFor,
  readableOn,
  accentText,
  type Palette,
  type SurfaceMode,
} from "./mini-chat-styles";

// ─────────────────────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────────────────────

export type GuestDetailChipsProps = {
  /**
   * inquiries.id — chips render only when this is non-null (progressive
   * disclosure: an inquiry must exist before chip refinement is available).
   */
  inquiryId: string | null;
  /**
   * P1: render the chip row even before an inquiryId exists, so the first
   * Date/Location commit can lazily create the early-partial row through onPatch.
   * When false (legacy), chips stay hidden until an inquiry exists.
   */
  alwaysShow?: boolean;
  /** Tenant accent color (CSS string). */
  accent: string;
  /** Readable text color on accent background. */
  accentInk: string;
  /** Guest-locale translator (resolved from brand.locale). */
  t: Translator;
  /**
   * Set of chip kinds that have already been captured (drives checkmark +
   * value label display). Owned by the parent (MiniChatPanel).
   */
  capturedKinds: GuestChipKind[];
  /**
   * The captured values per kind (for pre-filling re-edit). May be partial.
   * Owned by the parent; passed back via onCapture return value.
   */
  capturedValues?: Partial<Record<GuestChipKind, GuestChipValue>>;
  /**
   * Called when the guest confirms a chip. The parent calls the server action
   * and, on ok:true, updates capturedKinds + capturedValues.
   */
  onCapture: (input: GuestChipInput) => Promise<GuestChipResult>;
  /**
   * P1-T1/T2: route a chip edit through useUnifiedInquiry.patch. When provided
   * this supersedes onCapture: the panel owns one record, lazily creates the
   * early row on the first commit, and tracks per-field sync state itself.
   */
  onPatch?: (kind: GuestChipKind, value: GuestChipValue) => Promise<void>;
  /**
   * P1-T2: per-kind sync status from the unified hook ("saving"|"saved"|...),
   * driving the field-level micro-status (B.4). Only consulted on the onPatch path.
   */
  fieldState?: Record<string, UnifiedSyncState>;
  /**
   * P1-T3: kinds a remote edit just changed — those chips get a brief accent
   * flash (reduced-motion is handled by the caller, which omits these kinds).
   */
  remoteFlashKinds?: GuestChipKind[];
  /**
   * Called when "Add more details →" is tapped. The integration agent wires
   * this to either:
   *   A) window.open(`/${tenantSlug}/client/messages?new=1&talent=${talentProfileId}`)
   *   B) openInquiryDrawer(prefill) via DirectoryInquiryModalProvider
   * This component is agnostic — it just surfaces the button.
   */
  onAddMoreDetails: () => void;
  /** Jon 360 Phase 7 — dark surface variant for noir tenants. Default "light". */
  surfaceMode?: SurfaceMode;
};

// ─────────────────────────────────────────────────────────────────────────────
// Chip metadata
// ─────────────────────────────────────────────────────────────────────────────

type ChipMeta = {
  kind: GuestChipKind;
  /** i18n key for the default (empty-state) chip label. */
  defaultLabelKey: string;
  /** Localized captured-value label; `t` resolves the locale catalog. */
  capturedLabel: (value: GuestChipValue, t: Translator) => string | null;
};

const CHIPS: ChipMeta[] = [
  {
    kind: "date",
    defaultLabelKey: "public.guestChat.chipDate",
    capturedLabel: (v, t) => {
      if (v.eventDate) {
        try {
          return new Date(v.eventDate + "T00:00:00").toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
          });
        } catch {
          return v.eventDate;
        }
      }
      if (v.dateStatus === "flexible") return t("public.guestChat.chipFlexible");
      if (v.dateStatus === "not_sure") return t("public.guestChat.chipDateTbd");
      return null;
    },
  },
  {
    kind: "location",
    defaultLabelKey: "public.guestChat.chipLocation",
    capturedLabel: (v, t) => {
      if (v.locationStatus === "online") return t("public.guestChat.chipOnline");
      if (v.city?.trim()) return v.city.trim();
      if (v.locationStatus === "not_sure") return t("public.guestChat.chipTbd");
      return null;
    },
  },
  {
    kind: "headcount",
    defaultLabelKey: "public.guestChat.chipHeadcount",
    capturedLabel: (v, t) => {
      const n = v.headcount;
      if (n !== null && n !== undefined) {
        return interpolate(t("public.guestChat.chipGuestsWithCount"), {
          count: n,
          unit:
            n === 1
              ? t("public.guestChat.guestOne")
              : t("public.guestChat.guestOther"),
        });
      }
      return null;
    },
  },
  {
    kind: "event_type",
    defaultLabelKey: "public.guestChat.chipType",
    capturedLabel: (v) => v.eventType?.trim() || null,
  },
  {
    kind: "budget",
    defaultLabelKey: "public.guestChat.chipBudget",
    capturedLabel: (v, t) => {
      if (v.budgetAmount !== null && v.budgetAmount !== undefined && v.currency) {
        return `${v.currency} ${v.budgetAmount.toLocaleString()}`;
      }
      if (v.budgetPreference && v.budgetPreference !== "not_sure") {
        return v.budgetPreference === "agency_recommends"
          ? t("public.guestChat.chipAgencyRecommends")
          : v.budgetPreference.replace(/_/g, " ");
      }
      return null;
    },
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Style constants
// ─────────────────────────────────────────────────────────────────────────────

function wrapStyle(C: Palette): React.CSSProperties {
  return {
    borderTop: `1px solid ${C.borderSoft}`,
    background: C.surfaceFaint,
    padding: "8px 12px 6px",
    display: "flex",
    flexDirection: "column",
    gap: 6,
    fontFamily: FONT,
  };
}

const scrollRowStyle: React.CSSProperties = {
  display: "flex",
  gap: 6,
  overflowX: "auto",
  paddingBottom: 2,
  // Hide scrollbar visually but keep functionality
  scrollbarWidth: "none",
  msOverflowStyle: "none",
};

function chipStyle(captured: boolean, accent: string, C: Palette): React.CSSProperties {
  // a11y: the filled chip paints a pale `${accent}15` tint behind the label, so a
  // bright tenant accent (Impronta = gold) as label text fails 4.5:1. Use the raw
  // accent only for border/fill; clamp the LABEL text to an AA-legible variant
  // against the ACTIVE surfaceFaint (unchanged when it already passes, e.g. slate).
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    height: 28,
    padding: "0 10px",
    borderRadius: 999,
    border: captured ? `1.5px solid ${accent}` : `1px solid ${C.border}`,
    background: captured ? `${accent}15` : C.surface,
    fontFamily: FONT,
    fontSize: 12,
    fontWeight: captured ? 600 : 400,
    color: captured ? accentText(accent, C.surfaceFaint) : C.ink,
    cursor: "pointer",
    whiteSpace: "nowrap",
    flexShrink: 0,
    transition: "all 120ms",
  };
}

function addMoreStyle(C: Palette): React.CSSProperties {
  return {
    alignSelf: "flex-start",
    background: "none",
    border: "none",
    fontFamily: FONT,
    fontSize: 11,
    fontWeight: 500,
    color: C.inkMuted,
    cursor: "pointer",
    padding: "2px 0",
    textDecoration: "underline",
    textUnderlineOffset: 2,
  };
}

function errorStyle(C: Palette): React.CSSProperties {
  return {
    fontSize: 11,
    color: C.danger,
    padding: "0 2px",
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export function GuestDetailChips({
  inquiryId,
  alwaysShow = false,
  accent = DEFAULT_ACCENT,
  accentInk,
  t,
  capturedKinds,
  capturedValues = {},
  onCapture,
  onPatch,
  fieldState = {},
  remoteFlashKinds = [],
  onAddMoreDetails,
  surfaceMode = "light",
}: GuestDetailChipsProps) {
  const C = paletteFor(surfaceMode);
  const [openKind, setOpenKind] = useState<GuestChipKind | null>(null);
  const [submitting, setSubmitting] = useState<GuestChipKind | null>(null);
  const [chipError, setChipError] = useState<string | null>(null);

  const resolvedAccentInk = accentInk || readableOn(accent);
  // a11y: chip glyphs/labels measured against the active surfaceFaint.
  const accentGlyph = accentText(accent, C.surfaceFaint);

  // Chips render once an inquiry exists (legacy progressive disclosure), OR
  // immediately when the unified patch path is active (alwaysShow) — the first
  // commit then lazily creates the early-partial row (P1-T1).
  if (!inquiryId && !alwaysShow) return null;

  function handleChipClick(kind: GuestChipKind) {
    if (submitting) return; // don't open during a save
    setChipError(null);
    // Toggle: clicking the open chip closes it
    setOpenKind((prev) => (prev === kind ? null : kind));
  }

  async function handleEditorSubmit(kind: GuestChipKind, value: GuestChipValue) {
    setOpenKind(null);
    setChipError(null);

    // Unified path: route through the hook's patch(). It lazily creates the early
    // row and tracks per-field sync state, so we don't manage `submitting` or
    // read a return value here — the micro-status comes from fieldState (B.4).
    if (onPatch) {
      await onPatch(kind, value);
      return;
    }

    // Legacy direct-capture path (requires an existing inquiry).
    if (!inquiryId) return;
    setSubmitting(kind);
    try {
      const result = await onCapture({ inquiryId, kind, value });
      if (!result.ok) {
        setChipError(result.message);
      }
    } finally {
      setSubmitting(null);
    }
  }

  function handleEditorCancel() {
    setOpenKind(null);
    setChipError(null);
  }

  // Roll the per-kind sync states up to a single footer line (B.4): any saving
  // wins, else any error, else any saved (recently). Drives "Saving…"/"Saved".
  const fieldStates = Object.values(fieldState);
  const footerStatus: UnifiedSyncState = fieldStates.includes("saving")
    ? "saving"
    : fieldStates.includes("error")
      ? "error"
      : fieldStates.includes("saved")
        ? "saved"
        : "idle";

  return (
    <div style={wrapStyle(C)}>
      {/* Chip scroll row */}
      <div style={scrollRowStyle}>
        {CHIPS.map(({ kind, defaultLabelKey, capturedLabel }) => {
          const isCaptured = capturedKinds.includes(kind);
          const isOpen = openKind === kind;
          // Field status: unified path reads fieldState; legacy reads `submitting`.
          const fState = fieldState[kind];
          const isSaving = onPatch ? fState === "saving" : submitting === kind;
          const isSaved = onPatch && fState === "saved";
          const isErr = onPatch && fState === "error";
          const isFlashing = remoteFlashKinds.includes(kind);
          const capturedValue = capturedValues[kind];
          const valueLabel = capturedValue ? capturedLabel(capturedValue, t) : null;

          const defaultLabel = t(defaultLabelKey);
          const label = isCaptured && valueLabel ? valueLabel : defaultLabel;

          return (
            <button
              key={kind}
              type="button"
              style={{
                ...chipStyle(isCaptured || isOpen, accent, C),
                opacity: isSaving ? 0.6 : 1,
                // P1-T3: brief accent flash when a REMOTE edit changed this chip.
                ...(isFlashing
                  ? { background: `${accent}14`, borderColor: accent }
                  : {}),
                ...(isErr ? { borderColor: C.danger } : {}),
                transition: "background 600ms ease, border-color 600ms ease, all 120ms",
              }}
              onClick={() => handleChipClick(kind)}
              aria-pressed={isCaptured}
              aria-label={
                isCaptured
                  ? interpolate(t("public.guestChat.chipEditAria"), {
                      label: defaultLabel,
                      value: label,
                    })
                  : interpolate(t("public.guestChat.chipAddAria"), { label: defaultLabel })
              }
              disabled={isSaving}
            >
              {isCaptured && !isSaving && <CheckIcon color={accentGlyph} />}
              {isSaving ? t("public.guestChat.chipSaving") : label}
              {isSaved && <CheckIcon color={accentGlyph} />}
            </button>
          );
        })}
      </div>

      {/* Inline editor — opens below the chip row */}
      {openKind && (
        <GuestDetailChipEditor
          kind={openKind}
          initial={capturedValues[openKind] ?? null}
          accent={accent}
          accentInk={resolvedAccentInk}
          t={t}
          surfaceMode={surfaceMode}
          onSubmit={(value) => void handleEditorSubmit(openKind, value)}
          onCancel={handleEditorCancel}
        />
      )}

      {/* Chip error display (legacy path) */}
      {chipError && <p style={errorStyle(C)}>{chipError}</p>}

      {/* P1-T2: panel-level field sync micro-status (unified path). No em dashes. */}
      {onPatch && footerStatus !== "idle" && (
        <p
          aria-live="polite"
          style={{
            margin: 0,
            fontSize: 11,
            fontWeight: 500,
            color:
              footerStatus === "error"
                ? C.danger
                : footerStatus === "saved"
                  ? C.inkMuted
                  : C.inkDim,
            padding: "0 2px",
          }}
        >
          {footerStatus === "saving"
            ? t("public.guestChat.chipSaving")
            : footerStatus === "saved"
              ? t("public.guestChat.chipSaved")
              : t("public.guestChat.chipSaveRetry")}
        </p>
      )}

      {/* "Add more details" escalation affordance */}
      <button
        type="button"
        style={addMoreStyle(C)}
        onClick={onAddMoreDetails}
        aria-label={t("public.guestChat.addMoreDetailsAria")}
      >
        {t("public.guestChat.addMoreDetails")}
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tiny check icon (inline SVG — no external dep)
// ─────────────────────────────────────────────────────────────────────────────

function CheckIcon({ color }: { color: string }) {
  return (
    <svg
      width={10}
      height={10}
      viewBox="0 0 10 10"
      fill="none"
      aria-hidden="true"
      style={{ flexShrink: 0 }}
    >
      <path
        d="M1.5 5L4 7.5L8.5 2.5"
        stroke={color}
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
