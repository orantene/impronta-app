"use client";

/**
 * GuestDetailsSheet — DOCK v2 details editor, folded behind ONE "Add details"
 * button.
 *
 * The old always-visible 6-chip row (Date · Location · Budget · Headcount · Type
 * · Brief) was the "too overwhelming" part of the panel. DOCK v2 removes it from
 * the conversation and gathers every field into this single sheet, opened on
 * demand from the slim GuestDetailsControl button above the composer. The sheet
 * shows a calm LIST of rows (each row: label + current value + a check when set);
 * tapping a row opens that field's editor. A back arrow returns to the list.
 *
 * Every editor is the EXISTING reusable component (GuestDetailChipEditor /
 * BriefEditor / ContactEditor / TalentPickerEditor) wired to the SAME unified
 * patch handlers the chip row used — no logic rewrite, one source of truth.
 *
 * "Fill from conversation" (owner Addendum B) calls the shipped
 * scanGuestConversationForDetails action for the inquiry and confirms inline what
 * it found; the filled values refresh through the panel's realtime reconcile.
 *
 * House rules: tenant accent only, dark-aware palette, "client"/"lineup" never
 * "buyer"/"cart", no em dashes, reduced-motion safe (host sheet handles it).
 */

import { useState } from "react";
import { ArrowLeft, Check, ChevronRight, Sparkles } from "lucide-react";

import type {
  GuestChipKind,
  GuestChipValue,
  ListGuestTenantRosterCallback,
  ScanGuestConversationCallback,
} from "@/lib/inquiry/guest-chat-contract";
import type { InquiryIntent } from "@/lib/inquiry/inquiry-intent";
import type { Translator } from "@/i18n/interpolate";
import { interpolate } from "@/i18n/interpolate";

import { BriefEditor } from "./BriefEditor";
import { ContactEditor } from "./ContactEditor";
import { GuestDetailBottomSheet } from "./GuestDetailBottomSheet";
import { GuestDetailChipEditor } from "./GuestDetailChipEditor";
import { TalentPickerEditor } from "./TalentPickerEditor";
import { isDetailFilled, isContactFilled, isTalentFilled } from "./guest-detail-progress";
import {
  FONT,
  accentText,
  paletteFor,
  readableOn,
  type SurfaceMode,
} from "./mini-chat-styles";

type RowKind = GuestChipKind | "brief" | "contact" | "talent";

const SECTION_LABEL_KEY: Record<RowKind, string> = {
  date: "public.guestChat.sectionDate",
  location: "public.guestChat.sectionLocation",
  budget: "public.guestChat.sectionBudget",
  headcount: "public.guestChat.sectionHeadcount",
  event_type: "public.guestChat.sectionType",
  brief: "public.guestChat.sectionBrief",
  contact: "public.guestChat.sectionContact",
  talent: "public.guestChat.sectionTalent",
};

/** Compact current-value label for a row, or null when empty. */
function rowValueLabel(
  kind: RowKind,
  intent: InquiryIntent,
  captured: Partial<Record<GuestChipKind, GuestChipValue>>,
  t: Translator,
): string | null {
  switch (kind) {
    case "date": {
      const v = captured.date;
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
      return intent.date?.event_date ?? null;
    }
    case "location": {
      const v = captured.location;
      if (v?.locationStatus === "online") return t("public.guestChat.chipOnline");
      if (v?.city?.trim()) return v.city.trim();
      if (v?.locationStatus === "not_sure") return t("public.guestChat.chipTbd");
      return intent.location?.city?.trim() ?? null;
    }
    case "headcount": {
      const n = captured.headcount?.headcount ?? intent.talent?.count_needed ?? null;
      if (n != null && n > 0) {
        return interpolate(t("public.guestChat.chipGuestsWithCount"), {
          count: n,
          unit: n === 1 ? t("public.guestChat.guestOne") : t("public.guestChat.guestOther"),
        });
      }
      return null;
    }
    case "event_type": {
      const v = captured.event_type?.eventType?.trim();
      if (v) return v;
      const ai = intent.source_context?.["ai_event_type"];
      return typeof ai === "string" && ai.trim() ? ai.trim() : null;
    }
    case "budget": {
      const v = captured.budget;
      if (v?.budgetAmount != null && v.currency) {
        return `${v.currency} ${v.budgetAmount.toLocaleString()}`;
      }
      if (v?.budgetPreference && v.budgetPreference !== "not_sure") {
        return v.budgetPreference === "agency_recommends"
          ? t("public.guestChat.chipAgencyRecommends")
          : v.budgetPreference.replace(/_/g, " ");
      }
      return intent.budget?.amount != null && intent.budget.amount > 0
        ? String(intent.budget.amount)
        : null;
    }
    case "brief": {
      const s = intent.brief?.summary?.trim();
      if (!s) return null;
      return s.length > 28 ? `${s.slice(0, 27).trimEnd()}…` : s;
    }
    case "contact":
      return intent.requester?.name?.trim() || intent.requester?.email?.trim() || null;
    case "talent": {
      const n = intent.talent?.selected_ids?.length ?? 0;
      return n > 0 ? interpolate(t("public.guestChat.extraTalentFilled"), { count: n }) : null;
    }
    default:
      return null;
  }
}

function rowFilled(
  kind: RowKind,
  intent: InquiryIntent,
  captured: Partial<Record<GuestChipKind, GuestChipValue>>,
): boolean {
  if (kind === "contact") return isContactFilled(intent);
  if (kind === "talent") return isTalentFilled(intent);
  return isDetailFilled(kind, intent, captured);
}

export type GuestDetailsSheetProps = {
  open: boolean;
  onClose: () => void;
  intent: InquiryIntent;
  accent: string;
  accentInk: string;
  t: Translator;
  surfaceMode?: SurfaceMode;
  tenantSlug: string;
  capturedValues?: Partial<Record<GuestChipKind, GuestChipValue>>;
  onListRoster?: ListGuestTenantRosterCallback | null;
  onPatchChip: (kind: GuestChipKind, value: GuestChipValue) => void | Promise<void>;
  onTalentChange?: (
    selectedIds: string[],
    selectionMode: "i_know_who" | "agency_recommends",
    selectedNames: string[],
  ) => void;
  onBriefChange?: (summary: string) => void;
  onContactChange?: (value: { name: string; email: string; phone: string }) => void;
  /** The AI conversation scan (fill empty fields from the chat). Null hides it. */
  onScanConversation?: ScanGuestConversationCallback | null;
  /** The guest's unsent composer text — the scan's main input pre-send. */
  composerDraft?: string;
  /** The inquiry the scan targets. Null hides the scan button. */
  inquiryId: string | null;
};

export function GuestDetailsSheet({
  open,
  onClose,
  intent,
  accent,
  accentInk,
  t,
  surfaceMode = "light",
  tenantSlug,
  capturedValues = {},
  onListRoster = null,
  onPatchChip,
  onTalentChange,
  onBriefChange,
  onContactChange,
  onScanConversation = null,
  composerDraft = "",
  inquiryId,
}: GuestDetailsSheetProps) {
  const C = paletteFor(surfaceMode);
  const ink = accentInk || readableOn(accent);
  const accentGlyph = accentText(accent, C.surface);
  const [openKind, setOpenKind] = useState<RowKind | null>(null);
  const [scanState, setScanState] = useState<"idle" | "scanning" | "done">("idle");
  const [scanNote, setScanNote] = useState<string | null>(null);

  const rows: RowKind[] = ["date", "location", "budget", "headcount", "event_type"];
  if (onBriefChange) rows.push("brief");
  if (onContactChange) rows.push("contact");
  if (onTalentChange && onListRoster) rows.push("talent");

  function handleClose() {
    if (openKind !== null) {
      setOpenKind(null); // back to the list
      return;
    }
    setScanState("idle");
    setScanNote(null);
    onClose();
  }

  async function runScan() {
    if (!onScanConversation || !inquiryId || scanState === "scanning") return;
    setScanState("scanning");
    setScanNote(null);
    try {
      const res = await onScanConversation({ inquiryId, draftText: composerDraft });
      if (res.ok && res.scanned && res.filledKinds.length > 0) {
        const labels = res.filledKinds
          .map((k) => t(SECTION_LABEL_KEY[k as RowKind] ?? "public.guestChat.sectionBrief"))
          .join(", ");
        setScanNote(interpolate(t("public.guestChat.detailsScanFound"), { fields: labels }));
      } else {
        setScanNote(t("public.guestChat.detailsScanNothing"));
      }
    } catch {
      setScanNote(t("public.guestChat.detailsScanNothing"));
    }
    setScanState("done");
  }

  return (
    <GuestDetailBottomSheet open={open} onClose={handleClose} t={t} surfaceMode={surfaceMode}>
      {openKind === null ? (
        <div style={{ display: "flex", flexDirection: "column", padding: "2px 0 12px" }}>
          {/* Title */}
          <div
            style={{
              padding: "2px 16px 10px",
              fontSize: 15,
              fontWeight: 700,
              color: C.ink,
              fontFamily: FONT,
            }}
          >
            {t("public.guestChat.detailsSheetTitle")}
          </div>

          {/* Fill from conversation (AI scan) */}
          {onScanConversation && inquiryId && (
            <div style={{ padding: "0 14px 8px" }}>
              <button
                type="button"
                onClick={() => void runScan()}
                disabled={scanState === "scanning"}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 7,
                  width: "100%",
                  justifyContent: "center",
                  padding: "9px 12px",
                  borderRadius: 10,
                  border: `1px solid ${accent}44`,
                  background: `${accent}0f`,
                  color: accentGlyph,
                  fontFamily: FONT,
                  fontSize: 12.5,
                  fontWeight: 600,
                  cursor: scanState === "scanning" ? "default" : "pointer",
                  opacity: scanState === "scanning" ? 0.7 : 1,
                }}
              >
                <Sparkles size={14} strokeWidth={2.2} aria-hidden />
                {scanState === "scanning"
                  ? t("public.guestChat.detailsScanning")
                  : t("public.guestChat.detailsScanCta")}
              </button>
              {scanNote && (
                <div
                  role="status"
                  aria-live="polite"
                  style={{
                    marginTop: 6,
                    fontSize: 11.5,
                    color: C.inkMuted,
                    fontFamily: FONT,
                    lineHeight: 1.4,
                  }}
                >
                  {scanNote}
                </div>
              )}
            </div>
          )}

          {/* Rows */}
          <ul role="list" style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {rows.map((kind) => {
              const filled = rowFilled(kind, intent, capturedValues);
              const value = rowValueLabel(kind, intent, capturedValues, t);
              return (
                <li key={kind}>
                  <button
                    type="button"
                    onClick={() => setOpenKind(kind)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      width: "100%",
                      textAlign: "left",
                      padding: "12px 16px",
                      border: "none",
                      borderTop: `1px solid ${C.borderSoft}`,
                      background: "transparent",
                      cursor: "pointer",
                      fontFamily: FONT,
                    }}
                  >
                    <span
                      aria-hidden
                      style={{
                        width: 20,
                        height: 20,
                        borderRadius: 999,
                        flexShrink: 0,
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        background: filled ? accent : "transparent",
                        border: filled ? "none" : `1.5px solid ${C.border}`,
                      }}
                    >
                      {filled && <Check size={12} strokeWidth={3} color={ink} />}
                    </span>
                    <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 1 }}>
                      <span style={{ fontSize: 13.5, fontWeight: 600, color: C.ink }}>
                        {t(SECTION_LABEL_KEY[kind])}
                      </span>
                      <span
                        style={{
                          fontSize: 11.5,
                          color: filled ? C.inkMuted : C.inkDim,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {value ?? t("public.guestChat.detailsRowAdd")}
                      </span>
                    </span>
                    <ChevronRight size={16} strokeWidth={2} aria-hidden style={{ color: C.inkDim, flexShrink: 0 }} />
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column" }}>
          {/* Back to the list */}
          <button
            type="button"
            onClick={() => setOpenKind(null)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              alignSelf: "flex-start",
              margin: "2px 8px 0",
              padding: "6px 8px",
              border: "none",
              background: "transparent",
              color: C.inkMuted,
              cursor: "pointer",
              fontFamily: FONT,
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            <ArrowLeft size={15} strokeWidth={2.2} aria-hidden />
            {t("public.guestChat.detailsBack")}
          </button>

          {openKind !== "brief" && openKind !== "contact" && openKind !== "talent" && (
            <GuestDetailChipEditor
              kind={openKind}
              initial={capturedValues[openKind] ?? null}
              accent={accent}
              accentInk={ink}
              surfaceMode={surfaceMode}
              t={t}
              onSubmit={(value) => {
                void onPatchChip(openKind, value);
                setOpenKind(null);
              }}
              onCancel={() => setOpenKind(null)}
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
                setOpenKind(null);
              }}
              onCancel={() => setOpenKind(null)}
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
                setOpenKind(null);
              }}
              onCancel={() => setOpenKind(null)}
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
        </div>
      )}
    </GuestDetailBottomSheet>
  );
}
