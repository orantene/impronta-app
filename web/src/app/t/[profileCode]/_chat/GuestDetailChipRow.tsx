"use client";

/**
 * GuestDetailChipRow — the horizontal detail chip row above the composer for the
 * unified inquiry chat (Wave 1 panel rebuild / W1-B + W1-G).
 *
 * This REPLACES the floating InquiryDetailsRail in the compact panel (and is the
 * details surface in the expanded right pane too). The old rail stacked a 6-8 icon
 * strip that floated over the conversation, crushed the thread to ~2 lines, and
 * clipped its own lower icons with no scroll (audit P1-9). The rebuild lays the
 * same fields out as a single horizontal scroll row of chips that sits in the
 * composer band, so the conversation stays the only vertical grower.
 *
 * Chips (plan order): Date · Location · Budget · Headcount · Type · Brief ·
 * Contact, plus Talent when the roster + talent handlers are wired (preserves the
 * empty-cart "pick talent" deep-link the rail used to own). Each chip shows its
 * value + a check when set; tapping opens the field's editor in a bottom sheet
 * (GuestDetailBottomSheet) rather than an inline block that would push the
 * composer off-screen.
 *
 * The editors are the EXISTING reusable components (no logic rewrite): the five
 * chip kinds use GuestDetailChipEditor; Brief uses BriefEditor; Contact uses
 * ContactEditor; Talent uses TalentPickerEditor. Every commit routes through the
 * same handlers the rail used (onPatchChip / onBriefChange / onContactChange /
 * onTalentChange => useUnifiedInquiry.patch), so there is ONE source of truth.
 *
 * House rules: tenant accent only (no hardcoded gold), no em dashes, "client"
 * never "buyer", inline styles only, `overscroll-behavior: contain` on the chip
 * scroll row so a horizontal fling never scrolls the page.
 */

import { useEffect, useRef, useState } from "react";

import type {
  GuestChipKind,
  GuestChipValue,
  ListGuestTenantRosterCallback,
} from "@/lib/inquiry/guest-chat-contract";
import type { InquiryIntent } from "@/lib/inquiry/inquiry-intent";
import type { Translator } from "@/i18n/interpolate";
import { interpolate } from "@/i18n/interpolate";

import type { UnifiedSyncState } from "./use-unified-inquiry";
import { BriefEditor } from "./BriefEditor";
import { ContactEditor } from "./ContactEditor";
import { GuestDetailBottomSheet } from "./GuestDetailBottomSheet";
import { GuestDetailChipEditor } from "./GuestDetailChipEditor";
import { TalentPickerEditor } from "./TalentPickerEditor";
import {
  FONT,
  accentText,
  paletteFor,
  readableOn,
  type Palette,
  type SurfaceMode,
} from "./mini-chat-styles";

// ─────────────────────────────────────────────────────────────────────────────
// Kinds + labels
// ─────────────────────────────────────────────────────────────────────────────

/** A chip in the row: the 5 structured chip kinds + the composite sections. */
type ChipRowKind = GuestChipKind | "brief" | "contact" | "talent";

/** Human value label for a chip, or null when the field is empty. */
function chipValueLabel(
  kind: ChipRowKind,
  intent: InquiryIntent,
  capturedValues: Partial<Record<GuestChipKind, GuestChipValue>>,
  t: Translator,
): string | null {
  switch (kind) {
    case "date": {
      const v = capturedValues.date;
      if (v?.eventDate) {
        try {
          return new Date(v.eventDate + "T00:00:00").toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
          });
        } catch {
          return v.eventDate;
        }
      }
      if (v?.dateStatus === "flexible") return t("public.guestChat.chipFlexible");
      if (v?.dateStatus === "not_sure") return t("public.guestChat.chipDateTbd");
      if (intent.date?.event_date) return intent.date.event_date;
      return null;
    }
    case "location": {
      const v = capturedValues.location;
      if (v?.locationStatus === "online") return t("public.guestChat.chipOnline");
      if (v?.city?.trim()) return v.city.trim();
      if (v?.locationStatus === "not_sure") return t("public.guestChat.chipTbd");
      if (intent.location?.city?.trim()) return intent.location.city.trim();
      return null;
    }
    case "headcount": {
      const n = capturedValues.headcount?.headcount ?? intent.talent?.count_needed ?? null;
      if (n != null && n > 0) {
        return interpolate(t("public.guestChat.chipGuestsWithCount"), {
          count: n,
          unit:
            n === 1
              ? t("public.guestChat.guestOne")
              : t("public.guestChat.guestOther"),
        });
      }
      return null;
    }
    case "event_type": {
      const v = capturedValues.event_type?.eventType?.trim();
      if (v) return v;
      const ai = intent.source_context?.["ai_event_type"];
      return typeof ai === "string" && ai.trim() ? ai.trim() : null;
    }
    case "budget": {
      const v = capturedValues.budget;
      if (v?.budgetAmount != null && v.currency) {
        return `${v.currency} ${v.budgetAmount.toLocaleString()}`;
      }
      if (v?.budgetPreference && v.budgetPreference !== "not_sure") {
        return v.budgetPreference === "agency_recommends"
          ? t("public.guestChat.chipAgencyRecommends")
          : v.budgetPreference.replace(/_/g, " ");
      }
      if (intent.budget?.amount != null && intent.budget.amount > 0) {
        return String(intent.budget.amount);
      }
      return null;
    }
    case "brief": {
      const s = intent.brief?.summary?.trim();
      if (!s) return null;
      return s.length > 22 ? `${s.slice(0, 21).trimEnd()}…` : s;
    }
    case "contact": {
      const name = intent.requester?.name?.trim();
      if (name) return name;
      const email = intent.requester?.email?.trim();
      return email || null;
    }
    case "talent": {
      const n = intent.talent?.selected_ids?.length ?? 0;
      return n > 0 ? interpolate(t("public.guestChat.extraTalentFilled"), { count: n }) : null;
    }
    default:
      return null;
  }
}

function defaultLabelKey(kind: ChipRowKind): string {
  switch (kind) {
    case "date":
      return "public.guestChat.chipDate";
    case "location":
      return "public.guestChat.chipLocation";
    case "headcount":
      return "public.guestChat.chipHeadcount";
    case "event_type":
      return "public.guestChat.chipType";
    case "budget":
      return "public.guestChat.chipBudget";
    case "brief":
      return "public.guestChat.chipBrief";
    case "contact":
      return "public.guestChat.chipContact";
    case "talent":
      return "public.guestChat.chipTalent";
    default:
      return "public.guestChat.chipDate";
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
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
    flexShrink: 0,
  };
}

const scrollRowStyle: React.CSSProperties = {
  display: "flex",
  gap: 6,
  overflowX: "auto",
  paddingBottom: 2,
  // Hide the scrollbar visually but keep scroll; contain the fling to the row.
  scrollbarWidth: "none",
  msOverflowStyle: "none",
  overscrollBehavior: "contain",
};

function chipStyle(active: boolean, accent: string, C: Palette): React.CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    height: 28,
    padding: "0 10px",
    borderRadius: 999,
    border: active ? `1.5px solid ${accent}` : `1px solid ${C.border}`,
    background: active ? `${accent}15` : C.surface,
    fontFamily: FONT,
    fontSize: 12,
    fontWeight: active ? 600 : 400,
    color: active ? accentText(accent, C.surfaceFaint) : C.ink,
    cursor: "pointer",
    whiteSpace: "nowrap",
    flexShrink: 0,
    transition: "background 600ms ease, border-color 600ms ease, all 120ms",
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────────────────────

export type GuestDetailChipRowProps = {
  /** The live unified draft (single source of truth for filled-state + labels). */
  intent: InquiryIntent;
  /** Tenant accent color (CSS string). */
  accent: string;
  /** Readable ink on the accent. */
  accentInk: string;
  /** Guest-locale translator (resolved from brand.locale). */
  t: Translator;
  /** Jon 360 Phase 7 dark surface variant for noir tenants. Default "light". */
  surfaceMode?: SurfaceMode;
  /** Tenant slug, forwarded to the talent picker's roster loader. */
  tenantSlug: string;
  /** Per-kind captured chip values (pre-fill re-edit for the 5 chip kinds). */
  capturedValues?: Partial<Record<GuestChipKind, GuestChipValue>>;
  /** Per-kind sync status (drives the field-level saving/error hint). */
  fieldState?: Record<string, UnifiedSyncState>;
  /** Kinds a remote edit just changed, for the accent flash. */
  remoteFlashKinds?: GuestChipKind[];
  /** Injected guest-safe roster loader; when null the Talent chip is hidden. */
  onListRoster?: ListGuestTenantRosterCallback | null;
  /** Commit a Date/Location/Headcount/Type/Budget edit. */
  onPatchChip: (kind: GuestChipKind, value: GuestChipValue) => void | Promise<void>;
  /** Commit a talent selection. */
  onTalentChange?: (
    selectedIds: string[],
    selectionMode: "i_know_who" | "agency_recommends",
    selectedNames: string[],
  ) => void;
  /** Commit a brief edit. */
  onBriefChange?: (summary: string) => void;
  /** Commit a contact edit. */
  onContactChange?: (value: { name: string; email: string; phone: string }) => void;
  /**
   * Deep-link: open a section's editor once (the launcher +N chip / empty-cart
   * lead points at "talent"). Cleared via onConsumeOpenTo once applied.
   */
  openToSection?: "talent" | null;
  /** Clear the openToSection one-shot once applied. */
  onConsumeOpenTo?: () => void;
};

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export function GuestDetailChipRow({
  intent,
  accent,
  accentInk,
  t,
  surfaceMode = "light",
  tenantSlug,
  capturedValues = {},
  fieldState = {},
  remoteFlashKinds = [],
  onListRoster = null,
  onPatchChip,
  onTalentChange,
  onBriefChange,
  onContactChange,
  openToSection = null,
  onConsumeOpenTo,
}: GuestDetailChipRowProps) {
  const C = paletteFor(surfaceMode);
  const ink = accentInk || readableOn(accent);
  const accentGlyph = accentText(accent, C.surfaceFaint);
  const [openKind, setOpenKind] = useState<ChipRowKind | null>(null);

  // Deep-link one-shot: open the requested section's sheet, then consume it so a
  // later manual close sticks. Guarded by a ref against the callback's per-render
  // identity re-triggering the effect.
  const appliedOpenToRef = useRef<string | null>(null);
  const onConsumeRef = useRef(onConsumeOpenTo);
  useEffect(() => {
    onConsumeRef.current = onConsumeOpenTo;
  }, [onConsumeOpenTo]);
  // Only the Talent chip is deep-linked today; open it only when it is actually
  // available (roster loader + handler present), so we never open an empty sheet.
  const talentChipAvailable = Boolean(onTalentChange && onListRoster);
  useEffect(() => {
    if (!openToSection) {
      appliedOpenToRef.current = null;
      return;
    }
    if (appliedOpenToRef.current === openToSection) return;
    appliedOpenToRef.current = openToSection;
    if (openToSection === "talent" && !talentChipAvailable) {
      onConsumeRef.current?.();
      return;
    }
    setOpenKind(openToSection);
    onConsumeRef.current?.();
  }, [openToSection, talentChipAvailable]);

  // The chip set: the 5 structured kinds + brief + contact, then talent last
  // (only when the roster + handler are wired, so it is never a dead chip).
  const kinds: ChipRowKind[] = ["date", "location", "budget", "headcount", "event_type"];
  if (onBriefChange) kinds.push("brief");
  if (onContactChange) kinds.push("contact");
  if (onTalentChange && onListRoster) kinds.push("talent");

  function closeSheet() {
    setOpenKind(null);
  }

  return (
    <div style={wrapStyle(C)}>
      <div style={scrollRowStyle}>
        {kinds.map((kind) => {
          const valueLabel = chipValueLabel(kind, intent, capturedValues, t);
          const filled = valueLabel != null;
          const isOpen = openKind === kind;
          const label = filled ? (valueLabel as string) : t(defaultLabelKey(kind));
          const chipKind = kind as GuestChipKind;
          const fState = fieldState[chipKind];
          const isSaving = fState === "saving";
          const isErr = fState === "error";
          const isFlashing = remoteFlashKinds.includes(chipKind);

          return (
            <button
              key={kind}
              type="button"
              onClick={() => setOpenKind((prev) => (prev === kind ? null : kind))}
              aria-pressed={filled}
              aria-label={
                filled
                  ? interpolate(t("public.guestChat.chipEditAria"), {
                      label: t(defaultLabelKey(kind)),
                      value: label,
                    })
                  : interpolate(t("public.guestChat.chipAddAria"), {
                      label: t(defaultLabelKey(kind)),
                    })
              }
              style={{
                ...chipStyle(filled || isOpen, accent, C),
                opacity: isSaving ? 0.6 : 1,
                ...(isFlashing ? { background: `${accent}14`, borderColor: accent } : {}),
                ...(isErr ? { borderColor: C.danger } : {}),
              }}
            >
              {filled && !isSaving && <CheckIcon color={accentGlyph} />}
              {isSaving ? t("public.guestChat.chipSaving") : label}
            </button>
          );
        })}
      </div>

      {/* One editor at a time, hosted in a bottom sheet over the panel. */}
      <GuestDetailBottomSheet
        open={openKind !== null}
        onClose={closeSheet}
        t={t}
        surfaceMode={surfaceMode}
      >
        {openKind &&
          openKind !== "brief" &&
          openKind !== "contact" &&
          openKind !== "talent" && (
            <GuestDetailChipEditor
              kind={openKind}
              initial={capturedValues[openKind] ?? null}
              accent={accent}
              accentInk={ink}
              surfaceMode={surfaceMode}
              t={t}
              onSubmit={(value) => {
                void onPatchChip(openKind, value);
                closeSheet();
              }}
              onCancel={closeSheet}
            />
          )}

        {openKind === "brief" && onBriefChange && (
          <BriefEditor
            initialSummary={intent.brief?.summary ?? null}
            accent={accent}
            accentInk={ink}
            surfaceMode={surfaceMode}
            t={t}
            onSubmit={(summary) => {
              onBriefChange(summary);
              closeSheet();
            }}
            onCancel={closeSheet}
          />
        )}

        {openKind === "contact" && onContactChange && (
          <ContactEditor
            initial={{
              name: intent.requester?.name ?? "",
              email: intent.requester?.email ?? "",
              phone: intent.requester?.phone ?? "",
            }}
            accent={accent}
            accentInk={ink}
            surfaceMode={surfaceMode}
            t={t}
            onSubmit={(value) => {
              onContactChange(value);
              closeSheet();
            }}
            onCancel={closeSheet}
          />
        )}

        {openKind === "talent" && onTalentChange && (
          <TalentPickerEditor
            selectedIds={intent.talent?.selected_ids ?? []}
            accent={accent}
            tenantSlug={tenantSlug}
            surfaceMode={surfaceMode}
            t={t}
            onListRoster={onListRoster}
            onChange={(ids, mode, names) => onTalentChange(ids, mode, names)}
          />
        )}
      </GuestDetailBottomSheet>
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
