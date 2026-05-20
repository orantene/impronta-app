"use client";

// ─── WS-6.9 Empty states per surface — 12 pre-wired variants ─────────
//
// Extracted from primitives.tsx — Phase 1f decomposition.

import { COLORS } from "../state";
import { EmptyState } from "./cards";
import { Skeleton } from "./interactions";

// WS-6.9  Empty states per surface — 12 pre-wired variants
// ─────────────────────────────────────────────────────────────────────────────
//
// All use the existing <EmptyState> primitive; each export is a thin wrapper
// with surface-specific copy + icon.  The caller passes action callbacks.

type EmptyVariantProps = {
  onPrimary?: () => void;
  onSecondary?: () => void;
};

export function InboxEmptyState({ onPrimary }: EmptyVariantProps) {
  return (
    <EmptyState
      icon="mail"
      title="Your inbox is clear"
      body="No new messages waiting. Conversations about inquiries and bookings will appear here."
      primaryLabel={onPrimary ? "Browse talent" : undefined}
      onPrimary={onPrimary}
    />
  );
}

export function InquiriesEmptyState({ onPrimary }: EmptyVariantProps) {
  return (
    <EmptyState
      icon="search"
      title="No inquiries yet"
      body="Send your first inquiry to start the booking process. Responses typically arrive within 24 hours."
      primaryLabel={onPrimary ? "New inquiry" : undefined}
      onPrimary={onPrimary}
    />
  );
}

export function BookingsEmptyState({ onPrimary }: EmptyVariantProps) {
  return (
    <EmptyState
      icon="calendar"
      title="No bookings yet"
      body="Confirmed bookings appear here. Inquiries convert to bookings once both parties agree on terms."
      primaryLabel={onPrimary ? "See inquiries" : undefined}
      onPrimary={onPrimary}
    />
  );
}

export function TalentRosterEmptyState({ onPrimary }: EmptyVariantProps) {
  return (
    <EmptyState
      icon="team"
      title="Your roster is empty"
      body="Add talent to your workspace to manage inquiries, bookings, and performance from one place."
      primaryLabel={onPrimary ? "Add talent" : undefined}
      onPrimary={onPrimary}
    />
  );
}

export function ClientsEmptyState({ onPrimary }: EmptyVariantProps) {
  return (
    <EmptyState
      icon="user"
      title="No clients yet"
      body="Clients who book through your workspace will appear here along with their spend history."
      primaryLabel={onPrimary ? "Share booking link" : undefined}
      onPrimary={onPrimary}
    />
  );
}

export function ShortlistsEmptyState({ onPrimary }: EmptyVariantProps) {
  return (
    <EmptyState
      icon="sparkle"
      title="No shortlists saved"
      body="Shortlists let you group talent for a project and share them with collaborators for review."
      primaryLabel={onPrimary ? "Browse talent" : undefined}
      onPrimary={onPrimary}
    />
  );
}

export function CalendarEmptyState({ onPrimary }: EmptyVariantProps) {
  return (
    <EmptyState
      icon="calendar"
      title="Nothing scheduled"
      body="Confirmed bookings and set-call appointments will appear on your calendar automatically."
      primaryLabel={onPrimary ? "View bookings" : undefined}
      onPrimary={onPrimary}
    />
  );
}

export function MessagesEmptyState({ onPrimary }: EmptyVariantProps) {
  return (
    <EmptyState
      icon="mail"
      title="No messages yet"
      body="Start a conversation by sending an inquiry. All replies and notes will be threaded here."
      primaryLabel={onPrimary ? "Compose" : undefined}
      onPrimary={onPrimary}
    />
  );
}

export function FilesEmptyState({ onPrimary }: EmptyVariantProps) {
  return (
    <EmptyState
      icon="info"
      title="No files attached"
      body="Upload call sheets, contracts, or mood boards to keep everything linked to this project."
      primaryLabel={onPrimary ? "Upload file" : undefined}
      onPrimary={onPrimary}
    />
  );
}

export function SearchEmptyState({ query }: { query?: string }) {
  return (
    <EmptyState
      icon="search"
      title={query ? `No results for "${query}"` : "No results"}
      body="Try different keywords, or adjust your filters to broaden the search."
    />
  );
}

export function NotificationsEmptyState() {
  return (
    <EmptyState
      icon="sparkle"
      title="All caught up"
      body="You're up to date. Notifications about activity across your workspace will appear here."
    />
  );
}

export function AgenciesEmptyState({ onPrimary }: EmptyVariantProps) {
  return (
    <EmptyState
      icon="team"
      title="Not represented by any agency"
      body="When an agency adds you to their roster, they'll appear here. You can also request representation."
      primaryLabel={onPrimary ? "Request representation" : undefined}
      onPrimary={onPrimary}
    />
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// WS-6.10  Skeleton states per surface — 8 most-used pages / drawers
// ─────────────────────────────────────────────────────────────────────────────

function SkRow({ label = true, action = false }: { label?: boolean; action?: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 0", borderBottom: `1px solid ${COLORS.border}` }}>
      <Skeleton width={36} height={36} radius={18} />
      <div className="flex-1">
        {label && <Skeleton height={13} width="55%" style={{ marginBottom: 5 }} />}
        <Skeleton height={11} width="35%" />
      </div>
      {action && <Skeleton height={28} width={72} radius={6} />}
    </div>
  );
}

/** Skeleton for the inbox/messages list */
