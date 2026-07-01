"use client";
/**
 * AdminThreadAdapter — admin/staff POV rendered through the
 * ReservationThread primitive. Phase 2.1 slice 2.
 *
 * Sibling to ClientThreadAdapter. Same primitive, admin voice + admin's
 * superset of read surfaces:
 *   - Header with stage strip + status
 *   - QuickStrip pills: Lineup · Offer · Event · Files · Team
 *   - Sheets carry the server-loaded data for each pill
 *   - Stream + composer reuse ParticipantThreadShell (private agency ↔
 *     client thread) — the proven realtime + composer surface
 *
 * What this adapter intentionally does NOT own (still in the mega
 * Messages shell, reachable via the "classic Messages" links in the
 * sheets): offer drafting/sending, lineup add/remove, coordinator
 * reassignment, status machine. Those are deep editor sub-features;
 * slice 2's job is to make the canonical /admin/messages/[id] route a
 * real working conversation surface, not a read-only inspect.
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  ReservationThread,
  type PillDescriptor,
  type ReservationStage,
  type SheetDescriptor,
} from "@/components/reservation-thread";
import { PALETTES } from "@/components/reservation-thread/tokens";
import ParticipantThreadShell, {
  type ParticipantThreadMessage,
  type ParticipantThreadSendResult,
} from "@/app/(workspace)/[tenantSlug]/_ParticipantThreadShell";
import { useT } from "@/i18n/use-t";
import { withInterpolation } from "@/i18n/interpolate";
import { inquirySourceLabel } from "@/lib/inquiry/inquiry-source-label";

/* ─── Server-loaded shapes — page hydrates these ─────────────────── */

export interface AdminThreadInquiry {
  id: string;
  status: string;
  title: string;
  /** Client name + city + date one-liner. */
  subtitle: string;
  eventDate: string | null;
  eventLocation: string | null;
  company: string | null;
  quantity: number | null;
  createdAt: string;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  brief: string | null;
  /** Discover/Shortlist source channel (A4). */
  sourceChannel: string | null;
  trustLevel: "basic" | "verified" | "silver" | "gold" | null;
}

export interface AdminThreadLineupEntry {
  displayName: string;
  /** invited | accepted | declined | hold | … (admin sees raw status). */
  status: string;
  profileCode: string | null;
}

export interface AdminThreadOffer {
  id: string;
  status: string;
  totalCents: number;
  currency: string;
  validUntil: string | null;
  sentAt: string | null;
}

export interface AdminThreadFile {
  id: string;
  fileName: string;
  fileSize: number;
  uploadedAt: string;
}

export interface AdminThreadCoordinator {
  displayName: string;
}

export interface AdminThreadAdapterProps {
  tenantSlug: string;
  inquiry: AdminThreadInquiry;
  lineup: AdminThreadLineupEntry[];
  activeOffer: AdminThreadOffer | null;
  files: AdminThreadFile[];
  coordinators: AdminThreadCoordinator[];
  initialMessages: ParticipantThreadMessage[];
  sendMessage: (body: string) => Promise<ParticipantThreadSendResult>;
  markRead: () => Promise<void>;
}

/* ─── helpers ────────────────────────────────────────────────────── */

function mapStage(status: string): ReservationStage {
  switch (status) {
    case "submitted":      return "inquiry";
    case "coordination":   return "review";
    case "offer_pending":  return "offer";
    case "approved":       return "approved";
    case "booked":
    case "converted":      return "booked";
    case "wrapped":        return "wrapped";
    default:               return "inquiry";
  }
}

function statusToClosedReason(status: string): string | undefined {
  if (status === "rejected")  return "This inquiry was declined.";
  if (status === "expired")   return "This inquiry expired without a decision.";
  if (status === "cancelled") return "This inquiry was cancelled.";
  if (status === "closed_lost") return "This inquiry was closed (lost).";
  return undefined;
}

function fmtMoney(cents: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(cents / 100);
  } catch {
    return `${currency} ${(cents / 100).toFixed(0)}`;
  }
}

function fmtDateShort(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

/* ─── Adapter ────────────────────────────────────────────────────── */

export function AdminThreadAdapter(props: AdminThreadAdapterProps) {
  const {
    tenantSlug,
    inquiry,
    lineup,
    activeOffer,
    files,
    coordinators,
    initialMessages,
    sendMessage,
    markRead,
  } = props;

  const palette = PALETTES.admin;
  const router = useRouter();
  const stage = mapStage(inquiry.status);
  const closedReason = statusToClosedReason(inquiry.status);
  const classicHref = `/${tenantSlug}/admin/messages?inquiry=${inquiry.id}`;

  // Realtime — RSC page re-render on inquiry / participant / offer change.
  useEffect(() => {
    if (!inquiry.id) return;
    const supabase = createClient();
    if (!supabase) return;
    let scheduled = false;
    const trigger = () => {
      if (scheduled) return;
      scheduled = true;
      setTimeout(() => { scheduled = false; router.refresh(); }, 400);
    };
    const channel = supabase
      .channel(`admin-thread-${inquiry.id}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "inquiries", filter: `id=eq.${inquiry.id}` }, trigger)
      .on("postgres_changes", { event: "*", schema: "public", table: "inquiry_participants", filter: `inquiry_id=eq.${inquiry.id}` }, trigger)
      .on("postgres_changes", { event: "*", schema: "public", table: "inquiry_offers", filter: `inquiry_id=eq.${inquiry.id}` }, trigger)
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [inquiry.id, router]);

  // Friendly provenance label, covering every source channel (not just
  // Discover). Surfaces as a quiet accent chip in the header AND a "Source"
  // row in the Event sheet, so the admin always sees where the inquiry came
  // from. Resolved from the real `source_channel` captured on the inquiry,
  // replacing the prior Discover-only "Source" row.
  const tx = withInterpolation(useT());
  const resolvedSource = inquirySourceLabel(
    { sourceChannel: inquiry.sourceChannel },
    "agency",
  );
  const sourceLabel = resolvedSource ? tx(resolvedSource.key, resolvedSource.args) : null;

  const pills: PillDescriptor[] = useMemo(() => {
    const accepted = lineup.filter((l) => l.status === "accepted").length;
    const total = lineup.length;
    const offerStatus = ((): { status: string; tone: PillDescriptor["tone"] } => {
      if (!activeOffer) return { status: "Not sent", tone: "neutral" };
      const t = fmtMoney(activeOffer.totalCents, activeOffer.currency);
      if (activeOffer.status === "sent")     return { status: `${t} · sent`, tone: "warn" };
      if (activeOffer.status === "accepted") return { status: `${t} · accepted`, tone: "ok" };
      return { status: t, tone: "neutral" };
    })();
    const eventBits: string[] = [];
    const d = fmtDateShort(inquiry.eventDate);
    if (d) eventBits.push(d);
    const city = (inquiry.eventLocation ?? "").split(",")[0]?.trim();
    if (city) eventBits.push(city);

    return [
      {
        kind: "lineup",
        label: "Lineup",
        status: total === 0 ? "No talent" : `${accepted}/${total} accepted`,
        tone: total > 0 && accepted === total ? "ok" : "neutral",
      },
      {
        kind: "offer",
        label: "Offer",
        status: offerStatus.status,
        tone: offerStatus.tone,
      },
      {
        kind: "event",
        label: "Event",
        status: eventBits.length ? eventBits.join(" · ") : "TBC",
        tone: "neutral",
      },
      {
        kind: "files",
        label: "Files",
        status: files.length === 0 ? "" : String(files.length),
        tone: "neutral",
        enabled: files.length > 0,
      },
      {
        kind: "team",
        label: "Team",
        status: coordinators.length === 0 ? "Unassigned" : coordinators.map((c) => c.displayName).join(", "),
        tone: coordinators.length === 0 ? "warn" : "neutral",
      },
    ];
  }, [lineup, activeOffer, inquiry.eventDate, inquiry.eventLocation, files.length, coordinators]);

  const sheets: Partial<Record<PillDescriptor["kind"], SheetDescriptor>> = useMemo(() => ({
    lineup: {
      kind: "lineup",
      title: "Lineup",
      content:
        lineup.length === 0 ? (
          <Hint text="No talent on this inquiry yet. Add talent from classic Messages." />
        ) : (
          <div className="flex flex-col gap-2">
            {lineup.map((l, i) => (
              <div key={`${l.profileCode ?? i}`} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13 }}>
                <span style={{
                  width: 22, height: 22, borderRadius: 6, flexShrink: 0,
                  background: palette.accentSoft, color: palette.accent,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 11, fontWeight: 700,
                }}>{i + 1}</span>
                <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {l.profileCode ? (
                    <Link href={`/t/${l.profileCode}`} target="_blank" rel="noopener" style={{ color: palette.ink, textDecoration: "none" }}>
                      {l.displayName}
                    </Link>
                  ) : l.displayName}
                </span>
                <span style={{
                  flexShrink: 0, fontSize: 10.5, fontWeight: 600, letterSpacing: 0.3,
                  textTransform: "uppercase", color: palette.inkMuted,
                  padding: "1px 6px", borderRadius: 4, background: palette.surface,
                }}>{l.status}</span>
              </div>
            ))}
          </div>
        ),
      footer: (
        <Link href={classicHref} style={footerLink(palette)}>Add / remove talent in classic Messages →</Link>
      ),
    },
    offer: {
      kind: "offer",
      title: "Offer",
      content: activeOffer ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13 }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: palette.ink, letterSpacing: -0.3 }}>
            {fmtMoney(activeOffer.totalCents, activeOffer.currency)}
          </div>
          <div style={{ color: palette.inkMuted }}>Status: <strong style={{ color: palette.ink }}>{activeOffer.status}</strong></div>
          {activeOffer.sentAt && <div style={{ color: palette.inkMuted }}>Sent {fmtDate(activeOffer.sentAt)}</div>}
          {activeOffer.validUntil && <div style={{ color: palette.inkMuted }}>Valid until {fmtDate(activeOffer.validUntil)}</div>}
        </div>
      ) : (
        <Hint text="No offer drafted yet." />
      ),
      footer: (
        <Link href={classicHref} style={footerLink(palette)}>
          {activeOffer ? "Manage offer in classic Messages →" : "Draft an offer in classic Messages →"}
        </Link>
      ),
    },
    event: {
      kind: "event",
      title: "Event & client",
      content: (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, fontSize: 13 }}>
          <Row label="Date" value={fmtDate(inquiry.eventDate)} palette={palette} />
          <Row label="Location" value={inquiry.eventLocation ?? "—"} palette={palette} />
          <Row label="Quantity" value={inquiry.quantity != null ? String(inquiry.quantity) : "—"} palette={palette} />
          <Row label="Contact" value={inquiry.contactName ?? "—"} palette={palette} />
          {inquiry.contactEmail && <Row label="Email" value={inquiry.contactEmail} palette={palette} />}
          {inquiry.contactPhone && <Row label="Phone" value={inquiry.contactPhone} palette={palette} />}
          {inquiry.company && <Row label="Company" value={inquiry.company} palette={palette} />}
          {inquiry.trustLevel && <Row label="Trust" value={inquiry.trustLevel} palette={palette} />}
          {sourceLabel && (
            <Row label="Source" value={sourceLabel} palette={palette} />
          )}
          {inquiry.brief && (
            <div className="mt-1">
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase", color: palette.inkDim, marginBottom: 4 }}>Brief</div>
              <div style={{ fontSize: 13, color: palette.ink, lineHeight: 1.55, whiteSpace: "pre-wrap" }}>{inquiry.brief}</div>
            </div>
          )}
        </div>
      ),
    },
    files: {
      kind: "files",
      title: "Files",
      content:
        files.length === 0 ? (
          <Hint text="No files shared on this inquiry yet." />
        ) : (
          <div className="flex flex-col gap-2">
            {files.map((f) => (
              <div key={f.id} style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                fontSize: 12.5, padding: "8px 10px", borderRadius: 8,
                background: palette.surface,
              }}>
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{f.fileName}</span>
                <span style={{ color: palette.inkMuted, flexShrink: 0, marginLeft: 8 }}>
                  {(f.fileSize / 1024).toFixed(0)} KB
                </span>
              </div>
            ))}
          </div>
        ),
      footer: (
        <Link href={classicHref} style={footerLink(palette)}>Upload / manage files in classic Messages →</Link>
      ),
    },
    team: {
      kind: "team",
      title: "Team",
      content:
        coordinators.length === 0 ? (
          <Hint text="No coordinator assigned. Assign one from classic Messages." />
        ) : (
          <div className="flex flex-col gap-2">
            {coordinators.map((c, i) => (
              <div key={i} style={{ fontSize: 13, color: palette.ink }}>
                {c.displayName}
                <span style={{ marginLeft: 8, fontSize: 11, color: palette.inkMuted }}>Coordinator</span>
              </div>
            ))}
          </div>
        ),
      footer: (
        <Link href={classicHref} style={footerLink(palette)}>Reassign coordinator in classic Messages →</Link>
      ),
    },
  }), [lineup, activeOffer, files, coordinators, inquiry, sourceLabel, palette, classicHref]);

  const stream = (
    <ParticipantThreadShell
      inquiryId={inquiry.id}
      threadType="private"
      initialMessages={initialMessages}
      accent={palette.accent}
      accentSoft={palette.accentSoft}
      sendMessage={sendMessage}
      markRead={markRead}
    />
  );

  return (
    <ReservationThread
      pov="admin"
      header={{
        title: inquiry.title,
        subtitle: inquiry.subtitle,
        stage,
        sourceLabel: sourceLabel ?? undefined,
        closedReason,
        moveToMenu: [
          {
            id: "classic",
            label: "Open in classic Messages",
            onClick: () => { window.location.href = classicHref; },
          },
        ],
      }}
      pills={pills}
      sheets={sheets}
      stream={stream}
      composer={<div />}
    />
  );
}

/* ─── small presentational bits ──────────────────────────────────── */

function Hint({ text }: { text: string }) {
  return (
    <div style={{
      padding: "18px 14px", borderRadius: 10,
      background: PALETTES.admin.surface, color: PALETTES.admin.inkMuted,
      fontSize: 12.5, lineHeight: 1.5, textAlign: "center",
    }}>
      {text}
    </div>
  );
}

function Row({
  label, value, palette,
}: {
  label: string;
  value: string;
  palette: typeof PALETTES.admin;
}) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
      <span style={{ color: palette.inkMuted, flexShrink: 0 }}>{label}</span>
      <span style={{ color: palette.ink, textAlign: "right", overflow: "hidden", textOverflow: "ellipsis" }}>{value}</span>
    </div>
  );
}

function footerLink(palette: typeof PALETTES.admin): React.CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    fontSize: 12.5,
    fontWeight: 600,
    color: palette.accent,
    textDecoration: "none",
  };
}
