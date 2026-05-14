"use client";

/**
 * OfferTab — replaces the Phase C stub. Renders the live offer card +
 * Approve / Counter / Decline CTAs that fire the canonical engine paths
 * (clientAcceptOffer / clientRejectOffer).
 *
 * Spec: web/docs/inquiry-engine-spec-2026-05-14.md §6.3 + §19
 * Plan: web/docs/client-execution-plan-2026-05-14.md §23 Phase E
 *
 * Permission boundary:
 *   - Renders line items by display_name + label + units + total only.
 *     talent_cost / coordinator_fee / commission internals are never
 *     sent to the client (loader excludes them).
 *   - Approve & Decline open confirmation drawers; irreversible action
 *     gets explicit confirmation per spec §6.3.
 */

import { useEffect, useState, useTransition } from "react";
import { useActionState } from "react";
import type { ClientInquiryDetails } from "../../_data-bridge/client-inquiry-details";
import {
  approveOfferAction,
  rejectOfferAction,
  type InquiryOfferActionState,
} from "../_actions/inquiry-offer-actions";

const FONT = '"Inter", system-ui, sans-serif';
const FONT_DISPLAY =
  'var(--font-geist-sans), "Inter", -apple-system, system-ui, sans-serif';

const C = {
  ink: "#0B0B0D",
  inkMuted: "rgba(11,11,13,0.55)",
  inkDim: "rgba(11,11,13,0.35)",
  border: "rgba(24,24,27,0.10)",
  borderSoft: "rgba(24,24,27,0.06)",
  surface: "#FAFAF7",
  card: "#FFFFFF",
  accent: "#1D4ED8",
  accentSoft: "rgba(29,78,216,0.08)",
  success: "#0F5132",
  successSoft: "rgba(15,81,50,0.10)",
  amber: "#92400E",
  amberSoft: "rgba(146,64,14,0.10)",
  crimson: "#991B1B",
  crimsonSoft: "rgba(153,27,27,0.08)",
} as const;

export function OfferTab({
  details,
  tenantSlug,
  onAfterAction,
}: {
  details: ClientInquiryDetails | null;
  tenantSlug: string;
  /** Called after Approve/Decline succeeds (parent typically refreshes details). */
  onAfterAction?: () => void;
}) {
  if (!details) {
    return <div style={{ padding: 24, color: C.inkMuted, fontSize: 13 }}>Loading offer…</div>;
  }
  if (!details.offer?.exists) {
    return (
      <div style={{ padding: "24px 22px", fontFamily: FONT }}>
        <div style={emptyCardStyle}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.inkMuted, textTransform: "uppercase", letterSpacing: 0.6 }}>
            Offer
          </div>
          <div style={{ marginTop: 8, fontSize: 14, color: C.ink, fontWeight: 600 }}>
            No offer yet
          </div>
          <p style={{ marginTop: 6, fontSize: 13, color: C.inkMuted, lineHeight: 1.5 }}>
            Your coordinator is confirming talent. You'll receive an offer here once the lineup is ready.
          </p>
        </div>
      </div>
    );
  }

  const offer = details.offer;
  const expired = isExpired(offer.expires_at);
  const canDecide = offer.status === "sent" && !expired;

  return (
    <div style={{ padding: "16px 22px 32px", fontFamily: FONT }}>
      <Card>
        <OfferHeader offer={offer} expired={expired} />
        <Divider />
        <LineItemsTable offer={offer} />
        <Divider />
        <Totals offer={offer} />
        {offer.notes && (
          <>
            <Divider />
            <Notes notes={offer.notes} />
          </>
        )}
        {(offer.status === "rejected" || offer.rejection_reason) && (
          <>
            <Divider />
            <RejectionSummary offer={offer} />
          </>
        )}
        {canDecide && (
          <>
            <Divider />
            <DecisionRibbon
              details={details}
              tenantSlug={tenantSlug}
              onAfterAction={onAfterAction}
            />
          </>
        )}
        {offer.status === "accepted" && (
          <>
            <Divider />
            <AcceptedBanner />
          </>
        )}
      </Card>

      <Disclosures expired={expired} status={offer.status} />
    </div>
  );
}

// ─── Header ──────────────────────────────────────────────────────────────────

function OfferHeader({
  offer,
  expired,
}: {
  offer: NonNullable<ClientInquiryDetails["offer"]>;
  expired: boolean;
}) {
  const statusInfo = statusBadgeInfo(offer.status, expired);
  return (
    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
      <div>
        <div style={{ fontSize: 11, fontWeight: 700, color: C.inkMuted, textTransform: "uppercase", letterSpacing: 0.6 }}>
          Offer
        </div>
        <h2 style={{ margin: "3px 0 0", fontSize: 22, fontWeight: 600, fontFamily: FONT_DISPLAY, color: C.ink, letterSpacing: -0.2 }}>
          {formatMoney(offer.total_client_price, offer.currency)}
        </h2>
        {offer.sent_at && (
          <div style={{ fontSize: 11.5, color: C.inkMuted, marginTop: 4 }}>
            Sent {formatDateTime(offer.sent_at)}
          </div>
        )}
      </div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
        <span style={statusBadgeStyle(statusInfo.tone)}>{statusInfo.label}</span>
        {offer.expires_at && (
          <span style={{ fontSize: 11, color: expired ? C.crimson : C.inkMuted, fontWeight: expired ? 600 : 400 }}>
            {expired ? "Expired " : "Expires "}
            {formatDateTime(offer.expires_at)}
          </span>
        )}
      </div>
    </div>
  );
}

function LineItemsTable({
  offer,
}: {
  offer: NonNullable<ClientInquiryDetails["offer"]>;
}) {
  if (offer.lines.length === 0) {
    return (
      <div style={{ fontSize: 12.5, color: C.inkMuted, fontStyle: "italic", padding: "10px 0" }}>
        Single-line offer — no itemization.
      </div>
    );
  }
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, color: C.inkMuted, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 8 }}>
        What's included
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, fontFamily: FONT }}>
        <tbody>
          {offer.lines.map((ln) => (
            <tr key={ln.id}>
              <td style={{ padding: "8px 0", color: C.ink, verticalAlign: "top" }}>
                <div style={{ fontWeight: 600 }}>
                  {ln.label || ln.talent_name || "Item"}
                </div>
                {ln.talent_name && ln.label && (
                  <div style={{ fontSize: 11.5, color: C.inkMuted, marginTop: 2 }}>
                    {ln.talent_name}
                  </div>
                )}
                <div style={{ fontSize: 11.5, color: C.inkMuted, marginTop: 2 }}>
                  {ln.units} × {formatMoney(ln.unit_price, offer.currency)} / {ln.pricing_unit}
                </div>
              </td>
              <td
                style={{
                  padding: "8px 0",
                  textAlign: "right",
                  color: C.ink,
                  fontVariantNumeric: "tabular-nums",
                  verticalAlign: "top",
                  whiteSpace: "nowrap",
                }}
              >
                {formatMoney(ln.total_price, offer.currency)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Totals({
  offer,
}: {
  offer: NonNullable<ClientInquiryDetails["offer"]>;
}) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", fontFamily: FONT }}>
      <div style={{ fontSize: 13, color: C.inkMuted }}>Total</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: C.ink, fontVariantNumeric: "tabular-nums" }}>
        {formatMoney(offer.total_client_price, offer.currency)}
      </div>
    </div>
  );
}

function Notes({ notes }: { notes: string }) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, color: C.inkMuted, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 6 }}>
        Coordinator note
      </div>
      <p style={{ margin: 0, fontSize: 13, color: C.ink, lineHeight: 1.55, whiteSpace: "pre-wrap" }}>{notes}</p>
    </div>
  );
}

function RejectionSummary({
  offer,
}: {
  offer: NonNullable<ClientInquiryDetails["offer"]>;
}) {
  return (
    <div
      style={{
        padding: "10px 12px",
        background: C.crimsonSoft,
        borderRadius: 8,
        fontSize: 12.5,
        color: C.crimson,
        lineHeight: 1.5,
      }}
    >
      <strong>Previously declined</strong>
      {offer.rejection_reason && (
        <span style={{ marginLeft: 6 }}>· {humanizeReason(offer.rejection_reason)}</span>
      )}
      {offer.rejection_reason_text && (
        <div style={{ marginTop: 4, color: C.ink, fontWeight: 400 }}>{offer.rejection_reason_text}</div>
      )}
    </div>
  );
}

function AcceptedBanner() {
  return (
    <div
      style={{
        padding: "10px 12px",
        background: C.successSoft,
        borderRadius: 8,
        fontSize: 13,
        color: C.success,
        fontWeight: 600,
      }}
    >
      ✓ Offer accepted. The booking is being prepared.
    </div>
  );
}

// ─── Decision ribbon — opens approve/decline drawers ─────────────────────────

function DecisionRibbon({
  details,
  tenantSlug,
  onAfterAction,
}: {
  details: ClientInquiryDetails;
  tenantSlug: string;
  onAfterAction?: () => void;
}) {
  const [confirming, setConfirming] = useState<"approve" | "decline" | null>(null);
  return (
    <>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={() => setConfirming("approve")}
          style={primaryBtn}
        >
          Approve &amp; lock
        </button>
        <button
          type="button"
          onClick={() => setConfirming("decline")}
          style={ghostBtn}
        >
          Decline
        </button>
        <div style={{ flex: 1 }} />
        <a
          href={`/${tenantSlug}/client/inquiries/${details.id}`}
          style={{
            ...ghostBtn,
            textDecoration: "none",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          Ask a question
        </a>
      </div>

      {confirming === "approve" && (
        <ApproveDrawer
          details={details}
          tenantSlug={tenantSlug}
          onClose={() => setConfirming(null)}
          onAfterAction={onAfterAction}
        />
      )}
      {confirming === "decline" && (
        <DeclineDrawer
          details={details}
          tenantSlug={tenantSlug}
          onClose={() => setConfirming(null)}
          onAfterAction={onAfterAction}
        />
      )}
    </>
  );
}

// ─── Approve drawer ──────────────────────────────────────────────────────────

function ApproveDrawer({
  details,
  tenantSlug,
  onClose,
  onAfterAction,
}: {
  details: ClientInquiryDetails;
  tenantSlug: string;
  onClose: () => void;
  onAfterAction?: () => void;
}) {
  const offer = details.offer!;
  const [state, formAction, pending] = useActionState<InquiryOfferActionState, FormData>(
    approveOfferAction,
    { kind: "idle" },
  );
  const [, startTransition] = useTransition();

  useEffect(() => {
    if (state.kind === "approved") {
      onAfterAction?.();
      onClose();
    }
  }, [state, onClose, onAfterAction]);

  // ESC close
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const submit = () => {
    const fd = new FormData();
    fd.set("tenantSlug", tenantSlug);
    fd.set("inquiryId", details.id);
    fd.set("offerId", offer.id);
    fd.set("expectedVersion", String(offer.inquiry_version));
    startTransition(() => formAction(fd));
  };

  return (
    <DrawerShell title="Approve & lock" subtitle="One last check before you confirm." onClose={onClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <SummaryRow label="Project" value={details.job.title ?? "Inquiry"} />
        <SummaryRow label="Talent" value={`${details.talent.selected.length} on lineup`} />
        <SummaryRow
          label="Schedule"
          value={
            details.schedule.event_date
              ? formatDate(details.schedule.event_date)
              : statusLabel(details.schedule.date_status) ?? "TBD"
          }
        />
        <SummaryRow label="Total" value={formatMoney(offer.total_client_price, offer.currency)} bold />
        <Hint>
          Approving locks the lineup and starts the booking workflow. Payment
          terms are summarized in the offer; you can still ask questions in Chat.
        </Hint>
        {state.kind === "error" && (
          <div style={errorBoxStyle}>{state.message}</div>
        )}
      </div>
      <DrawerFooter>
        <button type="button" style={ghostBtn} onClick={onClose}>
          Cancel
        </button>
        <button
          type="button"
          style={pending ? { ...primaryBtn, opacity: 0.6, cursor: "wait" } : primaryBtn}
          onClick={submit}
          disabled={pending}
        >
          {pending ? "Approving…" : "Approve & lock"}
        </button>
      </DrawerFooter>
    </DrawerShell>
  );
}

// ─── Decline drawer ──────────────────────────────────────────────────────────

const REJECTION_OPTIONS = [
  { value: "too_expensive", label: "Too expensive" },
  { value: "wrong_talent", label: "Wrong talent fit" },
  { value: "timing", label: "Timing changed" },
  { value: "changed_plans", label: "Changed plans" },
  { value: "other", label: "Other" },
];

function DeclineDrawer({
  details,
  tenantSlug,
  onClose,
  onAfterAction,
}: {
  details: ClientInquiryDetails;
  tenantSlug: string;
  onClose: () => void;
  onAfterAction?: () => void;
}) {
  const offer = details.offer!;
  const [reason, setReason] = useState("too_expensive");
  const [note, setNote] = useState("");
  const [state, formAction, pending] = useActionState<InquiryOfferActionState, FormData>(
    rejectOfferAction,
    { kind: "idle" },
  );
  const [, startTransition] = useTransition();

  useEffect(() => {
    if (state.kind === "rejected") {
      onAfterAction?.();
      onClose();
    }
  }, [state, onClose, onAfterAction]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const submit = () => {
    const fd = new FormData();
    fd.set("tenantSlug", tenantSlug);
    fd.set("inquiryId", details.id);
    fd.set("offerId", offer.id);
    fd.set("expectedVersion", String(offer.inquiry_version));
    fd.set("reason", reason);
    fd.set("reasonText", note.trim());
    startTransition(() => formAction(fd));
  };

  return (
    <DrawerShell title="Decline offer" subtitle="Tell the coordinator what's not working." onClose={onClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: 11.5, color: C.inkMuted, fontWeight: 600 }}>Reason</span>
          <select
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            style={inputStyle}
          >
            {REJECTION_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: 11.5, color: C.inkMuted, fontWeight: 600 }}>What would help (optional)</span>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            placeholder="e.g. budget closer to $3k, different talent vibe, later date…"
            style={{ ...inputStyle, resize: "vertical", minHeight: 60, lineHeight: 1.45 }}
          />
        </label>
        <Hint>
          Declining sends the project back to coordination — your coordinator
          will rework the offer with your feedback. You can still discuss in Chat.
        </Hint>
        {state.kind === "error" && (
          <div style={errorBoxStyle}>{state.message}</div>
        )}
      </div>
      <DrawerFooter>
        <button type="button" style={ghostBtn} onClick={onClose}>
          Cancel
        </button>
        <button
          type="button"
          style={pending ? { ...declineBtn, opacity: 0.6, cursor: "wait" } : declineBtn}
          onClick={submit}
          disabled={pending}
        >
          {pending ? "Sending…" : "Decline offer"}
        </button>
      </DrawerFooter>
    </DrawerShell>
  );
}

// ─── Disclosures footer ──────────────────────────────────────────────────────

function Disclosures({ expired, status }: { expired: boolean; status: string }) {
  if (status === "accepted") return null;
  return (
    <div
      style={{
        marginTop: 14,
        padding: "10px 12px",
        background: "rgba(11,11,13,0.02)",
        border: `1px dashed ${C.borderSoft}`,
        borderRadius: 8,
        fontSize: 11.5,
        color: C.inkMuted,
        lineHeight: 1.5,
      }}
    >
      {expired ? (
        <span>
          This offer has expired. Reply in Chat to ask your coordinator to refresh it.
        </span>
      ) : (
        <>
          <strong style={{ color: C.ink }}>Payment & cancellation</strong> terms are summarized in the offer notes and will be confirmed in the booking contract after approval.
        </>
      )}
    </div>
  );
}

// ─── Drawer chrome ───────────────────────────────────────────────────────────

function DrawerShell({
  title,
  subtitle,
  onClose,
  children,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  // Body-scroll lock.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 110,
        display: "flex",
        justifyContent: "flex-end",
        background: "rgba(11,11,13,0.45)",
        backdropFilter: "blur(2px)",
      }}
    >
      <div
        onMouseDown={(e) => e.stopPropagation()}
        style={{
          width: "min(480px, 100vw)",
          height: "100dvh",
          background: C.surface,
          display: "flex",
          flexDirection: "column",
          boxShadow: "-12px 0 40px rgba(0,0,0,0.18)",
          fontFamily: FONT,
        }}
      >
        <div style={{ padding: "16px 22px", borderBottom: `1px solid ${C.borderSoft}`, background: "#fff", display: "flex", alignItems: "flex-start", gap: 10 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.inkMuted, textTransform: "uppercase", letterSpacing: 0.6 }}>
              Offer decision
            </div>
            <h2 style={{ margin: "3px 0 0", fontSize: 18, fontWeight: 600, color: C.ink, fontFamily: FONT_DISPLAY }}>
              {title}
            </h2>
            {subtitle && <p style={{ margin: "4px 0 0", fontSize: 12.5, color: C.inkMuted, lineHeight: 1.45 }}>{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{ width: 32, height: 32, borderRadius: 8, border: `1px solid ${C.borderSoft}`, background: "transparent", color: C.ink, fontSize: 16, cursor: "pointer" }}
          >
            ×
          </button>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "18px 22px" }}>
          {children}
        </div>
      </div>
    </div>
  );
}

function DrawerFooter({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ marginTop: 16, display: "flex", gap: 8, justifyContent: "flex-end" }}>
      {children}
    </div>
  );
}

function SummaryRow({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "100px 1fr", gap: 10, alignItems: "baseline" }}>
      <div style={{ fontSize: 11.5, color: C.inkMuted, fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: bold ? 16 : 13, fontWeight: bold ? 700 : 500, color: C.ink, fontVariantNumeric: "tabular-nums" }}>
        {value}
      </div>
    </div>
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        padding: "10px 12px",
        background: C.accentSoft,
        borderRadius: 8,
        fontSize: 12,
        color: C.accent,
        lineHeight: 1.5,
      }}
    >
      {children}
    </div>
  );
}

// ─── Primitives ──────────────────────────────────────────────────────────────

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        background: C.card,
        border: `1px solid ${C.borderSoft}`,
        borderRadius: 14,
        padding: "16px 18px",
        display: "flex",
        flexDirection: "column",
        gap: 14,
      }}
    >
      {children}
    </div>
  );
}

function Divider() {
  return <div style={{ height: 1, background: C.borderSoft }} />;
}

const emptyCardStyle: React.CSSProperties = {
  background: C.card,
  border: `1px solid ${C.borderSoft}`,
  borderRadius: 14,
  padding: "20px 22px",
};

function statusBadgeInfo(status: string, expired: boolean): { tone: "accent" | "success" | "amber" | "crimson"; label: string } {
  if (status === "accepted") return { tone: "success", label: "Accepted" };
  if (status === "rejected") return { tone: "crimson", label: "Declined" };
  if (status === "draft") return { tone: "amber", label: "Being prepared" };
  if (status === "sent") return expired ? { tone: "crimson", label: "Expired" } : { tone: "accent", label: "Awaiting your decision" };
  if (status === "withdrawn") return { tone: "crimson", label: "Withdrawn" };
  if (status === "superseded") return { tone: "amber", label: "Superseded" };
  return { tone: "amber", label: status };
}

function statusBadgeStyle(tone: "accent" | "success" | "amber" | "crimson"): React.CSSProperties {
  const palette = {
    accent: { bg: C.accentSoft, fg: C.accent },
    success: { bg: C.successSoft, fg: C.success },
    amber: { bg: C.amberSoft, fg: C.amber },
    crimson: { bg: C.crimsonSoft, fg: C.crimson },
  }[tone];
  return {
    padding: "4px 10px",
    borderRadius: 999,
    background: palette.bg,
    color: palette.fg,
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: 0.3,
    textTransform: "uppercase",
    whiteSpace: "nowrap",
  };
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: "9px 12px",
  borderRadius: 8,
  border: `1px solid ${C.border}`,
  fontFamily: FONT,
  fontSize: 13.5,
  color: C.ink,
  background: "#fff",
  outline: "none",
};

const primaryBtn: React.CSSProperties = {
  height: 38,
  padding: "0 18px",
  borderRadius: 9,
  background: C.ink,
  color: "#fff",
  border: "none",
  cursor: "pointer",
  fontFamily: FONT,
  fontSize: 13,
  fontWeight: 600,
  letterSpacing: 0.1,
};

const ghostBtn: React.CSSProperties = {
  height: 38,
  padding: "0 14px",
  borderRadius: 9,
  background: "#fff",
  color: C.ink,
  border: `1px solid ${C.border}`,
  cursor: "pointer",
  fontFamily: FONT,
  fontSize: 13,
  fontWeight: 600,
};

const declineBtn: React.CSSProperties = {
  height: 38,
  padding: "0 14px",
  borderRadius: 9,
  background: C.crimson,
  color: "#fff",
  border: "none",
  cursor: "pointer",
  fontFamily: FONT,
  fontSize: 13,
  fontWeight: 600,
};

const errorBoxStyle: React.CSSProperties = {
  padding: "10px 12px",
  background: C.crimsonSoft,
  borderRadius: 8,
  fontSize: 12.5,
  color: C.crimson,
  fontWeight: 600,
  lineHeight: 1.5,
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: currency || "USD",
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${amount} ${currency}`;
  }
}

function formatDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

function isExpired(iso: string | null): boolean {
  if (!iso) return false;
  try {
    return new Date(iso).getTime() < Date.now();
  } catch {
    return false;
  }
}

function statusLabel(s: string | null | undefined): string | null {
  if (!s) return null;
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function humanizeReason(reason: string): string {
  const map: Record<string, string> = {
    too_expensive: "too expensive",
    wrong_talent: "wrong talent fit",
    timing: "timing changed",
    changed_plans: "plans changed",
    other: "other",
  };
  return map[reason] ?? reason.replace(/_/g, " ");
}
