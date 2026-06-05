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
 *   • NO eslint-disable for react-hooks/exhaustive-deps.
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
import type { GuestChipKind, GuestChipValue } from "./GuestDetailChipEditor";
import {
  GuestDetailChipEditor,
} from "./GuestDetailChipEditor";
import { C, FONT, DEFAULT_ACCENT, readableOn } from "./mini-chat-styles";

// ─────────────────────────────────────────────────────────────────────────────
// Local type definitions (integration promotes these to guest-chat-contract.ts)
// ─────────────────────────────────────────────────────────────────────────────

/** Input to the captureGuestChip server action (local copy; contract uses same shape). */
export type GuestChipInput = {
  inquiryId: string;
  kind: GuestChipKind;
  value: GuestChipValue;
};

/** Result from captureGuestChip (local copy; contract uses same shape). */
export type GuestChipResult =
  | { ok: true; appliedSummary: string }
  | { ok: false; code: string; message: string; retryAfterMs?: number; missingFields?: string[] };

// ─────────────────────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────────────────────

export type GuestDetailChipsProps = {
  /**
   * inquiries.id — chips render only when this is non-null (progressive
   * disclosure: an inquiry must exist before chip refinement is available).
   */
  inquiryId: string | null;
  /** Tenant accent color (CSS string). */
  accent: string;
  /** Readable text color on accent background. */
  accentInk: string;
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
   * Called when "Add more details →" is tapped. The integration agent wires
   * this to either:
   *   A) window.open(`/${tenantSlug}/client/messages?new=1&talent=${talentProfileId}`)
   *   B) openInquiryDrawer(prefill) via DirectoryInquiryModalProvider
   * This component is agnostic — it just surfaces the button.
   */
  onAddMoreDetails: () => void;
};

// ─────────────────────────────────────────────────────────────────────────────
// Chip metadata
// ─────────────────────────────────────────────────────────────────────────────

type ChipMeta = {
  kind: GuestChipKind;
  defaultLabel: string;
  capturedLabel: (value: GuestChipValue) => string | null;
};

const CHIPS: ChipMeta[] = [
  {
    kind: "date",
    defaultLabel: "Date",
    capturedLabel: (v) => {
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
      if (v.dateStatus === "flexible") return "Flexible";
      if (v.dateStatus === "not_sure") return "Date TBD";
      return null;
    },
  },
  {
    kind: "location",
    defaultLabel: "Location",
    capturedLabel: (v) => {
      if (v.locationStatus === "online") return "Online";
      if (v.city?.trim()) return v.city.trim();
      if (v.locationStatus === "not_sure") return "TBD";
      return null;
    },
  },
  {
    kind: "headcount",
    defaultLabel: "Headcount",
    capturedLabel: (v) => {
      const n = v.headcount;
      if (n !== null && n !== undefined) return `${n} ${n === 1 ? "guest" : "guests"}`;
      return null;
    },
  },
  {
    kind: "event_type",
    defaultLabel: "Type",
    capturedLabel: (v) => v.eventType?.trim() || null,
  },
  {
    kind: "budget",
    defaultLabel: "Budget",
    capturedLabel: (v) => {
      if (v.budgetAmount !== null && v.budgetAmount !== undefined && v.currency) {
        return `${v.currency} ${v.budgetAmount.toLocaleString()}`;
      }
      if (v.budgetPreference && v.budgetPreference !== "not_sure") {
        return v.budgetPreference === "agency_recommends"
          ? "Agency recommends"
          : v.budgetPreference.replace(/_/g, " ");
      }
      return null;
    },
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Style constants
// ─────────────────────────────────────────────────────────────────────────────

const wrapStyle: React.CSSProperties = {
  borderTop: `1px solid ${C.borderSoft}`,
  background: C.surfaceFaint,
  padding: "8px 12px 6px",
  display: "flex",
  flexDirection: "column",
  gap: 6,
  fontFamily: FONT,
};

const scrollRowStyle: React.CSSProperties = {
  display: "flex",
  gap: 6,
  overflowX: "auto",
  paddingBottom: 2,
  // Hide scrollbar visually but keep functionality
  scrollbarWidth: "none",
  msOverflowStyle: "none",
};

function chipStyle(captured: boolean, accent: string): React.CSSProperties {
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
    color: captured ? accent : C.ink,
    cursor: "pointer",
    whiteSpace: "nowrap",
    flexShrink: 0,
    transition: "all 120ms",
  };
}

const addMoreStyle: React.CSSProperties = {
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

const errorStyle: React.CSSProperties = {
  fontSize: 11,
  color: C.danger,
  padding: "0 2px",
};

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export function GuestDetailChips({
  inquiryId,
  accent = DEFAULT_ACCENT,
  accentInk,
  capturedKinds,
  capturedValues = {},
  onCapture,
  onAddMoreDetails,
}: GuestDetailChipsProps) {
  const [openKind, setOpenKind] = useState<GuestChipKind | null>(null);
  const [submitting, setSubmitting] = useState<GuestChipKind | null>(null);
  const [chipError, setChipError] = useState<string | null>(null);

  const resolvedAccentInk = accentInk || readableOn(accent);

  // Chips only render once an inquiry exists (strategy §10 progressive disclosure)
  if (!inquiryId) return null;

  function handleChipClick(kind: GuestChipKind) {
    if (submitting) return; // don't open during a save
    setChipError(null);
    // Toggle: clicking the open chip closes it
    setOpenKind((prev) => (prev === kind ? null : kind));
  }

  async function handleEditorSubmit(kind: GuestChipKind, value: GuestChipValue) {
    if (!inquiryId) return;
    setSubmitting(kind);
    setOpenKind(null);
    setChipError(null);
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

  return (
    <div style={wrapStyle}>
      {/* Chip scroll row */}
      <div style={scrollRowStyle}>
        {CHIPS.map(({ kind, defaultLabel, capturedLabel }) => {
          const isCaptured = capturedKinds.includes(kind);
          const isOpen = openKind === kind;
          const isSubmitting = submitting === kind;
          const capturedValue = capturedValues[kind];
          const valueLabel = capturedValue ? capturedLabel(capturedValue) : null;

          const label = isCaptured && valueLabel ? valueLabel : defaultLabel;

          return (
            <button
              key={kind}
              type="button"
              style={{
                ...chipStyle(isCaptured || isOpen, accent),
                opacity: isSubmitting ? 0.6 : 1,
              }}
              onClick={() => handleChipClick(kind)}
              aria-pressed={isCaptured}
              aria-label={isCaptured ? `Edit ${defaultLabel}: ${label}` : `Add ${defaultLabel}`}
              disabled={isSubmitting}
            >
              {isCaptured && (
                <CheckIcon color={accent} />
              )}
              {isSubmitting ? "Saving…" : label}
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
          onSubmit={(value) => void handleEditorSubmit(openKind, value)}
          onCancel={handleEditorCancel}
        />
      )}

      {/* Chip error display */}
      {chipError && <p style={errorStyle}>{chipError}</p>}

      {/* "Add more details" escalation affordance */}
      <button
        type="button"
        style={addMoreStyle}
        onClick={onAddMoreDetails}
        aria-label="Add more details in the full inquiry form"
      >
        Add more details →
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
