"use client";
/**
 * ClientThreadAdapter — client POV rendered through the ReservationThread
 * primitive.
 *
 * Phase A PR 4 of the 2026 execution plan. Replaces the 307-line
 * `_ParticipantThreadShell` page with a full reservation-style view:
 *   - Header with stage strip
 *   - Quick-strip pills (Lineup, Offer, Event, Files)
 *   - Sheets carrying real content for each pill
 *   - Action row above the composer with Approve / Decline / Counter when
 *     an offer is awaiting the client's decision
 *
 * Server actions for offer response live in
 * `client/inquiries/[id]/actions.ts`. The message stream + composer
 * reuse the existing `ParticipantThreadShell` since that's already
 * proven against `inquiry_messages` realtime.
 */

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  ReservationThread,
  type ActionPill,
  type PillDescriptor,
  type ReservationStage,
  type SheetDescriptor,
} from "@/components/reservation-thread";
import { OverflowMenu } from "@/components/chat-interactions";
import { PALETTES } from "@/components/reservation-thread/tokens";
import { PayNowSheet } from "@/components/chat-cards/PayNowSheet";
import { PitchOriginCard } from "@/components/pitch-origin/PitchOriginCard";
import { DetailsTabContainer } from "@/components/details-tab/DetailsTabContainer";
import ParticipantThreadShell, {
  type ParticipantThreadMessage,
  type ParticipantThreadSendResult,
} from "@/app/(workspace)/[tenantSlug]/_ParticipantThreadShell";
import {
  InquiryAttachmentsUploader,
  type ExistingAttachment,
} from "@/components/inquiry-cart/InquiryAttachmentsUploader";
import type {
  ClientAttachmentActionResult,
  ClientAttachmentListResult,
  ClientAttachmentRemoveResult,
} from "@/lib/server-actions/client-inquiry-attachments";

/* ─── Server-loaded data shapes — parent page hydrates these ──────── */

export interface ClientThreadInquiry {
  id: string;
  status: string;
  /** Display name for the project — falls back to agency name when null. */
  title: string;
  /** Optimistic-locking version for offer-response actions. */
  version: number;
  /** ISO date or null. */
  eventDate: string | null;
  /** Free-form location string. */
  eventLocation: string | null;
  /** Optional company name (the client's own brand). */
  company: string | null;
  /** Number of talent requested. */
  quantity: number | null;
  /** ISO timestamp. */
  createdAt: string;
  /** Slice M wiring (item #12): pitch id when this inquiry was
   *  originated from a Pitch (per project_pitch_feature.md). When
   *  set, PitchOriginCard renders at the top of the client Chat. */
  pitchId?: string | null;
  /** Optional pitch title for the originating card. */
  pitchTitle?: string | null;
}

export interface ClientThreadLineupEntry {
  /** Public name only — no contact info. */
  displayName: string;
  /** e.g. "model", "mc", "dancer". */
  publicRole: string | null;
  /** Local state for visual cue. We DO show whether the talent
   *  is confirmed, but we never show internal status nuance like
   *  invited / hold. The client cares about: did they say yes? */
  isConfirmed: boolean;
}

export interface ClientThreadOfferLine {
  label: string;
  units: number;
  unitPrice: number;
  totalPrice: number;
  /** Display name of the talent this line is for (or null for
   *  agency-fee-only lines). */
  talentName: string | null;
}

export interface ClientThreadOffer {
  id: string;
  status: "draft" | "sent" | "accepted" | "rejected" | "cancelled" | "expired" | "superseded";
  totalClientPrice: number;
  currencyCode: string;
  validUntil: string | null;
  sentAt: string | null;
  notes: string | null;
  lineItems: ClientThreadOfferLine[];
}

export interface ClientThreadFile {
  id: string;
  fileName: string;
  /** Bytes. */
  fileSize: number;
  uploadedAt: string;
  /** Step 14 — optional file role tag (mood_board | contract | reference | other). */
  attachmentKind?: string | null;
  /** Step 14 — whether the current user uploaded this file (controls Remove visibility). */
  isMine?: boolean;
}

export interface ClientThreadAdapterProps {
  tenantSlug: string;
  tenantName: string;
  inquiry: ClientThreadInquiry;
  lineup: ClientThreadLineupEntry[];
  /** Active offer (status in sent/accepted) if any. */
  activeOffer: ClientThreadOffer | null;
  files: ClientThreadFile[];
  /** Hydrated initial messages — same shape ParticipantThreadShell expects. */
  initialMessages: ParticipantThreadMessage[];
  /** Server actions — bound by the page to (tenantSlug, inquiryId). */
  sendMessage: (body: string) => Promise<ParticipantThreadSendResult>;
  markRead: () => Promise<void>;
  /** Approve / decline / counter actions, pre-bound to inquiry id. */
  approveOffer: (offerId: string, expectedVersion: number) => Promise<{ ok: true } | { ok: false; error: string }>;
  declineOffer: (offerId: string, expectedVersion: number, reason: string | null) => Promise<{ ok: true } | { ok: false; error: string }>;
  counterOffer: (body: string) => Promise<{ ok: true } | { ok: false; error: string }>;
  /**
   * Step 14 attachment actions — optional for backwards compat. When all
   * three are provided, the Files sheet renders the
   * `<InquiryAttachmentsUploader>` so the client can attach briefs,
   * mood boards, contracts, references.
   */
  uploadAttachment?: (
    formData: FormData,
  ) => Promise<ClientAttachmentActionResult>;
  removeAttachment?: (
    attachmentId: string,
  ) => Promise<ClientAttachmentRemoveResult>;
  listAttachments?: (
    inquiryId: string,
  ) => Promise<ClientAttachmentListResult>;
}

/* ─── Status → stage mapping ───────────────────────────────────────── */

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
  if (status === "rejected") return "This inquiry was declined.";
  if (status === "expired")  return "This inquiry expired without a decision.";
  if (status === "cancelled") return "This inquiry was cancelled.";
  return undefined;
}

/* ─── Currency formatting — light, no Intl gymnastics ─────────────── */

function fmtMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${currency} ${amount}`;
  }
}

function fmtDateShort(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

/* ─── Adapter ─────────────────────────────────────────────────────── */

export function ClientThreadAdapter(props: ClientThreadAdapterProps) {
  const {
    tenantName,
    inquiry,
    lineup,
    activeOffer,
    files,
    initialMessages,
    sendMessage,
    markRead,
    approveOffer,
    declineOffer,
    counterOffer,
    uploadAttachment,
    removeAttachment,
    listAttachments,
  } = props;

  // Step 14 — wire `<InquiryAttachmentsUploader>` into the Files sheet
  // when the parent supplies the action trio. Adapter is rendered
  // server-prop-bound so the inquiry id is stable here.
  const uploaderInitial = useMemo<ExistingAttachment[]>(
    () =>
      files.map((f) => ({
        id: f.id,
        filename: f.fileName,
        byteSize: f.fileSize,
        attachmentKind: f.attachmentKind ?? null,
        isMine: Boolean(f.isMine),
      })),
    [files],
  );

  const stage = mapStage(inquiry.status);
  const closedReason = statusToClosedReason(inquiry.status);
  const palette = PALETTES.client;
  const router = useRouter();

  // B10 — realtime on inquiry status + lineup + offer changes.
  // The page is RSC-rendered (server-loaded data), so client-side
  // mutations elsewhere (agency sends an offer, talent accepts, status
  // moves) won't show up until the client navigates. Subscribe to the
  // three tables the page reads and trigger a router.refresh() on any
  // event so the server re-renders with fresh data. Debounced so a
  // burst of changes (e.g. agency adds 3 talents in 2s) only triggers
  // one refresh.
  useEffect(() => {
    if (!inquiry.id) return;
    const supabase = createClient();
    if (!supabase) return;

    let scheduled = false;
    const triggerRefresh = () => {
      if (scheduled) return;
      scheduled = true;
      // 400ms debounce — gives the engine room to commit multi-step
      // mutations atomically before we re-fetch.
      setTimeout(() => {
        scheduled = false;
        router.refresh();
      }, 400);
    };

    const channel = supabase
      .channel(`client-thread-${inquiry.id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "inquiries", filter: `id=eq.${inquiry.id}` },
        triggerRefresh,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "inquiry_participants", filter: `inquiry_id=eq.${inquiry.id}` },
        triggerRefresh,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "inquiry_offers", filter: `inquiry_id=eq.${inquiry.id}` },
        triggerRefresh,
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [inquiry.id, router]);

  // Pills — order: Lineup, Offer, Event, Files. Mobile keeps this order
  // but the strip is horizontally scrollable.
  // Slice D (Messages consolidation v2): the client adapter is already
  // on the universal shell model — pills match plan §3 vocabulary
  // (Lineup · Offer · Event · Files) and the conversation pane is the
  // dominant surface (plan §0 principle 1). No tab-dispatch restructure
  // needed here. Admin + talent (Slices B + C) migrated TOWARD this
  // pattern, not the other way around. Future polish lives in Slice F+G
  // (coord-request flow surfaces in client's approval surface).
  const pills: PillDescriptor[] = useMemo(() => {
    const lineupAccepted = lineup.filter((l) => l.isConfirmed).length;
    const lineupTotal    = lineup.length;
    const lineupStatus = lineupTotal === 0
      ? "No talent yet"
      : `${lineupAccepted}/${lineupTotal} confirmed`;

    const offerStatus = ((): { status: string; tone: PillDescriptor["tone"] } => {
      if (!activeOffer) return { status: "Not sent yet", tone: "neutral" };
      const total = fmtMoney(activeOffer.totalClientPrice, activeOffer.currencyCode);
      if (activeOffer.status === "sent")     return { status: `${total} · awaiting you`, tone: "warn" };
      if (activeOffer.status === "accepted") return { status: `${total} · approved`,     tone: "ok" };
      return { status: total, tone: "neutral" };
    })();

    const eventStatus = ((): string => {
      const parts: string[] = [];
      const d = fmtDateShort(inquiry.eventDate);
      if (d) parts.push(d);
      const city = (inquiry.eventLocation ?? "").split(",")[0]?.trim();
      if (city) parts.push(city);
      return parts.length ? parts.join(" · ") : "TBC";
    })();

    return [
      {
        kind: "lineup",
        label: "Lineup",
        status: lineupStatus,
        tone: lineupAccepted === lineupTotal && lineupTotal > 0 ? "ok" : "neutral",
      },
      {
        kind: "offer",
        label: "Offer",
        status: offerStatus.status,
        tone: offerStatus.tone,
      },
      {
        kind: "event",
        label: "Details",
        status: eventStatus,
        tone: "neutral",
      },
      {
        kind: "files",
        label: "Files",
        status: files.length === 0 ? "" : String(files.length),
        tone: "neutral",
        enabled: files.length > 0,
      },
    ];
  }, [lineup, activeOffer, inquiry.eventDate, inquiry.eventLocation, files.length]);

  // Sheets — content per pill.
  const sheets: Partial<Record<PillDescriptor["kind"], SheetDescriptor>> = useMemo(() => ({
    lineup: {
      kind: "lineup",
      title: "Who's on this project",
      content: lineup.length === 0 ? (
        <EmptyHint text="The agency is putting together your talent shortlist. You'll see them here once they're added." />
      ) : (
        <div className="flex flex-col gap-2">
          {lineup.map((l, i) => (
            <div
              key={`${l.displayName}-${i}`}
              style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "10px 12px",
                borderRadius: 10,
                border: `1px solid ${palette.borderSoft}`,
                background: palette.surfaceRaised,
              }}
            >
              <Avatar name={l.displayName} pov="client" />
              <div className="flex-1 min-w-0">
                <div style={{ fontSize: 13.5, fontWeight: 600, color: palette.ink }}>
                  {l.displayName}
                </div>
                {l.publicRole && (
                  <div style={{ fontSize: 11.5, color: palette.inkMuted, marginTop: 1, textTransform: "capitalize" }}>
                    {l.publicRole}
                  </div>
                )}
              </div>
              <span
                style={{
                  fontSize: 10.5, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase",
                  padding: "3px 7px", borderRadius: 999,
                  background: l.isConfirmed ? palette.okSoft : palette.borderSoft,
                  color: l.isConfirmed ? palette.ok : palette.inkMuted,
                  flexShrink: 0,
                }}
              >
                {l.isConfirmed ? "Confirmed" : "Pending"}
              </span>
            </div>
          ))}
          <div style={{ fontSize: 11, color: palette.inkDim, marginTop: 4, lineHeight: 1.45 }}>
            Contact details are managed by {tenantName}. Reply in the thread to ask about anyone specific.
          </div>
        </div>
      ),
    },
    offer: {
      kind: "offer",
      title: "Your offer",
      content: !activeOffer ? (
        <EmptyHint text={`${tenantName} hasn't sent an offer yet. They'll send one here when the lineup is ready.`} />
      ) : (
        <OfferSheetContent offer={activeOffer} />
      ),
    },
    event: {
      kind: "event",
      title: "Event details",
      content: (
        // Details v3 (plan §10): canonical client-pov DetailsTab is
        // the sole content surface. The earlier When/Where/Talent
        // requested/Project name 4-card summary was a strict subset
        // of DetailsTab's Schedule + Location + Job Brief sections
        // and is removed to avoid the duplicate stack.
        <DetailsTabContainer inquiryId={inquiry.id} pov="client" />
      ),
    },
    files: {
      kind: "files",
      title: "Shared files",
      content: (
        <div className="flex flex-col gap-3">
          {/* Step 14 — client-side uploader. Renders when the parent
              page passes the action trio; the uploader handles its own
              optimistic list so we don't double-render the `files` prop
              when an upload finishes. */}
          {uploadAttachment && removeAttachment ? (
            <InquiryAttachmentsUploader
              mode="live"
              inquiryId={inquiry.id}
              initialAttachments={uploaderInitial}
              uploadAction={uploadAttachment}
              removeAction={removeAttachment}
              listAction={listAttachments}
              label="Your attachments"
              hint="Briefs, mood boards, contracts, references. Max 100 MB per file."
            />
          ) : files.length === 0 ? (
            <EmptyHint text="No files have been shared yet. Briefs, mood boards, and contracts will appear here." />
          ) : null}

          {/* Legacy read-only listing — when the uploader isn't wired
              we fall back to the original chip stack. */}
          {!uploadAttachment && files.length > 0 ? (
            <div className="flex flex-col gap-2">
              {files.map((f) => (
                <div
                  key={f.id}
                  style={{
                    display: "flex", alignItems: "center", gap: 10,
                    padding: "9px 12px",
                    borderRadius: 10,
                    border: `1px solid ${palette.borderSoft}`,
                    background: palette.surfaceRaised,
                  }}
                >
                  <div style={{
                    width: 32, height: 32, borderRadius: 8,
                    background: palette.accentSoft, color: palette.accent,
                    display: "inline-flex", alignItems: "center", justifyContent: "center",
                    flexShrink: 0,
                  }} aria-hidden>
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                      <path d="M3 1.5h5l3 3v7.5a.5.5 0 0 1-.5.5h-7.5a.5.5 0 0 1-.5-.5v-10a.5.5 0 0 1 .5-.5z M8 1.5V4.5h3" stroke="currentColor" strokeWidth="1.2" fill="none"/>
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div style={{ fontSize: 13, fontWeight: 600, color: palette.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {f.fileName}
                    </div>
                    <div style={{ fontSize: 11, color: palette.inkMuted, marginTop: 1 }}>
                      {fmtFileSize(f.fileSize)} · {fmtDateShort(f.uploadedAt)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ),
    },
  }), [
    lineup,
    activeOffer,
    files,
    inquiry,
    palette,
    tenantName,
    uploadAttachment,
    removeAttachment,
    listAttachments,
    uploaderInitial,
  ]);

  /* Action row — Approve / Decline / Counter when offer is awaiting client.
   * Disappears when the offer is no longer sent (accepted/rejected). */
  const [, startTransition] = useTransition();
  const [counterOpen, setCounterOpen] = useState(false);
  const [counterText, setCounterText] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);

  // Slice J wiring (item #7): PayNowSheet state. When the active offer
  // is "accepted" the action row swaps in a "Pay now" CTA that opens
  // the bottom-sheet → kicks off Stripe Connect Direct Charge via
  // startInquiryCheckout (Phase B PR 3 wiring).
  const [payNowOpen, setPayNowOpen] = useState(false);

  const offerActionRow: ActionPill[] | null = useMemo(() => {
    if (!activeOffer) return null;
    // Accepted offer → "Pay now" surface. Plan v2 §11 stage 7.
    if (activeOffer.status === "accepted") {
      return [
        {
          id: "pay-now",
          label: "Pay now",
          emphasis: "primary",
          preamble: `Offer accepted. Complete payment to confirm the booking.`,
          onClick: () => setPayNowOpen(true),
        },
      ];
    }
    if (activeOffer.status !== "sent") return null;
    return [
      {
        id: "approve",
        label: "Approve offer",
        emphasis: "primary",
        preamble: `${tenantName} sent you an offer. Review the details and respond.`,
        onClick: async () => {
          await new Promise<void>((resolve) => {
            startTransition(async () => {
              const r = await approveOffer(activeOffer.id, inquiry.version);
              if (!r.ok) setActionError(r.error ?? "Action failed.");
              resolve();
            });
          });
        },
      },
      {
        id: "counter",
        label: "Counter",
        emphasis: "secondary",
        onClick: () => setCounterOpen(true),
      },
      {
        id: "decline",
        label: "Decline",
        emphasis: "danger",
        onClick: async () => {
          if (!confirm("Decline this offer? You can leave a note in the next step.")) return;
          const reason = prompt("Why are you declining? (optional)") ?? null;
          await new Promise<void>((resolve) => {
            startTransition(async () => {
              const r = await declineOffer(activeOffer.id, inquiry.version, reason);
              if (!r.ok) setActionError(r.error ?? "Action failed.");
              resolve();
            });
          });
        },
      },
    ];
  }, [activeOffer, inquiry.version, tenantName, approveOffer, declineOffer]);

  /* Stream + composer — reuse ParticipantThreadShell. */
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
    <>
      {actionError ? (
        <div
          role="alert"
          style={{
            margin: "8px 0",
            padding: "8px 12px",
            borderRadius: 8,
            background: "rgba(163,58,58,0.08)",
            color: "#A33A3A",
            fontSize: 12.5,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 8,
          }}
        >
          <span>{actionError}</span>
          <button
            type="button"
            onClick={() => setActionError(null)}
            style={{
              background: "transparent",
              border: "none",
              color: "#A33A3A",
              cursor: "pointer",
              fontSize: 12,
            }}
          >
            Dismiss
          </button>
        </div>
      ) : null}
      {/* Item #12 wiring: pitch-origin card on the client surface
          when this inquiry was generated from a Pitch. Sits above the
          ReservationThread so the originating context is the first
          thing the client sees. */}
      {inquiry.pitchId && (
        <div style={{ margin: "8px 0" }}>
          <PitchOriginCard
            tenantSlug={props.tenantSlug}
            pitchId={inquiry.pitchId}
            pitchTitle={inquiry.pitchTitle ?? "Pitch"}
            compact
          />
        </div>
      )}
      <ReservationThread
        pov="client"
        header={{
          title: inquiry.title,
          subtitle: subtitleFor(inquiry, tenantName),
          stage,
          closedReason,
          // No move-to menu for client. Stage is read-only.
          headerActions: <OverflowMenu size="sm" />,
        }}
        pills={pills}
        sheets={sheets}
        stream={stream}
        composer={<div />} // composer lives inside ParticipantThreadShell already
        actionRow={offerActionRow}
      />
      {counterOpen && activeOffer && (
        <CounterDialog
          onCancel={() => { setCounterOpen(false); setCounterText(""); }}
          onSubmit={async (body) => {
            if (!body.trim()) return;
            const r = await counterOffer(body.trim());
            if (!r.ok) { setActionError(r.error ?? "Counter failed."); return; }
            setCounterOpen(false); setCounterText("");
          }}
          value={counterText}
          onChange={setCounterText}
        />
      )}
      {/* Slice J wiring (item #7): PayNowSheet for the accepted-offer
          payment step. Opens from the action-row "Pay now" CTA. */}
      {payNowOpen && activeOffer && (
        <PayNowSheet
          inquiryId={inquiry.id}
          amountLabel={fmtMoney(activeOffer.totalClientPrice, activeOffer.currencyCode)}
          onClose={() => setPayNowOpen(false)}
        />
      )}
    </>
  );
}

/* ─── small presentational bits ───────────────────────────────────── */

function EmptyHint({ text }: { text: string }) {
  return (
    <div style={{
      padding: "18px 14px",
      borderRadius: 10,
      background: PALETTES.client.surface,
      color: PALETTES.client.inkMuted,
      fontSize: 12.5,
      lineHeight: 1.5,
      textAlign: "center",
    }}>
      {text}
    </div>
  );
}

function Avatar({ name, pov }: { name: string; pov: "client" }) {
  const palette = PALETTES[pov];
  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? "")
    .join("");
  return (
    <span
      aria-hidden
      style={{
        width: 30, height: 30, borderRadius: 999,
        background: palette.accentSoft,
        color: palette.accentDeep,
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        fontSize: 11.5, fontWeight: 700, letterSpacing: 0.3,
        flexShrink: 0,
      }}
    >
      {initials}
    </span>
  );
}

function DetailCard({ label, value }: { label: string; value: string }) {
  const palette = PALETTES.client;
  return (
    <div style={{
      padding: "10px 12px",
      borderRadius: 10,
      border: `1px solid ${palette.borderSoft}`,
      background: palette.surfaceRaised,
    }}>
      <div style={{
        fontSize: 10, fontWeight: 700, letterSpacing: 0.6, textTransform: "uppercase",
        color: palette.inkMuted,
      }}>{label}</div>
      <div style={{ fontSize: 13.5, fontWeight: 600, color: palette.ink, marginTop: 4 }}>
        {value}
      </div>
    </div>
  );
}

function OfferSheetContent({ offer }: { offer: ClientThreadOffer }) {
  const palette = PALETTES.client;
  const validUntilText = offer.validUntil
    ? `Valid until ${new Date(offer.validUntil).toLocaleDateString(undefined, { day: "numeric", month: "short" })}`
    : null;
  return (
    <div className="flex flex-col gap-3.5">
      <div style={{
        padding: "14px 14px 12px",
        borderRadius: 12,
        background: palette.accentSoft,
        color: palette.accentDeep,
        border: `1px solid ${palette.border}`,
      }}>
        <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 0.6, textTransform: "uppercase" }}>
          Total
        </div>
        <div style={{ fontSize: 24, fontWeight: 700, marginTop: 2, fontVariantNumeric: "tabular-nums" }}>
          {fmtMoney(offer.totalClientPrice, offer.currencyCode)}
        </div>
        {validUntilText && (
          <div style={{ marginTop: 6, fontSize: 11.5, opacity: 0.9 }}>{validUntilText}</div>
        )}
      </div>
      {offer.lineItems.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <div style={{
            fontSize: 10.5, fontWeight: 700, letterSpacing: 0.6, textTransform: "uppercase",
            color: palette.inkMuted, marginBottom: 4,
          }}>What&apos;s included</div>
          {offer.lineItems.map((li, i) => (
            <div key={i} style={{
              display: "flex", alignItems: "center", gap: 8,
              padding: "9px 10px",
              borderRadius: 8,
              border: `1px solid ${palette.borderSoft}`,
              background: palette.surfaceRaised,
            }}>
              <div className="flex-1 min-w-0">
                <div style={{ fontSize: 13, fontWeight: 600, color: palette.ink }}>
                  {li.label || li.talentName || "Line item"}
                </div>
                {li.units > 1 && (
                  <div style={{ fontSize: 11, color: palette.inkMuted, marginTop: 1 }}>
                    {li.units} × {fmtMoney(li.unitPrice, offer.currencyCode)}
                  </div>
                )}
              </div>
              <div style={{ fontSize: 13, fontWeight: 600, color: palette.ink, fontVariantNumeric: "tabular-nums" }}>
                {fmtMoney(li.totalPrice, offer.currencyCode)}
              </div>
            </div>
          ))}
        </div>
      )}
      {offer.notes && (
        <div style={{
          padding: "10px 12px",
          borderRadius: 10,
          background: palette.surface,
          fontSize: 12.5, color: palette.inkMuted, lineHeight: 1.5,
          whiteSpace: "pre-wrap",
        }}>
          {offer.notes}
        </div>
      )}
      {offer.status === "accepted" && (
        <div style={{
          padding: "10px 12px",
          borderRadius: 10,
          background: palette.okSoft,
          color: palette.ok,
          fontSize: 12.5, fontWeight: 600,
        }}>
          You approved this offer. The agency is preparing the booking.
        </div>
      )}
    </div>
  );
}

function CounterDialog({
  value, onChange, onCancel, onSubmit,
}: {
  value: string;
  onChange: (s: string) => void;
  onCancel: () => void;
  onSubmit: (body: string) => Promise<void> | void;
}) {
  const palette = PALETTES.client;
  return (
    <div role="dialog" aria-label="Counter offer" style={{
      position: "fixed", inset: 0, zIndex: 90,
      background: "rgba(11,11,13,0.32)",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: 16,
    }}>
      <div style={{
        background: palette.surfaceRaised,
        borderRadius: 14,
        width: "100%",
        maxWidth: 440,
        boxShadow: "0 16px 48px rgba(0,0,0,0.18)",
        display: "flex", flexDirection: "column",
      }}>
        <div style={{ padding: "14px 16px", borderBottom: `1px solid ${palette.borderSoft}` }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: palette.ink }}>
            Counter the offer
          </h3>
          <div style={{ marginTop: 2, fontSize: 12, color: palette.inkMuted }}>
            What would you change? The agency will see this in the thread.
          </div>
        </div>
        <div style={{ padding: "12px 16px" }}>
          <textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            rows={5}
            placeholder="e.g. Could we discuss the rate? Or move the date one day forward?"
            style={{
              width: "100%",
              padding: 10,
              borderRadius: 10,
              border: `1px solid ${palette.border}`,
              fontFamily: "inherit",
              fontSize: 13,
              resize: "vertical",
              minHeight: 100,
              background: palette.surface,
              color: palette.ink,
            }}
          />
        </div>
        <div style={{
          padding: "10px 16px",
          borderTop: `1px solid ${palette.borderSoft}`,
          display: "flex", gap: 8, justifyContent: "flex-end",
        }}>
          <button
            type="button"
            onClick={onCancel}
            style={{
              padding: "8px 14px",
              border: `1px solid ${palette.border}`,
              background: palette.surfaceRaised,
              color: palette.ink,
              borderRadius: 999,
              fontSize: 12.5, fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void onSubmit(value)}
            disabled={!value.trim()}
            style={{
              padding: "8px 14px",
              border: "none",
              background: value.trim() ? palette.accent : palette.borderSoft,
              color: value.trim() ? "#fff" : palette.inkMuted,
              borderRadius: 999,
              fontSize: 12.5, fontWeight: 600,
              cursor: value.trim() ? "pointer" : "not-allowed",
            }}
          >
            Send counter
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── helpers ─────────────────────────────────────────────────────── */

function fmtDateLong(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

function fmtFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function subtitleFor(inq: ClientThreadInquiry, tenant: string): string {
  const parts: string[] = [tenant];
  const d = fmtDateShort(inq.eventDate);
  if (d) parts.push(d);
  const city = (inq.eventLocation ?? "").split(",")[0]?.trim();
  if (city) parts.push(city);
  return parts.join(" · ");
}
