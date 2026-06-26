"use client";

/**
 * GuestExtraDetailEditors — the "Add more details" expansion (Phase 2).
 *
 * Surfaces the three Phase-2 inquiry sections that don't fit the compact chip
 * row — Talent, Brief, Contact — as a small set of guided, one-open-at-a-time
 * inline editors beneath the chip row. NOT a sidebar, NOT a slide-up sheet, NOT
 * a two-pane (per the 2026-06-25 addendum): just inline rows that expand in place.
 *
 * Each row shows a leading label + a filled-state check + a short value preview;
 * clicking opens its reusable editor (TalentPickerEditor / BriefEditor /
 * ContactEditor). On commit the parent routes the change through
 * useUnifiedInquiry.patch (kind "talent" | "brief" | "contact"), which writes the
 * one inquiry record + emits a synced thread note, exactly like the chips.
 *
 * The editors are deliberately standalone components so the upcoming details
 * sidebar can rehouse them with no change here.
 *
 * House rules: tenant accent only (no hardcoded gold), no em dashes,
 * "client" never "buyer".
 */

import { useState } from "react";

import type { ListGuestTenantRosterCallback } from "@/lib/inquiry/guest-chat-contract";
import type { Translator } from "@/i18n/interpolate";
import { interpolate } from "@/i18n/interpolate";
import { BriefEditor } from "./BriefEditor";
import { ContactEditor } from "./ContactEditor";
import { TalentPickerEditor } from "./TalentPickerEditor";
import { C, FONT } from "./mini-chat-styles";

type ExtraKind = "talent" | "brief" | "contact";

export type GuestExtraDetailEditorsProps = {
  tenantSlug: string;
  accent: string;
  accentInk: string;
  /** Guest-locale translator (resolved from brand.locale). */
  t: Translator;

  /** Roster loader for the talent picker (injected; null hides search). */
  onListRoster?: ListGuestTenantRosterCallback | null;

  // Current values (from useUnifiedInquiry.intent).
  selectedTalentIds: string[];
  briefSummary: string | null;
  contact: { name: string | null; email: string | null; phone: string | null };

  // Commit handlers — the panel patches the single record.
  onTalentChange: (
    selectedIds: string[],
    selectionMode: "i_know_who" | "agency_recommends",
    selectedNames: string[],
  ) => void;
  onBriefChange: (summary: string) => void;
  onContactChange: (value: { name: string; email: string; phone: string }) => void;
};

function CheckDot({ filled, accent }: { filled: boolean; accent: string }) {
  return (
    <span
      aria-hidden
      style={{
        width: 16,
        height: 16,
        borderRadius: 999,
        flexShrink: 0,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        border: filled ? `1.5px solid ${accent}` : `1.5px solid ${C.border}`,
        background: filled ? accent : "transparent",
      }}
    >
      {filled && (
        <svg width={9} height={9} viewBox="0 0 10 10" fill="none">
          <path
            d="M1.5 5L4 7.5L8.5 2.5"
            stroke="#ffffff"
            strokeWidth={1.8}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
    </span>
  );
}

export function GuestExtraDetailEditors({
  tenantSlug,
  accent,
  accentInk,
  t,
  onListRoster,
  selectedTalentIds,
  briefSummary,
  contact,
  onTalentChange,
  onBriefChange,
  onContactChange,
}: GuestExtraDetailEditorsProps) {
  const [openKind, setOpenKind] = useState<ExtraKind | null>(null);

  const talentFilled = selectedTalentIds.length > 0;
  const briefFilled = Boolean(briefSummary && briefSummary.trim().length > 0);
  const contactFilled = Boolean(
    (contact.name && contact.name.trim()) || (contact.email && contact.email.trim()),
  );

  function preview(kind: ExtraKind): string {
    if (kind === "talent") {
      return talentFilled
        ? interpolate(t("public.guestChat.extraTalentFilled"), {
            count: selectedTalentIds.length,
          })
        : t("public.guestChat.extraTalentEmpty");
    }
    if (kind === "brief") {
      if (!briefFilled) return t("public.guestChat.extraBriefEmpty");
      const s = (briefSummary ?? "").trim();
      return s.length > 40 ? `${s.slice(0, 40)}…` : s;
    }
    // contact
    return contactFilled
      ? contact.name || contact.email || t("public.guestChat.extraContactAdded")
      : t("public.guestChat.extraContactPreview");
  }

  function toggle(kind: ExtraKind) {
    setOpenKind((prev) => (prev === kind ? null : kind));
  }

  const rows: { kind: ExtraKind; label: string; filled: boolean }[] = [
    { kind: "talent", label: t("public.guestChat.talentLabel"), filled: talentFilled },
    { kind: "brief", label: t("public.guestChat.sectionBrief"), filled: briefFilled },
    { kind: "contact", label: t("public.guestChat.extraYourInfo"), filled: contactFilled },
  ];

  return (
    <div
      style={{
        borderTop: `1px solid ${C.borderSoft}`,
        background: C.surface,
        fontFamily: FONT,
      }}
    >
      {rows.map(({ kind, label, filled }) => {
        const isOpen = openKind === kind;
        return (
          <div key={kind} style={{ borderBottom: `1px solid ${C.borderSoft}` }}>
            <button
              type="button"
              onClick={() => toggle(kind)}
              aria-expanded={isOpen}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                width: "100%",
                padding: "10px 14px",
                background: "transparent",
                border: "none",
                cursor: "pointer",
                textAlign: "left",
                fontFamily: FONT,
              }}
            >
              <CheckDot filled={filled} accent={accent} />
              <span style={{ minWidth: 0, flex: 1 }}>
                <span
                  style={{
                    display: "block",
                    fontSize: 13,
                    fontWeight: 600,
                    color: C.ink,
                  }}
                >
                  {label}
                </span>
                <span
                  style={{
                    display: "block",
                    fontSize: 11.5,
                    color: C.inkMuted,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {preview(kind)}
                </span>
              </span>
              <span
                aria-hidden
                style={{
                  color: C.inkDim,
                  transform: isOpen ? "rotate(90deg)" : "none",
                  transition: "transform 140ms",
                  flexShrink: 0,
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path d="m9 18 6-6-6-6" />
                </svg>
              </span>
            </button>

            {isOpen && kind === "talent" && (
              <TalentPickerEditor
                selectedIds={selectedTalentIds}
                accent={accent}
                tenantSlug={tenantSlug}
                t={t}
                onListRoster={onListRoster}
                onChange={(ids, mode, names) => onTalentChange(ids, mode, names)}
              />
            )}
            {isOpen && kind === "brief" && (
              <BriefEditor
                initialSummary={briefSummary}
                accent={accent}
                accentInk={accentInk}
                t={t}
                onSubmit={(summary) => {
                  onBriefChange(summary);
                  setOpenKind(null);
                }}
                onCancel={() => setOpenKind(null)}
              />
            )}
            {isOpen && kind === "contact" && (
              <ContactEditor
                initial={{
                  name: contact.name ?? "",
                  email: contact.email ?? "",
                  phone: contact.phone ?? "",
                }}
                accent={accent}
                accentInk={accentInk}
                t={t}
                onSubmit={(value) => {
                  onContactChange(value);
                  setOpenKind(null);
                }}
                onCancel={() => setOpenKind(null)}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
