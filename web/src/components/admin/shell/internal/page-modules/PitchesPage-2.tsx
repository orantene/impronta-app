"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { cancelPitchAction, loadPitchDetailAction, regeneratePitchShareLinkAction } from "@/app/(workspace)/[tenantSlug]/admin/pitches/actions";
import type { PitchDetail, RegeneratedPitchLink } from "@/app/(workspace)/[tenantSlug]/admin/pitches/actions";
import { DrawerShell, Eyebrow, GhostButton, PrimaryButton } from "../primitives";
import { COLORS } from "../state";
import { PITCH_ACTIVE, PITCH_STATUS_TONE, fmtPitchDate } from "./PitchesPage-1";


// Detail drawer — uses the Drawer primitive so it picks up the prototype's
// existing chrome (header, scroll, ESC-to-close, backdrop) instead of a
// custom hand-rolled overlay.
export function PitchDetailDrawerInline({
  tenantSlug,
  pitchId,
  onClose,
  onCancelled,
}: {
  tenantSlug: string;
  pitchId: string;
  onClose: () => void;
  onCancelled: () => void;
}) {
  const [detail, setDetail] = useState<PitchDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState<RegeneratedPitchLink | null>(null);
  const [linkLoading, setLinkLoading] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [cancelPending, setCancelPending] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void (async () => {
      const r = await loadPitchDetailAction(tenantSlug, pitchId);
      if (cancelled) return;
      setLoading(false);
      if (!r.ok) {
        setError(r.message ?? "Could not load pitch detail.");
        return;
      }
      setDetail(r.data);
    })();
    return () => {
      cancelled = true;
    };
  }, [tenantSlug, pitchId]);

  return (
    <DrawerShell open onClose={onClose} title="Pitch detail" defaultSize="half" width={580}>
      {loading ? (
        <p style={{ fontSize: 13 }} className="text-admin-ink-muted">Loading…</p>
      ) : error ? (
        <p style={{ color: "#b91c1c", fontSize: 13 }}>{error}</p>
      ) : detail ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
          <PitchDetailRecipient detail={detail} />
          {detail.pitch.personal_note ? <PitchDetailNote note={detail.pitch.personal_note} /> : null}
          <PitchDetailBrief detail={detail} />
          <PitchDetailTalents detail={detail} />
          <PitchDetailActions
            detail={detail}
            tenantSlug={tenantSlug}
            link={link}
            linkLoading={linkLoading}
            linkError={linkError}
            copied={copied}
            confirmCancel={confirmCancel}
            cancelPending={cancelPending}
            onRegenerate={async () => {
              setLinkLoading(true);
              setLinkError(null);
              const r = await regeneratePitchShareLinkAction(tenantSlug, pitchId);
              setLinkLoading(false);
              if (!r.ok) {
                setLinkError(r.message ?? "Could not generate link.");
                return;
              }
              setLink(r.data);
            }}
            onCopy={async () => {
              if (!link) return;
              await navigator.clipboard.writeText(link.shareUrl);
              setCopied(true);
              setTimeout(() => setCopied(false), 1800);
            }}
            onCancelConfirm={() => setConfirmCancel(true)}
            onCancelDeny={() => setConfirmCancel(false)}
            onCancel={async () => {
              setCancelPending(true);
              const r = await cancelPitchAction(tenantSlug, pitchId);
              setCancelPending(false);
              if (r.ok) {
                setConfirmCancel(false);
                const fresh = await loadPitchDetailAction(tenantSlug, pitchId);
                if (fresh.ok) setDetail(fresh.data);
                onCancelled();
              }
            }}
          />
          <PitchDetailTimeline detail={detail} />
        </div>
      ) : null}
    </DrawerShell>
  );
}

function PitchDetailRecipient({ detail }: { detail: PitchDetail }) {
  const recipient = detail.pitch.recipient_contact ?? {};
  const name =
    (typeof recipient.name === "string" && recipient.name.trim()) ||
    (typeof recipient.email === "string" && recipient.email.trim()) ||
    "Unaddressed";
  const company = typeof recipient.company === "string" ? recipient.company.trim() : null;
  const phone = typeof recipient.phone === "string" ? recipient.phone.trim() : null;
  const email = typeof recipient.email === "string" ? recipient.email.trim() : null;
  return (
    <div>
      <Eyebrow>Recipient</Eyebrow>
      <div style={{ marginTop: 4, fontSize: 16, fontWeight: 600 }} className="text-admin-ink">{name}</div>
      {company ? <div style={{ fontSize: 13, marginTop: 2 }} className="text-admin-ink-muted">{company}</div> : null}
      {(phone || email) && (
        <div style={{ marginTop: 6, fontSize: 12 }} className="text-admin-ink-muted">
          {[email, phone].filter(Boolean).join(" · ")}
        </div>
      )}
      <div style={{ marginTop: 10, display: "flex", gap: 14, flexWrap: "wrap", fontSize: 12 }} className="text-admin-ink-muted">
        <span>Status: <strong className="text-admin-ink">{PITCH_STATUS_TONE[detail.pitch.status].label}</strong></span>
        <span>Created: <strong className="text-admin-ink">{fmtPitchDate(detail.pitch.created_at)}</strong></span>
        {detail.pitch.sent_at ? <span>Sent: <strong className="text-admin-ink">{fmtPitchDate(detail.pitch.sent_at)}</strong></span> : null}
        {detail.pitch.expires_at ? <span>Expires: <strong className="text-admin-ink">{fmtPitchDate(detail.pitch.expires_at)}</strong></span> : null}
        {detail.pitch.view_count > 0 ? <span>Views: <strong className="text-admin-ink">{detail.pitch.view_count}</strong></span> : null}
      </div>
    </div>
  );
}

function PitchDetailNote({ note }: { note: string }) {
  return (
    <div style={{ border: `1px solid ${COLORS.borderSoft}`, borderRadius: 10, padding: "12px 14px" }} className="bg-admin-fill">
      <Eyebrow>Personal note</Eyebrow>
      <p style={{ margin: "6px 0 0", fontSize: 13, whiteSpace: "pre-wrap", lineHeight: 1.5 }} className="text-admin-ink">{note}</p>
    </div>
  );
}

function PitchDetailBrief({ detail }: { detail: PitchDetail }) {
  const b = detail.pitch.brief ?? {};
  const date = typeof b.event_date === "string" ? b.event_date : null;
  const loc = typeof b.event_location === "string" ? b.event_location : null;
  const rate = typeof b.rate_hint === "string" ? b.rate_hint : null;
  if (!date && !loc && !rate) return null;
  return (
    <div>
      <Eyebrow>Brief</Eyebrow>
      <dl style={{ margin: "6px 0 0", fontSize: 13, color: COLORS.ink, display: "flex", flexDirection: "column", gap: 4 }}>
        {date ? (
          <div className="flex gap-3">
            <dt style={{ width: 80, color: COLORS.inkMuted, flexShrink: 0 }}>Date</dt>
            <dd style={{ margin: 0 }}>{date}</dd>
          </div>
        ) : null}
        {loc ? (
          <div className="flex gap-3">
            <dt style={{ width: 80, color: COLORS.inkMuted, flexShrink: 0 }}>Location</dt>
            <dd style={{ margin: 0 }}>{loc}</dd>
          </div>
        ) : null}
        {rate ? (
          <div className="flex gap-3">
            <dt style={{ width: 80, color: COLORS.inkMuted, flexShrink: 0 }}>Rate</dt>
            <dd style={{ margin: 0 }}>{rate}</dd>
          </div>
        ) : null}
      </dl>
    </div>
  );
}

function PitchDetailTalents({ detail }: { detail: PitchDetail }) {
  const active = detail.talents.filter((t) => !t.removedByClientAt);
  const removed = detail.talents.filter((t) => t.removedByClientAt);
  return (
    <div>
      <Eyebrow>
        Talents ({active.length}{removed.length > 0 ? ` · ${removed.length} removed` : ""})
      </Eyebrow>
      <ol style={{ margin: "8px 0 0", padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 6 }}>
        {detail.talents.map((t) => (
          <li
            key={t.pitchTalentId}
            style={{
              display: "flex",
              gap: 10,
              alignItems: "flex-start",
              padding: "8px 12px",
              borderRadius: 8,
              border: `1px solid ${COLORS.borderSoft}`,
              background: t.removedByClientAt ? "rgba(11,11,13,0.03)" : "#fff",
              fontSize: 13,
              color: COLORS.ink,
              opacity: t.removedByClientAt ? 0.6 : 1,
            }}
          >
            <span style={{ width: 22, fontVariantNumeric: "tabular-nums" }} className="text-admin-ink-dim">{t.position + 1}.</span>
            <div className="flex-1">
              <div className="font-semibold">
                {t.displayName}
                {t.removedByClientAt ? (
                  <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 500 }} className="text-admin-ink-muted">
                    removed {fmtPitchDate(t.removedByClientAt)}
                  </span>
                ) : null}
              </div>
              {t.adminNote ? (
                <div style={{ marginTop: 3, fontSize: 12, fontStyle: "italic" }} className="text-admin-ink-muted">
                  &ldquo;{t.adminNote}&rdquo;
                </div>
              ) : null}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

function PitchDetailActions({
  detail,
  tenantSlug,
  link,
  linkLoading,
  linkError,
  copied,
  confirmCancel,
  cancelPending,
  onRegenerate,
  onCopy,
  onCancelConfirm,
  onCancelDeny,
  onCancel,
}: {
  detail: PitchDetail;
  tenantSlug: string;
  link: RegeneratedPitchLink | null;
  linkLoading: boolean;
  linkError: string | null;
  copied: boolean;
  confirmCancel: boolean;
  cancelPending: boolean;
  onRegenerate: () => void;
  onCopy: () => void;
  onCancelConfirm: () => void;
  onCancelDeny: () => void;
  onCancel: () => void;
}) {
  const isActive = PITCH_ACTIVE.includes(detail.pitch.status);
  return (
    <div>
      <Eyebrow>Actions</Eyebrow>
      <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 10 }}>
        {detail.pitch.converted_inquiry_id ? (
          <Link
            href={`/${tenantSlug}/admin/work/${detail.pitch.converted_inquiry_id}`}
            style={{ textDecoration: "none" }}
          >
            <PrimaryButton size="sm">View converted inquiry →</PrimaryButton>
          </Link>
        ) : null}

        {isActive ? (
          <>
            <button
              type="button"
              onClick={linkLoading ? undefined : onRegenerate}
              disabled={linkLoading}
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                height: 34,
                padding: "0 14px",
                borderRadius: 8,
                background: "#fff",
                color: COLORS.ink,
                border: `1px solid ${COLORS.borderSoft}`,
                fontSize: 13,
                fontWeight: 600,
                cursor: linkLoading ? "default" : "pointer",
                opacity: linkLoading ? 0.55 : 1,
                width: "fit-content",
              }}
            >
              {linkLoading ? "Generating link…" : link ? "Regenerate share link" : "Get share link"}
            </button>

            {link ? (
              <div style={{ border: `1px solid ${COLORS.borderSoft}`, borderRadius: 8, padding: "10px 12px" }} className="bg-admin-fill">
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <input
                    readOnly
                    value={link.shareUrl}
                    onFocus={(e) => e.target.select()}
                    style={{
                      flex: 1,
                      minWidth: 0,
                      padding: "6px 8px",
                      border: `1px solid ${COLORS.borderSoft}`,
                      borderRadius: 6,
                      fontSize: 12,
                      fontFamily: "ui-monospace, monospace",
                      color: COLORS.inkMuted,
                      background: "#fff",
                    }}
                  />
                  <button
                    type="button"
                    onClick={onCopy}
                    style={{
                      border: "none",
                      background: COLORS.ink,
                      color: "#fff",
                      fontSize: 12,
                      fontWeight: 600,
                      padding: "6px 12px",
                      borderRadius: 6,
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
                        background: "#fff",
                        color: COLORS.ink,
                        border: `1px solid ${COLORS.borderSoft}`,
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
                <div style={{ marginTop: 8, fontSize: 11 }} className="text-admin-ink-dim">
                  Link valid until {fmtPitchDate(link.expiresAt)}.
                </div>
              </div>
            ) : null}
            {linkError ? <p style={{ color: "#b91c1c", fontSize: 12, margin: 0 }}>{linkError}</p> : null}

            {confirmCancel ? (
              <div style={{ border: `1px solid ${COLORS.borderSoft}`, borderRadius: 8, padding: "10px 12px", background: "#fff" }}>
                <p style={{ margin: 0, fontSize: 12.5, fontWeight: 600 }} className="text-admin-ink">Cancel this pitch?</p>
                <p style={{ margin: "4px 0 8px", fontSize: 12 }} className="text-admin-ink-muted">
                  The share link is invalidated immediately. This can&apos;t be undone.
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={onCancel}
                    disabled={cancelPending}
                    style={{
                      border: "none",
                      background: "#b91c1c",
                      color: "#fff",
                      fontSize: 12,
                      fontWeight: 600,
                      padding: "6px 12px",
                      borderRadius: 6,
                      cursor: cancelPending ? "default" : "pointer",
                      opacity: cancelPending ? 0.6 : 1,
                    }}
                  >
                    {cancelPending ? "Cancelling…" : "Yes, cancel"}
                  </button>
                  <button
                    type="button"
                    onClick={onCancelDeny}
                    disabled={cancelPending}
                    style={{
                      border: `1px solid ${COLORS.borderSoft}`,
                      background: "#fff",
                      color: COLORS.inkMuted,
                      fontSize: 12,
                      fontWeight: 600,
                      padding: "6px 12px",
                      borderRadius: 6,
                      cursor: "pointer",
                    }}
                  >
                    Keep
                  </button>
                </div>
              </div>
            ) : (
              <GhostButton size="sm" onClick={onCancelConfirm}>Cancel pitch</GhostButton>
            )}
          </>
        ) : null}
      </div>
    </div>
  );
}

function PitchDetailTimeline({ detail }: { detail: PitchDetail }) {
  if (detail.events.length === 0) {
    return (
      <div>
        <Eyebrow>Timeline</Eyebrow>
        <p style={{ marginTop: 8, fontSize: 12 }} className="text-admin-ink-muted">No events recorded.</p>
      </div>
    );
  }
  const labels: Record<string, string> = {
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
  return (
    <div>
      <Eyebrow>Timeline</Eyebrow>
      <ol
        style={{
          marginTop: 8,
          padding: 0,
          listStyle: "none",
          display: "flex",
          flexDirection: "column",
          gap: 0,
          borderLeft: `2px solid ${COLORS.borderSoft}`,
        }}
      >
        {detail.events.map((e) => (
          <li key={e.id} style={{ position: "relative", padding: "6px 0 12px 16px", fontSize: 12 }}>
            <span
              aria-hidden
              style={{
                position: "absolute",
                left: -5,
                top: 9,
                width: 8,
                height: 8,
                borderRadius: 4,
                background:
                  e.event_type === "converted"
                    ? "#1f6c47"
                    : e.event_type === "declined" || e.event_type === "cancelled"
                      ? "#b91c1c"
                      : e.event_type === "expired"
                        ? "#a16207"
                        : "rgba(11,11,13,0.4)",
              }}
            />
            <div style={{ fontWeight: 600 }} className="text-admin-ink">
              {labels[e.event_type] ?? e.event_type}
              <span style={{ marginLeft: 8, fontWeight: 400 }} className="text-admin-ink-dim">{e.actor_role}</span>
            </div>
            <div style={{ fontVariantNumeric: "tabular-nums" }} className="text-admin-ink-muted">
              {new Date(e.created_at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
