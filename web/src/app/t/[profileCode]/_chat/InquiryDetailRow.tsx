"use client";

/**
 * InquiryDetailRow — one section row in the collapsible InquiryDetailsRail
 * (Message Impronta plan, ADDENDUM 2026-06-25 / A).
 *
 * A single row = leading section icon + label + a trailing filled-state
 * indicator (a filled accent check when that section has a value in the
 * useUnifiedInquiry draft, an empty/outline ring when not). Clicking opens that
 * section's editor (the rail owns one-open-at-a-time, so this is a controlled
 * button reporting clicks via onToggle).
 *
 * Two visual modes driven by `collapsed`:
 *   • collapsed = icon-only (thin rail). The filled state shows as a small accent
 *     dot on the icon; the label is visually hidden but kept for screen readers.
 *   • expanded  = icon + label + the filled check.
 *
 * a11y: a real <button> with aria-expanded (open editor) + an aria-label that
 * always conveys filled state ("added" / "not added yet") in both modes, a
 * visible focus ring, and a roving-free simple tab order. Reduced-motion safe:
 * the only transition is a short colour/opacity fade that collapses to nothing
 * under prefers-reduced-motion (handled by the rail's stylesheet).
 *
 * House rules: tenant accent only (no hardcoded gold), no em dashes,
 * "client" never "buyer", real lucide icons (never placeholder boxes).
 */

import type { LucideIcon } from "lucide-react";
import { Check } from "lucide-react";

import type { Translator } from "@/i18n/interpolate";
import { interpolate } from "@/i18n/interpolate";
import { C, FONT, readableOn, accentText } from "./mini-chat-styles";

export type InquiryDetailRowProps = {
  /** Section icon (lucide). */
  icon: LucideIcon;
  /** Human (already-localized) label ("Budget", "Location", ...). */
  label: string;
  /** Guest-locale translator (resolved from brand.locale). */
  t: Translator;
  /** True when this section has a value in the unified draft. */
  filled: boolean;
  /** True when this row's editor is currently open (one-open-at-a-time). */
  open: boolean;
  /** Collapsed rail = icon-only; expanded = icon + label + check. */
  collapsed: boolean;
  /** Tenant accent color (CSS string). */
  accent: string;
  /** Readable ink on accent (optional; derived when absent). */
  accentInk?: string;
  /** Open / close this section's editor. */
  onToggle: () => void;
};

export function InquiryDetailRow({
  icon: Icon,
  label,
  t,
  filled,
  open,
  collapsed,
  accent,
  accentInk,
  onToggle,
}: InquiryDetailRowProps) {
  const ink = accentInk || readableOn(accent);
  // a11y: the section icon paints the raw accent as a GLYPH on the pale rail
  // surface (transparent / `${accent}12` over C.surfaceFaint). A bright tenant
  // accent (gold) fails 4.5:1 there, so clamp the glyph color to an AA-legible
  // accent variant (unchanged when it already passes, e.g. the slate default).
  const accentGlyph = accentText(accent, C.surfaceFaint);

  return (
    <button
      type="button"
      data-uic-detail-row
      onClick={onToggle}
      aria-expanded={open}
      aria-label={interpolate(
        t(filled ? "public.guestChat.rowAddedAria" : "public.guestChat.rowNotAddedAria"),
        {
          label,
          action: open ? t("public.guestChat.rowClose") : t("public.guestChat.rowOpen"),
        },
      )}
      title={collapsed ? label : undefined}
      style={{
        display: "flex",
        alignItems: "center",
        gap: collapsed ? 0 : 10,
        justifyContent: collapsed ? "center" : "flex-start",
        width: "100%",
        padding: collapsed ? "9px 0" : "9px 12px",
        background: open ? `${accent}12` : "transparent",
        border: "none",
        borderLeft: collapsed
          ? "none"
          : `2px solid ${open ? accent : "transparent"}`,
        cursor: "pointer",
        textAlign: "left",
        fontFamily: FONT,
        color: C.ink,
        position: "relative",
      }}
    >
      {/* Leading section icon. The filled-state dot rides on the icon when the
          rail is collapsed (no room for the trailing check). */}
      <span
        style={{
          position: "relative",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: 24,
          height: 24,
          flexShrink: 0,
          color: open || filled ? accentGlyph : C.inkMuted,
        }}
      >
        <Icon size={18} strokeWidth={1.9} aria-hidden />
        {collapsed && filled && (
          <span
            aria-hidden
            style={{
              position: "absolute",
              top: -1,
              right: -1,
              width: 8,
              height: 8,
              borderRadius: 999,
              background: accent,
              border: `1.5px solid ${C.surface}`,
            }}
          />
        )}
      </span>

      {/* Label — visible when expanded, visually hidden (but readable) when not. */}
      <span
        style={
          collapsed
            ? {
                position: "absolute",
                width: 1,
                height: 1,
                padding: 0,
                margin: -1,
                overflow: "hidden",
                clipPath: "inset(50%)",
                whiteSpace: "nowrap",
                border: 0,
              }
            : {
                flex: 1,
                minWidth: 0,
                fontSize: 13,
                fontWeight: filled ? 600 : 500,
                color: filled ? C.ink : C.inkMuted,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }
        }
      >
        {label}
      </span>

      {/* Trailing filled-state indicator (expanded only). Filled = accent check;
          empty = outline ring, never a placeholder box. */}
      {!collapsed && (
        <span
          aria-hidden
          style={{
            width: 18,
            height: 18,
            borderRadius: 999,
            flexShrink: 0,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            background: filled ? accent : "transparent",
            border: filled ? `1.5px solid ${accent}` : `1.5px solid ${C.border}`,
          }}
        >
          {filled && <Check size={11} strokeWidth={2.6} color={ink} aria-hidden />}
        </span>
      )}
    </button>
  );
}
