"use client";

/**
 * Phase E — pitch detail drawer.
 *
 * Opens when an admin clicks a row on the pitches list. Shows:
 *   - Recipient + status + timestamps
 *   - Brief details (event date / location / rate hint)
 *   - Talent list (active + client-removed)
 *   - Events timeline (created → sent → viewed → … → terminal)
 *   - Actions: regenerate share link, cancel, view converted inquiry
 *
 * Loads the detail bundle on first open via `loadPitchDetailAction`.
 * Re-fetches after cancel.
 */

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  cancelPitchAction,
  loadPitchDetailAction,
  regeneratePitchShareLinkAction,
  type PitchDetail,
  type RegeneratedPitchLink,
} from "./actions";
import type { PitchStatus } from "@/lib/pitch/pitch-types";

const ACTIVE: ReadonlyArray<PitchStatus> = ["draft", "sent", "viewed", "edited"];

const C = {
  ink: "#0B0B0D",
  inkMuted: "rgba(11,11,13,0.55)",
  inkDim: "rgba(11,11,13,0.35)",
  border: "rgba(24,24,27,0.08)",
  borderSoft: "rgba(24,24,27,0.06)",
  cardBg: "#fff",
  surface: "rgba(11,11,13,0.02)",
  accent: "#0F4F3E",
  accentSoft: "rgba(15,79,62,0.08)",
  red: "#b91c1c",
} as const;

// Event-type → human label
const EVENT_LABELS: Record<string, string> = {
  created: "Pitch created",
  updated: "Pitch updated",
  sent: "Sent to recipient",
  viewed: "Recipient viewed",
  talent_removed: "Recipient removed talent",
  declined: "Recipient declined",
  converted: "Converted to inquiry",
  cancelled: "Cancelled by admin",
  expired: "Expired",
  pitch_curated_override: "Trust-policy bypassed (curated)",
};

type Props = {
  tenantSlug: string;
  pitchId: string | null;
  onClose: () => void;
};

export function PitchDetailDrawer({ tenantSlug, pitchId, onClose }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [detail, setDetail] = useState<PitchDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [link, setLink] = useState<RegeneratedPitchLink | null>(null);
  const [linkLoading, setLinkLoading] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);

  // Load on open / pitchId change.
  useEffect(() => {
    if (!pitchId) {
      setDetail(null);
      setLink(null);
      setLoadError(null);
      setConfirmCancel(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    void (async () => {
      const result = await loadPitchDetailAction(tenantSlug, pitchId);
      if (cancelled) return;
      setLoading(false);
      if (!result.ok) {
        setLoadError(result.message ?? loadReasonCopy(result.reason));
        return;
      }
      setDetail(result.data);
    })();
    return () => {
      cancelled = true;
    };
  }, [tenantSlug, pitchId]);

  // ESC closes
  useEffect(() => {
    if (!pitchId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pitchId, onClose]);

  if (!pitchId) return null;

  async function handleRegenerate() {
    if (!pitchId) return;
    setLinkLoading(true);
    setLinkError(null);
    const result = await regeneratePitchShareLinkAction(tenantSlug, pitchId);
    setLinkLoading(false);
    if (!result.ok) {
      setLinkError(result.message ?? regenerateReasonCopy(result.reason));
      return;
    }
    setLink(result.data);
  }

  async function handleCopy() {
    if (!link) return;
    await navigator.clipboard.writeText(link.shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleCancel() {
    if (!pitchId) return;
    startTransition(async () => {
      const result = await cancelPitchAction(tenantSlug, pitchId);
      if (!result.ok) {
        setLoadError(result.message ?? "Could not cancel.");
        return;
      }
      // Re-fetch detail to show new state, and refresh the parent list.
      const fresh = await loadPitchDetailAction(tenantSlug, pitchId);
      if (fresh.ok) setDetail(fresh.data);
      setConfirmCancel(false);
      router.refresh();
    });
  }

  return (
    <>
      {/* Backdrop */}
      <button
        type="button"
        aria-label="Close drawer"
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(11,11,13,0.32)",
          border: "none",
          padding: 0,
          zIndex: 60,
          cursor: "default",
        }}
      />

      {/* Panel */}
      <aside
        role="dialog"
        aria-modal="true"
        style={{
          position: "fixed",
          right: 0,
          top: 0,
          bottom: 0,
          width: "min(580px, 100vw)",
          background: "#fff",
          boxShadow: "-12px 0 32px rgba(11,11,13,0.12)",
          display: "flex",
          flexDirection: "column",
          zIndex: 61,
          fontFamily: '"Inter", system-ui, sans-serif',
        }}
      >
        <header
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "16px 20px",
            borderBottom: `1px solid ${C.border}`,
            flexShrink: 0,
          }}
        >
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: C.ink }}>
            Pitch detail
          </h2>
          <button
            type="button"
            onClick={onClose}
            style={{
              border: "none",
              background: "transparent",
              padding: 6,
              cursor: "pointer",
              borderRadius: 6,
              color: C.inkMuted,
              fontSize: 18,
              lineHeight: 1,
            }}
            aria-label="Close"
          >
            ✕
          </button>
        </header>

        <div
          style={{
            flex: 1,
            overflow: "auto",
            padding: "20px 20px 32px",
          }}
        >
          {loading ? (
            <p style={{ color: C.inkMuted, fontSize: 13 }}>Loading…</p>
          ) : loadError ? (
            <p style={{ color: C.red, fontSize: 13 }}>{loadError}</p>
          ) : detail ? (
            <DetailContent
              detail={detail}
              link={link}
              linkLoading={linkLoading}
              linkError={linkError}
              copied={copied}
              onRegenerate={handleRegenerate}
              onCopy={handleCopy}
              tenantSlug={tenantSlug}
              confirmCancel={confirmCancel}
              onCancel={handleCancel}
              onCancelConfirm={() => setConfirmCancel(true)}
              onCancelDeny={() => setConfirmCancel(false)}
              cancelPending={isPending}
            />
          ) : null}
        </div>
      </aside>
    </>
  );
}

// ─── Detail body ───────────────────────────────────────────────────────────

function DetailContent({
  detail,
  link,
  linkLoading,
  linkError,
  copied,
  onRegenerate,
  onCopy,
  tenantSlug,
  confirmCancel,
  onCancel,
  onCancelConfirm,
  onCancelDeny,
  cancelPending,
}: {
  detail: PitchDetail;
  link: RegeneratedPitchLink | null;
  linkLoading: boolean;
  linkError: string | null;
  copied: boolean;
  onRegenerate: () => void;
  onCopy: () => void;
  tenantSlug: string;
  confirmCancel: boolean;
  onCancel: () => void;
  onCancelConfirm: () => void;
  onCancelDeny: () => void;
  cancelPending: boolean;
}) {
  const { pitch, talents, events } = detail;
  const isActive = ACTIVE.includes(pitch.status);
  const recipient = pitch.recipient_contact ?? {};
  const recipientName =
    (typeof recipient.name === "string" && recipient.name.trim()) ||
    (typeof recipient.email === "string" && recipient.email.trim()) ||
    "Unaddressed";
  const recipientCompany =
    typeof recipient.company === "string" && recipient.company.trim()
      ? recipient.company.trim()
      : null;

  const activeTalents = talents.filter((t) => !t.removedByClientAt);
  const removedTalents = talents.filter((t) => t.removedByClientAt);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
      {/* Recipient + status header */}
      <div>
        <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: 0.5, textTransform: "uppercase", color: C.inkDim }}>
          Recipient
        </div>
        <div style={{ marginTop: 4, fontSize: 16, fontWeight: 600, color: C.ink }}>
          {recipientName}
        </div>
        {recipientCompany ? (
          <div style={{ fontSize: 13, color: C.inkMuted, marginTop: 2 }}>{recipientCompany}</div>
        ) : null}
        <div style={{ marginTop: 10, display: "flex", gap: 12, flexWrap: "wrap", fontSize: 12, color: C.inkMuted }}>
          <span>
            <strong style={{ color: C.ink }}>Status:</strong> {statusLabel(pitch.status)}
          </span>
          <span>
            <strong style={{ color: C.ink }}>Created:</strong> {fmt(pitch.created_at)}
          </span>
          {pitch.sent_at ? (
            <span>
              <strong style={{ color: C.ink }}>Sent:</strong> {fmt(pitch.sent_at)}
            </span>
          ) : null}
          {pitch.expires_at ? (
            <span>
              <strong style={{ color: C.ink }}>Expires:</strong> {fmt(pitch.expires_at)}
            </span>
          ) : null}
          {pitch.view_count > 0 ? (
            <span>
              <strong style={{ color: C.ink }}>Views:</strong> {pitch.view_count}
            </span>
          ) : null}
        </div>
      </div>

      {/* Personal note */}
      {pitch.personal_note ? (
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: "12px 14px" }}>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: 0.4, textTransform: "uppercase", color: C.inkDim, marginBottom: 6 }}>
            Personal note
          </div>
          <p style={{ margin: 0, fontSize: 13, color: C.ink, whiteSpace: "pre-wrap", lineHeight: 1.5 }}>
            {pitch.personal_note}
          </p>
        </div>
      ) : null}

      {/* Brief */}
      <BriefSection pitch={pitch} />

      {/* Talents */}
      <section>
        <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: 0.4, textTransform: "uppercase", color: C.inkDim, marginBottom: 8 }}>
          Talents ({activeTalents.length}{removedTalents.length > 0 ? ` · ${removedTalents.length} removed` : ""})
        </div>
        <ol
          style={{
            margin: 0,
            padding: 0,
            listStyle: "none",
            display: "flex",
            flexDirection: "column",
            gap: 6,
          }}
        >
          {talents.map((t) => (
            <li
              key={t.pitchTalentId}
              style={{
                display: "flex",
                gap: 10,
                alignItems: "flex-start",
                padding: "9px 12px",
                borderRadius: 8,
                background: t.removedByClientAt ? "rgba(11,11,13,0.03)" : "#fff",
                border: `1px solid ${C.border}`,
                fontSize: 13,
                color: C.ink,
                opacity: t.removedByClientAt ? 0.55 : 1,
              }}
            >
              <span style={{ width: 22, color: C.inkDim, fontVariantNumeric: "tabular-nums" }}>
                {t.position + 1}.
              </span>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600 }}>
                  {t.displayName}
                  {t.removedByClientAt ? (
                    <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 500, color: C.inkMuted }}>
                      removed {fmt(t.removedByClientAt)}
                    </span>
                  ) : null}
                </div>
                {t.adminNote ? (
                  <div style={{ marginTop: 3, fontSize: 12, color: C.inkMuted, fontStyle: "italic" }}>
                    "{t.adminNote}"
                  </div>
                ) : null}
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* Actions */}
      <section>
        <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: 0.4, textTransform: "uppercase", color: C.inkDim, marginBottom: 8 }}>
          Actions
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {pitch.converted_inquiry_id ? (
            <a
              href={`/${tenantSlug}/admin/work/${pitch.converted_inquiry_id}`}
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                height: 36,
                padding: "0 14px",
                borderRadius: 8,
                background: C.accentSoft,
                color: C.accent,
                fontSize: 13,
                fontWeight: 600,
                textDecoration: "none",
                border: `1px solid rgba(15,79,62,0.18)`,
              }}
            >
              View converted inquiry →
            </a>
          ) : null}

          {isActive ? (
            <>
              <button
                type="button"
                onClick={onRegenerate}
                disabled={linkLoading}
                style={btnSecondary(linkLoading)}
              >
                {linkLoading ? "Generating link…" : link ? "Regenerate share link" : "Get share link"}
              </button>

              {link ? (
                <div
                  style={{
                    border: `1px solid ${C.border}`,
                    borderRadius: 8,
                    padding: "10px 12px",
                    background: C.surface,
                    fontSize: 12,
                    color: C.ink,
                  }}
                >
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <input
                      readOnly
                      value={link.shareUrl}
                      onFocus={(e) => e.target.select()}
                      style={{
                        flex: 1,
                        minWidth: 0,
                        padding: "6px 8px",
                        border: `1px solid ${C.border}`,
                        borderRadius: 6,
                        fontSize: 12,
                        fontFamily: "ui-monospace, monospace",
                        color: C.inkMuted,
                      }}
                    />
                    <button
                      type="button"
                      onClick={onCopy}
                      style={{
                        height: 28,
                        padding: "0 10px",
                        borderRadius: 6,
                        background: C.ink,
                        color: "#fff",
                        border: "none",
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: "pointer",
                      }}
                    >
                      {copied ? "Copied!" : "Copy"}
                    </button>
                  </div>
                  <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                    {link.whatsappDeepLink ? (
                      <a
                        href={link.whatsappDeepLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          flex: 1,
                          height: 30,
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: 6,
                          background: "#25D366",
                          color: "#fff",
                          fontSize: 12,
                          fontWeight: 600,
                          textDecoration: "none",
                          borderRadius: 6,
                        }}
                      >
                        💬 WhatsApp
                      </a>
                    ) : null}
                    {link.emailDeepLink ? (
                      <a
                        href={link.emailDeepLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          flex: 1,
                          height: 30,
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: 6,
                          background: C.cardBg,
                          color: C.ink,
                          border: `1px solid ${C.border}`,
                          fontSize: 12,
                          fontWeight: 600,
                          textDecoration: "none",
                          borderRadius: 6,
                        }}
                      >
                        ✉️ Email
                      </a>
                    ) : null}
                  </div>
                </div>
              ) : null}
              {linkError ? (
                <p style={{ color: C.red, fontSize: 12, margin: 0 }}>{linkError}</p>
              ) : null}

              {/* Cancel block */}
              {confirmCancel ? (
                <div style={{ border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 12px", background: "#fff" }}>
                  <p style={{ margin: 0, fontSize: 12.5, color: C.ink, fontWeight: 600 }}>
                    Cancel this pitch?
                  </p>
                  <p style={{ margin: "4px 0 8px", fontSize: 12, color: C.inkMuted }}>
                    The share link is invalidated immediately. This can&apos;t be undone.
                  </p>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button type="button" onClick={onCancel} disabled={cancelPending} style={btnDanger(cancelPending)}>
                      {cancelPending ? "Cancelling…" : "Yes, cancel"}
                    </button>
                    <button type="button" onClick={onCancelDeny} disabled={cancelPending} style={btnSecondary(cancelPending)}>
                      Keep
                    </button>
                  </div>
                </div>
              ) : (
                <button type="button" onClick={onCancelConfirm} style={btnSecondary(false)}>
                  Cancel pitch
                </button>
              )}
            </>
          ) : null}
        </div>
      </section>

      {/* Timeline */}
      <section>
        <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: 0.4, textTransform: "uppercase", color: C.inkDim, marginBottom: 8 }}>
          Timeline
        </div>
        {events.length === 0 ? (
          <p style={{ fontSize: 12, color: C.inkMuted, margin: 0 }}>No events recorded.</p>
        ) : (
          <ol
            style={{
              margin: 0,
              padding: 0,
              listStyle: "none",
              display: "flex",
              flexDirection: "column",
              gap: 0,
              borderLeft: `2px solid ${C.border}`,
            }}
          >
            {events.map((e) => (
              <li
                key={e.id}
                style={{
                  position: "relative",
                  padding: "6px 0 12px 16px",
                  fontSize: 12,
                }}
              >
                <span
                  aria-hidden
                  style={{
                    position: "absolute",
                    left: -5,
                    top: 9,
                    width: 8,
                    height: 8,
                    borderRadius: 4,
                    background: dotColorFor(e.event_type),
                  }}
                />
                <div style={{ color: C.ink, fontWeight: 600 }}>
                  {EVENT_LABELS[e.event_type] ?? e.event_type}
                  <span style={{ marginLeft: 8, color: C.inkDim, fontWeight: 400 }}>
                    {e.actor_role}
                  </span>
                </div>
                <div style={{ color: C.inkMuted, fontVariantNumeric: "tabular-nums" }}>
                  {fmt(e.created_at)}
                </div>
                {Object.keys(e.payload ?? {}).length > 0 ? (
                  <div style={{ color: C.inkDim, fontSize: 11, marginTop: 2 }}>
                    {summarisePayload(e.payload)}
                  </div>
                ) : null}
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}

function BriefSection({ pitch }: { pitch: PitchDetail["pitch"] }) {
  const b = pitch.brief ?? {};
  const date = typeof b.event_date === "string" ? b.event_date : null;
  const loc = typeof b.event_location === "string" ? b.event_location : null;
  const rate = typeof b.rate_hint === "string" ? b.rate_hint : null;
  if (!date && !loc && !rate) return null;
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: 0.4, textTransform: "uppercase", color: C.inkDim, marginBottom: 6 }}>
        Brief
      </div>
      <dl style={{ margin: 0, fontSize: 13, color: C.ink, display: "flex", flexDirection: "column", gap: 4 }}>
        {date ? (
          <div style={{ display: "flex", gap: 10 }}>
            <dt style={{ width: 80, color: C.inkMuted, flexShrink: 0 }}>Date</dt>
            <dd style={{ margin: 0 }}>{date}</dd>
          </div>
        ) : null}
        {loc ? (
          <div style={{ display: "flex", gap: 10 }}>
            <dt style={{ width: 80, color: C.inkMuted, flexShrink: 0 }}>Location</dt>
            <dd style={{ margin: 0 }}>{loc}</dd>
          </div>
        ) : null}
        {rate ? (
          <div style={{ display: "flex", gap: 10 }}>
            <dt style={{ width: 80, color: C.inkMuted, flexShrink: 0 }}>Rate</dt>
            <dd style={{ margin: 0 }}>{rate}</dd>
          </div>
        ) : null}
      </dl>
    </div>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function btnSecondary(disabled: boolean): React.CSSProperties {
  return {
    height: 36,
    padding: "0 14px",
    borderRadius: 8,
    background: "#fff",
    color: C.ink,
    border: `1px solid ${C.border}`,
    fontSize: 13,
    fontWeight: 600,
    cursor: disabled ? "default" : "pointer",
    opacity: disabled ? 0.55 : 1,
  };
}

function btnDanger(disabled: boolean): React.CSSProperties {
  return {
    height: 32,
    padding: "0 12px",
    borderRadius: 6,
    background: C.red,
    color: "#fff",
    border: "none",
    fontSize: 12,
    fontWeight: 600,
    cursor: disabled ? "default" : "pointer",
    opacity: disabled ? 0.6 : 1,
  };
}

function fmt(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function statusLabel(s: PitchStatus): string {
  return { draft: "Draft", sent: "Sent", viewed: "Viewed", edited: "Edited", converted: "Converted", declined: "Declined", cancelled: "Cancelled", expired: "Expired" }[s];
}

function dotColorFor(eventType: string): string {
  if (eventType === "converted") return "#1f6c47";
  if (eventType === "declined" || eventType === "cancelled") return "#b91c1c";
  if (eventType === "expired") return "#a16207";
  if (eventType === "viewed" || eventType === "talent_removed") return "#0F4F3E";
  return "rgba(11,11,13,0.4)";
}

function summarisePayload(payload: Record<string, unknown>): string {
  const parts: string[] = [];
  if (typeof payload.channel === "string") parts.push(`channel=${payload.channel}`);
  if (typeof payload.viewCount === "number") parts.push(`view #${payload.viewCount}`);
  if (typeof payload.talentCount === "number") parts.push(`${payload.talentCount} talents`);
  if (typeof payload.droppedCount === "number" && payload.droppedCount > 0) {
    parts.push(`(${payload.droppedCount} dropped)`);
  }
  if (typeof payload.reason === "string") parts.push(`reason: ${payload.reason}`);
  if (typeof payload.inquiryId === "string") parts.push(`inquiry`);
  return parts.join(" · ");
}

function loadReasonCopy(reason: string): string {
  switch (reason) {
    case "forbidden":
      return "You don't have permission to view this pitch.";
    case "not_authenticated":
      return "Sign in again.";
    case "pitch_not_found":
      return "Pitch not found.";
    default:
      return "Could not load pitch detail.";
  }
}

function regenerateReasonCopy(reason: string): string {
  switch (reason) {
    case "draft_required":
      return "Send the pitch before generating a share link.";
    case "expired":
      return "This pitch has expired — can't regenerate.";
    case "cancelled":
      return "This pitch is cancelled — can't regenerate.";
    case "forbidden":
      return "You don't have permission.";
    default:
      return "Could not generate a link.";
  }
}
