"use client";

// ─── WS-6.9 Empty states per surface — 12 pre-wired variants ─────────
//
// Extracted from primitives.tsx — Phase 1f decomposition.

import { useT } from "@/i18n/use-t";
import { interpolate } from "@/i18n/interpolate";
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
  const t = useT();
  return (
    <EmptyState
      icon="mail"
      title={t("dashboard.adminShell.emptyStates.inbox.title")}
      body={t("dashboard.adminShell.emptyStates.inbox.body")}
      primaryLabel={onPrimary ? t("dashboard.adminShell.emptyStates.inbox.primary") : undefined}
      onPrimary={onPrimary}
    />
  );
}

export function InquiriesEmptyState({ onPrimary }: EmptyVariantProps) {
  const t = useT();
  return (
    <EmptyState
      icon="search"
      title={t("dashboard.adminShell.emptyStates.inquiries.title")}
      body={t("dashboard.adminShell.emptyStates.inquiries.body")}
      primaryLabel={onPrimary ? t("dashboard.adminShell.emptyStates.inquiries.primary") : undefined}
      onPrimary={onPrimary}
    />
  );
}

export function BookingsEmptyState({ onPrimary }: EmptyVariantProps) {
  const t = useT();
  return (
    <EmptyState
      icon="calendar"
      title={t("dashboard.adminShell.emptyStates.bookings.title")}
      body={t("dashboard.adminShell.emptyStates.bookings.body")}
      primaryLabel={onPrimary ? t("dashboard.adminShell.emptyStates.bookings.primary") : undefined}
      onPrimary={onPrimary}
    />
  );
}

export function TalentRosterEmptyState({ onPrimary }: EmptyVariantProps) {
  const t = useT();
  return (
    <EmptyState
      icon="team"
      title={t("dashboard.adminShell.emptyStates.roster.title")}
      body={t("dashboard.adminShell.emptyStates.roster.body")}
      primaryLabel={onPrimary ? t("dashboard.adminShell.emptyStates.roster.primary") : undefined}
      onPrimary={onPrimary}
    />
  );
}

export function ClientsEmptyState({ onPrimary }: EmptyVariantProps) {
  const t = useT();
  return (
    <EmptyState
      icon="user"
      title={t("dashboard.adminShell.emptyStates.clients.title")}
      body={t("dashboard.adminShell.emptyStates.clients.body")}
      primaryLabel={onPrimary ? t("dashboard.adminShell.emptyStates.clients.primary") : undefined}
      onPrimary={onPrimary}
    />
  );
}

export function ShortlistsEmptyState({ onPrimary }: EmptyVariantProps) {
  const t = useT();
  return (
    <EmptyState
      icon="sparkle"
      title={t("dashboard.adminShell.emptyStates.shortlists.title")}
      body={t("dashboard.adminShell.emptyStates.shortlists.body")}
      primaryLabel={onPrimary ? t("dashboard.adminShell.emptyStates.shortlists.primary") : undefined}
      onPrimary={onPrimary}
    />
  );
}

export function CalendarEmptyState({ onPrimary }: EmptyVariantProps) {
  const t = useT();
  return (
    <EmptyState
      icon="calendar"
      title={t("dashboard.adminShell.emptyStates.calendar.title")}
      body={t("dashboard.adminShell.emptyStates.calendar.body")}
      primaryLabel={onPrimary ? t("dashboard.adminShell.emptyStates.calendar.primary") : undefined}
      onPrimary={onPrimary}
    />
  );
}

export function MessagesEmptyState({ onPrimary }: EmptyVariantProps) {
  const t = useT();
  return (
    <EmptyState
      icon="mail"
      title={t("dashboard.adminShell.emptyStates.messages.title")}
      body={t("dashboard.adminShell.emptyStates.messages.body")}
      primaryLabel={onPrimary ? t("dashboard.adminShell.emptyStates.messages.primary") : undefined}
      onPrimary={onPrimary}
    />
  );
}

export function FilesEmptyState({ onPrimary }: EmptyVariantProps) {
  const t = useT();
  return (
    <EmptyState
      icon="info"
      title={t("dashboard.adminShell.emptyStates.files.title")}
      body={t("dashboard.adminShell.emptyStates.files.body")}
      primaryLabel={onPrimary ? t("dashboard.adminShell.emptyStates.files.primary") : undefined}
      onPrimary={onPrimary}
    />
  );
}

export function SearchEmptyState({ query }: { query?: string }) {
  const t = useT();
  return (
    <EmptyState
      icon="search"
      title={
        query
          ? interpolate(t("dashboard.adminShell.emptyStates.search.titleQuery"), { query })
          : t("dashboard.adminShell.emptyStates.search.title")
      }
      body={t("dashboard.adminShell.emptyStates.search.body")}
    />
  );
}

export function NotificationsEmptyState() {
  const t = useT();
  return (
    <EmptyState
      icon="sparkle"
      title={t("dashboard.adminShell.emptyStates.notifications.title")}
      body={t("dashboard.adminShell.emptyStates.notifications.body")}
    />
  );
}

export function AgenciesEmptyState({ onPrimary }: EmptyVariantProps) {
  const t = useT();
  return (
    <EmptyState
      icon="team"
      title={t("dashboard.adminShell.emptyStates.agencies.title")}
      body={t("dashboard.adminShell.emptyStates.agencies.body")}
      primaryLabel={onPrimary ? t("dashboard.adminShell.emptyStates.agencies.primary") : undefined}
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
