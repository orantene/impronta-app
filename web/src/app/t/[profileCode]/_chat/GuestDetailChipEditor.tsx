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
 * W1-A decomposition pre-pass: the 5 per-kind editors + their shared style
 * helpers were extracted to sibling files (GuestDetailChipEditor{Date,Location,
 * Headcount,EventType,Budget}.tsx + guest-detail-chip-editor-styles.ts) to keep
 * this file under the 800-line cap. This file is now just the dispatcher.
 *
 * House rules observed:
 *   • NO gold/rust accents — accent colour passed as prop (tenant brand).
 *   • NO fake presence signals.
 *   • Hook dependency arrays are real (no suppression of the deps lint).
 *   • Inline styles only (no Tailwind admin classes) — this is a public-facing
 *     surface, not the admin shell.
 *   • Under 800 lines.
 */

import type { Translator } from "@/i18n/interpolate";
import { paletteFor, readableOn, type SurfaceMode } from "./mini-chat-styles";
import type { GuestChipKind, GuestChipValue } from "@/lib/inquiry/guest-chat-contract";
import { DateEditor } from "./GuestDetailChipEditorDate";
import { LocationEditor } from "./GuestDetailChipEditorLocation";
import { HeadcountEditor } from "./GuestDetailChipEditorHeadcount";
import { EventTypeEditor } from "./GuestDetailChipEditorEventType";
import { BudgetEditor } from "./GuestDetailChipEditorBudget";

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
  /** Jon 360 Phase 7 — dark surface variant for noir tenants. Default "light". */
  surfaceMode?: SurfaceMode;
  onSubmit: (value: GuestChipValue) => void;
  onCancel: () => void;
};

// ─────────────────────────────────────────────────────────────────────────────
// Main export — GuestDetailChipEditor
// ─────────────────────────────────────────────────────────────────────────────

export function GuestDetailChipEditor({
  kind,
  initial,
  accent,
  accentInk,
  t,
  surfaceMode = "light",
  onSubmit,
  onCancel,
}: GuestDetailChipEditorProps) {
  const C = paletteFor(surfaceMode);
  const ink = accentInk || readableOn(accent);

  switch (kind) {
    case "date":
      return (
        <DateEditor
          initial={initial}
          accent={accent}
          accentInk={ink}
          t={t}
          C={C}
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
          C={C}
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
          C={C}
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
          C={C}
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
          C={C}
          onSubmit={onSubmit}
          onCancel={onCancel}
        />
      );
    default:
      return null;
  }
}
