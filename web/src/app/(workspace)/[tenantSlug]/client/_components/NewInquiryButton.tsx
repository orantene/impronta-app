"use client";

/**
 * NewInquiryButton — primary CTA button + inquiry drawer used in every
 * client page header.
 *
 * Phase B-4 (2026-05-14) rewrite: now wraps the new canonical
 * <InquiryDrawer> (web/src/components/inquiry/InquiryDrawer.tsx) per
 * spec web/docs/inquiry-engine-spec-2026-05-14.md. Source defaults to
 * "direct_client_dashboard"; when `selectedTalentId` is passed (Discover
 * card flow) source becomes "discover_single_talent" and the talent is
 * pre-attached.
 *
 * The previous version wrapped the legacy NewInquiryForm; that component
 * stays in the tree for /client/inquiries/new but the canonical entry
 * point for the dashboard is now the new drawer.
 */

import { useState } from "react";
import { InquiryDrawer } from "@/components/inquiry/InquiryDrawer";
import type { InquirySource } from "@/lib/inquiry/inquiry-intent";

const FONT = '"Inter", system-ui, sans-serif';

const C = {
  ink: "#0B0B0D",
  border: "rgba(24,24,27,0.10)",
} as const;

export type ClientSummary = {
  displayName: string;
  company?: string | null;
  agencyName: string;
  /** Auth user id of the logged-in client. NULL for guest paths. */
  userId?: string | null;
  /** Optional email override. Falls back to session.user.email. */
  email?: string;
  /** Phone, trust, member metadata for the drawer's trust card. */
  phone?: string | null;
  photoUrl?: string | null;
  trustLevel?: "basic" | "verified" | "silver" | "gold";
  memberSince?: string;
  previousBookingsCount?: number;
};

export type RosterItem = {
  id: string;
  name: string;
  primaryTypeLabel?: string;
  city?: string;
};

type Variant = "primary" | "ghost" | "icon";

type Props = {
  tenantSlug: string;
  client: ClientSummary;
  roster: RosterItem[];
  variant?: Variant;
  label?: string;
  /** When the entry point already picked a talent (e.g. Discover card). */
  selectedTalentId?: string;
  /** Override the source value. Defaults are derived from selectedTalentId. */
  source?: InquirySource;
  /** Optional source-context payload for richer provenance. */
  sourceContext?: Record<string, unknown>;
};

export function NewInquiryButton({
  tenantSlug,
  client,
  roster,
  variant = "primary",
  label = "New inquiry",
  selectedTalentId,
  source,
  sourceContext,
}: Props) {
  const [open, setOpen] = useState(false);

  const btn =
    variant === "primary"
      ? primaryStyle
      : variant === "ghost"
        ? ghostStyle
        : iconStyle;

  // Derive source from caller hints if not explicitly set.
  const resolvedSource: InquirySource =
    source
    ?? (selectedTalentId ? "discover_single_talent" : "direct_client_dashboard");

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} style={btn}>
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 5v14M5 12h14" />
        </svg>
        {variant !== "icon" && <span>{label}</span>}
      </button>
      {open && (
        <InquiryDrawer
          source={resolvedSource}
          initialIntent={{
            requester: {
              name: client.displayName,
              email: client.email,
              phone: client.phone ?? undefined,
              user_id: client.userId ?? null,
              trust_level: client.trustLevel ?? "basic",
            },
            client: {
              company: client.company ?? undefined,
              same_as_requester: true,
            },
            talent: selectedTalentId
              ? {
                  selected_ids: [selectedTalentId],
                  selection_mode: "i_know_who",
                }
              : { selection_mode: "agency_recommends" },
            source_context: sourceContext,
          }}
          tenantSlug={tenantSlug}
          agencyName={client.agencyName}
          client={{
            user_id: client.userId,
            displayName: client.displayName,
            email: client.email,
            phone: client.phone,
            company: client.company,
            photo_url: client.photoUrl,
            trust_level: client.trustLevel,
            member_since: client.memberSince,
            previous_bookings_count: client.previousBookingsCount,
          }}
          roster={roster}
          enableDraftAutosave={!!client.userId}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

const primaryStyle: React.CSSProperties = {
  height: 38,
  padding: "0 16px",
  borderRadius: 9,
  background: C.ink,
  color: "#fff",
  border: "none",
  cursor: "pointer",
  fontFamily: FONT,
  fontSize: 13,
  fontWeight: 600,
  display: "inline-flex",
  alignItems: "center",
  gap: 7,
  letterSpacing: 0.1,
  boxShadow: "0 1px 2px rgba(0,0,0,0.08)",
  flexShrink: 0,
};

const ghostStyle: React.CSSProperties = {
  height: 34,
  padding: "0 14px",
  borderRadius: 8,
  background: "#fff",
  color: C.ink,
  border: `1px solid ${C.border}`,
  cursor: "pointer",
  fontFamily: FONT,
  fontSize: 12.5,
  fontWeight: 600,
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  flexShrink: 0,
};

const iconStyle: React.CSSProperties = {
  width: 36,
  height: 36,
  borderRadius: 9,
  background: C.ink,
  color: "#fff",
  border: "none",
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
};
