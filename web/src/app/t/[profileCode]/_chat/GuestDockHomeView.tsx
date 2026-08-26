"use client";

/**
 * GuestDockHomeView — DOCK v2 landing hub (the new default view).
 *
 * Modeled on the Intercom/tawk messenger "home": a small friendly hero (agency
 * avatar + a one-line invite) over a few big, rounded, generously-tapped action
 * cards — the "mini control center" the owner asked for. No dense detail dump,
 * no long buttons: just the handful of things a guest actually does.
 *
 *   Start / Continue inquiry  → jump to Chat (resume the draft if one exists)
 *   Your inquiries (N)        → Projects view
 *   Your lineup (N)           → Lineup view
 *   Account                   → guest: save-this-conversation (reuses the claim
 *                               flow); signed-in: open the client dashboard
 *
 * House rules: tenant accent only (no gold/rust), editorial serif for the
 * greeting, dark-aware palette, "client"/"lineup" never "buyer"/"cart", no em
 * dashes. The agency identity lives in the panel header, never repeated here.
 */

import { MessageCircle, Users, Sparkles, LayoutDashboard, ChevronRight } from "lucide-react";

import type { Translator } from "@/i18n/interpolate";
import { interpolate } from "@/i18n/interpolate";
import type {
  AddClaimEmailCallback,
  CheckGuestClaimEmailCallback,
  GuestIdentityTier,
  MiniChatBrand,
} from "@/lib/inquiry/guest-chat-contract";

import { GuestAccountToolkit } from "./GuestAccountToolkit";
import { FONT, FONT_DISPLAY, accentText, type Palette, type SurfaceMode } from "./mini-chat-styles";

export type GuestDockHomeViewProps = {
  brand: MiniChatBrand;
  accent: string;
  accentInk: string;
  talentFirst: string;
  C: Palette;
  surfaceMode?: SurfaceMode;
  t: Translator;
  identity: GuestIdentityTier;
  /** A private, un-sent draft exists → the primary card reads "Continue". */
  draftExists: boolean;
  inquiriesCount: number;
  lineupCount: number;
  /** Jump to Chat (resume/continue the draft, or start fresh). */
  onStartInquiry: () => void;
  onOpenProjects: () => void;
  onOpenLineup: () => void;
  /** Signed-in client: link to the unified dashboard inbox. Null for guests. */
  dashboardHref: string | null;
  // ── Account (claim) wiring — reuses GuestAccountToolkit for guests ──────────
  inquiryId: string | null;
  guestEmail: string | null;
  onAddClaimEmail: AddClaimEmailCallback | null;
  onCheckClaimEmail?: CheckGuestClaimEmailCallback | null;
  onGuestEmailUpdated?: (email: string) => void;
};

function ActionCard({
  Icon,
  title,
  subtitle,
  count,
  accent,
  C,
  onClick,
}: {
  Icon: typeof MessageCircle;
  title: string;
  subtitle?: string | null;
  count?: number;
  accent: string;
  C: Palette;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        width: "100%",
        textAlign: "left",
        padding: "13px 14px",
        borderRadius: 14,
        border: `1px solid ${C.borderSoft}`,
        background: C.surface,
        cursor: "pointer",
        fontFamily: FONT,
        boxShadow: "0 1px 2px rgba(16,18,29,0.04)",
        transition: "border-color 120ms, background 120ms",
      }}
    >
      <span
        aria-hidden
        style={{
          width: 38,
          height: 38,
          borderRadius: 11,
          flexShrink: 0,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          background: `${accent}14`,
          color: accentText(accent, C.surface),
        }}
      >
        <Icon size={19} strokeWidth={2.1} />
      </span>
      <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 1 }}>
        <span
          style={{
            display: "flex",
            alignItems: "center",
            gap: 7,
            fontSize: 13.5,
            fontWeight: 600,
            color: C.ink,
          }}
        >
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {title}
          </span>
          {count != null && count > 0 && (
            <span
              aria-hidden
              style={{
                minWidth: 18,
                height: 18,
                padding: "0 5px",
                borderRadius: 999,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                background: `${accent}18`,
                color: accentText(accent, C.surface),
                fontSize: 10.5,
                fontWeight: 700,
                flexShrink: 0,
              }}
            >
              {count}
            </span>
          )}
        </span>
        {subtitle && (
          <span
            style={{
              fontSize: 11.5,
              color: C.inkMuted,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {subtitle}
          </span>
        )}
      </span>
      <ChevronRight size={17} strokeWidth={2} aria-hidden style={{ color: C.inkDim, flexShrink: 0 }} />
    </button>
  );
}

export function GuestDockHomeView({
  brand,
  accent,
  accentInk,
  talentFirst,
  C,
  surfaceMode = "light",
  t,
  identity,
  draftExists,
  inquiriesCount,
  lineupCount,
  onStartInquiry,
  onOpenProjects,
  onOpenLineup,
  dashboardHref,
  inquiryId,
  guestEmail,
  onAddClaimEmail,
  onCheckClaimEmail,
  onGuestEmailUpdated,
}: GuestDockHomeViewProps) {
  const isAccount = identity === "account";
  const startTitle = draftExists
    ? t("public.guestChat.homeContinueTitle")
    : t("public.guestChat.homeStartTitle");
  const startSubtitle = draftExists
    ? t("public.guestChat.homeContinueSub")
    : interpolate(t("public.guestChat.homeStartSub"), { name: talentFirst });

  return (
    <div
      data-guest-dock-view="home"
      style={{
        flex: 1,
        minHeight: 0,
        overflowY: "auto",
        overscrollBehavior: "contain",
        background: C.surface,
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* ── Greeting ──────────────────────────────────────────────────────
          v2.1 opened Home with the agency logo + the agency name + a greeting,
          sitting directly beneath a header that had just shown the same logo
          and the same name. The owner read the screen as a repeat, correctly.
          The header owns the identity; Home only needs to say hello. ────── */}
      <div style={{ padding: "18px 16px 14px" }}>
        <div
          style={{
            fontFamily: FONT_DISPLAY,
            fontSize: 17,
            fontWeight: 600,
            color: C.ink,
            lineHeight: 1.35,
          }}
        >
          {t("public.guestChat.homeHeroLine")}
        </div>
      </div>

      {/* ── Action cards ─────────────────────────────────────────────────── */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "0 14px 8px" }}>
        <ActionCard
          Icon={MessageCircle}
          title={startTitle}
          subtitle={startSubtitle}
          accent={accent}
          C={C}
          onClick={onStartInquiry}
        />
        <ActionCard
          Icon={Sparkles}
          title={t("public.guestChat.homeInquiriesTitle")}
          subtitle={t("public.guestChat.homeInquiriesSub")}
          count={inquiriesCount}
          accent={accent}
          C={C}
          onClick={onOpenProjects}
        />
        <ActionCard
          Icon={Users}
          title={t("public.guestChat.homeLineupTitle")}
          subtitle={t("public.guestChat.homeLineupSub")}
          count={lineupCount}
          accent={accent}
          C={C}
          onClick={onOpenLineup}
        />
        {isAccount && dashboardHref && (
          <a
            href={dashboardHref}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              width: "100%",
              textDecoration: "none",
              padding: "13px 14px",
              borderRadius: 14,
              border: `1px solid ${C.borderSoft}`,
              background: C.surface,
              fontFamily: FONT,
              boxShadow: "0 1px 2px rgba(16,18,29,0.04)",
            }}
          >
            <span
              aria-hidden
              style={{
                width: 38,
                height: 38,
                borderRadius: 11,
                flexShrink: 0,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                background: `${accent}14`,
                color: accentText(accent, C.surface),
              }}
            >
              <LayoutDashboard size={19} strokeWidth={2.1} />
            </span>
            <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 1 }}>
              <span style={{ fontSize: 13.5, fontWeight: 600, color: C.ink }}>
                {t("public.guestChat.homeDashboardTitle")}
              </span>
              <span style={{ fontSize: 11.5, color: C.inkMuted }}>
                {t("public.guestChat.homeDashboardSub")}
              </span>
            </span>
            <ChevronRight size={17} strokeWidth={2} aria-hidden style={{ color: C.inkDim, flexShrink: 0 }} />
          </a>
        )}
      </div>

      {/* ── Account / save-this-conversation (guests only) ─────────────────
          Sits directly under the action cards, not pinned to the base. With the
          identity block gone the panel is short, and the old `marginTop: auto`
          flung this card to the bottom edge behind a column of nothing. ───── */}
      {!isAccount && (
        <div style={{ padding: "8px 14px 16px" }}>
          <GuestAccountToolkit
            inquiryId={inquiryId}
            guestEmail={guestEmail}
            identity={identity}
            accent={accent}
            accentInk={accentInk}
            onAddClaimEmail={onAddClaimEmail}
            onCheckClaimEmail={onCheckClaimEmail}
            onGuestEmailUpdated={onGuestEmailUpdated}
            surfaceMode={surfaceMode}
          />
        </div>
      )}
    </div>
  );
}
