"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { interpolate } from "@/i18n/interpolate";
import { useT } from "@/i18n/use-t";
import { cancelPitchAction, loadPitchDetailAction, regeneratePitchShareLinkAction } from "@/app/(workspace)/[tenantSlug]/admin/pitches/actions";
import type { PitchDetail, RegeneratedPitchLink } from "@/app/(workspace)/[tenantSlug]/admin/pitches/actions";
import { DrawerShell, Eyebrow, GhostButton, PrimaryButton } from "../primitives";
import { COLORS } from "../state";
import { PITCH_ACTIVE, PITCH_STATUS_LABEL_KEYS, fmtPitchDate } from "./PitchesPage-1";


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
  const t = useT();
  // Keep the translator in a ref so the loader effect can read the current
  // locale's fallback string without listing `t` (which changes identity on
  // locale switch) in its deps and needlessly refetching pitch detail.
  const tRef = useRef(t);
  useEffect(() => {
    tRef.current = t;
  }, [t]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void (async () => {
      const r = await loadPitchDetailAction(tenantSlug, pitchId);
      if (cancelled) return;
      setLoading(false);
      if (!r.ok) {
        setError(r.message ?? tRef.current("dashboard.adminPitches.errLoadDetail"));
        return;
      }
      setDetail(r.data);
    })();
    return () => {
      cancelled = true;
    };
  }, [tenantSlug, pitchId]);

  return (
    <DrawerShell open onClose={onClose} title={t("dashboard.adminPitches.detailTitle")} defaultSize="half" width={580}>
      {loading ? (
        <p className="text-admin-ink-muted text-admin-13">{t("dashboard.adminPitches.loading")}</p>
      ) : error ? (
        <p style={{ color: "#b91c1c", fontSize: 13 }}>{error}</p>
      ) : detail ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
          <PitchDetailRecipient detail={detail} t={t} />
          {detail.pitch.personal_note ? <PitchDetailNote note={detail.pitch.personal_note} t={t} /> : null}
          <PitchDetailBrief detail={detail} t={t} />
          <PitchDetailTalents detail={detail} t={t} />
          <PitchDetailActions
            detail={detail}
            tenantSlug={tenantSlug}
            link={link}
            linkLoading={linkLoading}
            linkError={linkError}
            copied={copied}
            confirmCancel={confirmCancel}
            cancelPending={cancelPending}
            t={t}
            onRegenerate={async () => {
              setLinkLoading(true);
              setLinkError(null);
              const r = await regeneratePitchShareLinkAction(tenantSlug, pitchId);
              setLinkLoading(false);
              if (!r.ok) {
                setLinkError(r.message ?? t("dashboard.adminPitches.errGenerateLink"));
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
          <PitchDetailTimeline detail={detail} t={t} />
        </div>
      ) : null}
    </DrawerShell>
  );
}

function PitchDetailRecipient({ detail, t }: { detail: PitchDetail; t: ReturnType<typeof useT> }) {
  const recipient = detail.pitch.recipient_contact ?? {};
  const name =
    (typeof recipient.name === "string" && recipient.name.trim()) ||
    (typeof recipient.email === "string" && recipient.email.trim()) ||
    t("dashboard.adminPitches.recipientUnaddressed");
  const company = typeof recipient.company === "string" ? recipient.company.trim() : null;
  const phone = typeof recipient.phone === "string" ? recipient.phone.trim() : null;
  const email = typeof recipient.email === "string" ? recipient.email.trim() : null;
  return (
    <div>
      <Eyebrow>{t("dashboard.adminPitches.recipientEyebrow")}</Eyebrow>
      <div style={{ marginTop: 4, fontSize: 16, fontWeight: 600 }} className="text-admin-ink">{name}</div>
      {company ? <div style={{ fontSize: 13, marginTop: 2 }} className="text-admin-ink-muted">{company}</div> : null}
      {(phone || email) && (
        <div style={{ marginTop: 6, fontSize: 12 }} className="text-admin-ink-muted">
          {[email, phone].filter(Boolean).join(" · ")}
        </div>
      )}
      <div style={{ marginTop: 10, display: "flex", gap: 14, flexWrap: "wrap", fontSize: 12 }} className="text-admin-ink-muted">
        <span>{t("dashboard.adminPitches.metaStatus")} <strong className="text-admin-ink">{t(PITCH_STATUS_LABEL_KEYS[detail.pitch.status])}</strong></span>
        <span>{t("dashboard.adminPitches.metaCreated")} <strong className="text-admin-ink">{fmtPitchDate(detail.pitch.created_at)}</strong></span>
        {detail.pitch.sent_at ? <span>{t("dashboard.adminPitches.metaSent")} <strong className="text-admin-ink">{fmtPitchDate(detail.pitch.sent_at)}</strong></span> : null}
        {detail.pitch.expires_at ? <span>{t("dashboard.adminPitches.metaExpires")} <strong className="text-admin-ink">{fmtPitchDate(detail.pitch.expires_at)}</strong></span> : null}
        {detail.pitch.view_count > 0 ? <span>{t("dashboard.adminPitches.metaViews")} <strong className="text-admin-ink">{detail.pitch.view_count}</strong></span> : null}
      </div>
    </div>
  );
}

function PitchDetailNote({ note, t }: { note: string; t: ReturnType<typeof useT> }) {
  return (
    <div style={{ border: `1px solid ${COLORS.borderSoft}`, borderRadius: 10, padding: "12px 14px" }} className="bg-admin-fill">
      <Eyebrow>{t("dashboard.adminPitches.personalNote")}</Eyebrow>
      <p style={{ margin: "6px 0 0", fontSize: 13, whiteSpace: "pre-wrap", lineHeight: 1.5 }} className="text-admin-ink">{note}</p>
    </div>
  );
}

function PitchDetailBrief({ detail, t }: { detail: PitchDetail; t: ReturnType<typeof useT> }) {
  const b = detail.pitch.brief ?? {};
  const date = typeof b.event_date === "string" ? b.event_date : null;
  const loc = typeof b.event_location === "string" ? b.event_location : null;
  const rate = typeof b.rate_hint === "string" ? b.rate_hint : null;
  if (!date && !loc && !rate) return null;
  return (
    <div>
      <Eyebrow>{t("dashboard.adminPitches.briefEyebrow")}</Eyebrow>
      <dl style={{ margin: "6px 0 0", fontSize: 13, color: COLORS.ink, display: "flex", flexDirection: "column", gap: 4 }}>
        {date ? (
          <div className="flex gap-3">
            <dt style={{ width: 80, color: COLORS.inkMuted, flexShrink: 0 }}>{t("dashboard.adminPitches.briefDate")}</dt>
            <dd style={{ margin: 0 }}>{date}</dd>
          </div>
        ) : null}
        {loc ? (
          <div className="flex gap-3">
            <dt style={{ width: 80, color: COLORS.inkMuted, flexShrink: 0 }}>{t("dashboard.adminPitches.briefLocation")}</dt>
            <dd style={{ margin: 0 }}>{loc}</dd>
          </div>
        ) : null}
        {rate ? (
          <div className="flex gap-3">
            <dt style={{ width: 80, color: COLORS.inkMuted, flexShrink: 0 }}>{t("dashboard.adminPitches.briefRate")}</dt>
            <dd style={{ margin: 0 }}>{rate}</dd>
          </div>
        ) : null}
      </dl>
    </div>
  );
}

function PitchDetailTalents({ detail, t }: { detail: PitchDetail; t: ReturnType<typeof useT> }) {
  const active = detail.talents.filter((row) => !row.removedByClientAt);
  const removed = detail.talents.filter((row) => row.removedByClientAt);
  return (
    <div>
      <Eyebrow>
        {removed.length > 0
          ? interpolate(t("dashboard.adminPitches.talentsWithRemoved"), { count: active.length, removed: removed.length })
          : interpolate(t("dashboard.adminPitches.talentsWithCount"), { count: active.length })}
      </Eyebrow>
      <ol style={{ margin: "8px 0 0", padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 6 }}>
        {detail.talents.map((row) => (
          <li
            key={row.pitchTalentId}
            style={{
              display: "flex",
              gap: 10,
              alignItems: "flex-start",
              padding: "8px 12px",
              borderRadius: 8,
              border: `1px solid ${COLORS.borderSoft}`,
              background: row.removedByClientAt ? "rgba(11,11,13,0.03)" : "#fff",
              fontSize: 13,
              color: COLORS.ink,
              opacity: row.removedByClientAt ? 0.6 : 1,
            }}
          >
            <span style={{ width: 22, fontVariantNumeric: "tabular-nums" }} className="text-admin-ink-dim">{row.position + 1}.</span>
            <div className="flex-1">
              <div className="font-semibold">
                {row.displayName}
                {row.removedByClientAt ? (
                  <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 500 }} className="text-admin-ink-muted">
                    {interpolate(t("dashboard.adminPitches.talentRemovedOn"), { date: fmtPitchDate(row.removedByClientAt) })}
                  </span>
                ) : null}
              </div>
              {row.adminNote ? (
                <div style={{ marginTop: 3, fontSize: 12, fontStyle: "italic" }} className="text-admin-ink-muted">
                  &ldquo;{row.adminNote}&rdquo;
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
  t,
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
  t: ReturnType<typeof useT>;
}) {
  const isActive = PITCH_ACTIVE.includes(detail.pitch.status);
  return (
    <div>
      <Eyebrow>{t("dashboard.adminPitches.actionsEyebrow")}</Eyebrow>
      <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 10 }}>
        {detail.pitch.converted_inquiry_id ? (
          <Link
            href={`/${tenantSlug}/admin/work/${detail.pitch.converted_inquiry_id}`}
            style={{ textDecoration: "none" }}
          >
            <PrimaryButton size="sm">{t("dashboard.adminPitches.viewConvertedInquiry")}</PrimaryButton>
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
              {linkLoading ? t("dashboard.adminPitches.generatingLink") : link ? t("dashboard.adminPitches.regenerateShareLink") : t("dashboard.adminPitches.getShareLink")}
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
                    {copied ? t("dashboard.adminPitches.copied") : t("dashboard.adminPitches.copy")}
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
                      💬 {t("dashboard.adminPitches.whatsapp")}
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
                      ✉️ {t("dashboard.adminPitches.email")}
                    </a>
                  ) : null}
                </div>
                <div style={{ marginTop: 8, fontSize: 11 }} className="text-admin-ink-dim">
                  {interpolate(t("dashboard.adminPitches.linkValidUntil"), { date: fmtPitchDate(link.expiresAt) })}
                </div>
              </div>
            ) : null}
            {linkError ? <p style={{ color: "#b91c1c", fontSize: 12, margin: 0 }}>{linkError}</p> : null}

            {confirmCancel ? (
              <div style={{ border: `1px solid ${COLORS.borderSoft}`, borderRadius: 8, padding: "10px 12px", background: "#fff" }}>
                <p style={{ margin: 0, fontSize: 12.5, fontWeight: 600 }} className="text-admin-ink">{t("dashboard.adminPitches.confirmCancelTitle")}</p>
                <p style={{ margin: "4px 0 8px", fontSize: 12 }} className="text-admin-ink-muted">
                  {t("dashboard.adminPitches.confirmCancelBody")}
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
                    {cancelPending ? t("dashboard.adminPitches.cancelling") : t("dashboard.adminPitches.confirmYesCancel")}
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
                    {t("dashboard.adminPitches.keep")}
                  </button>
                </div>
              </div>
            ) : (
              <GhostButton size="sm" onClick={onCancelConfirm}>{t("dashboard.adminPitches.cancelPitch")}</GhostButton>
            )}
          </>
        ) : null}
      </div>
    </div>
  );
}

// Maps each pitch-event discriminant to its catalog key (additive pattern).
// Unknown event types fall through to the raw DB value at the render site.
const PITCH_EVENT_LABEL_KEYS: Record<string, string> = {
  created: "dashboard.adminPitches.eventCreated",
  updated: "dashboard.adminPitches.eventUpdated",
  sent: "dashboard.adminPitches.eventSent",
  viewed: "dashboard.adminPitches.eventViewed",
  talent_removed: "dashboard.adminPitches.eventTalentRemoved",
  declined: "dashboard.adminPitches.eventDeclined",
  converted: "dashboard.adminPitches.eventConverted",
  cancelled: "dashboard.adminPitches.eventCancelled",
  expired: "dashboard.adminPitches.eventExpired",
  pitch_curated_override: "dashboard.adminPitches.eventCuratedOverride",
};

function PitchDetailTimeline({ detail, t }: { detail: PitchDetail; t: ReturnType<typeof useT> }) {
  if (detail.events.length === 0) {
    return (
      <div>
        <Eyebrow>{t("dashboard.adminPitches.timelineEyebrow")}</Eyebrow>
        <p style={{ marginTop: 8, fontSize: 12 }} className="text-admin-ink-muted">{t("dashboard.adminPitches.timelineEmpty")}</p>
      </div>
    );
  }
  return (
    <div>
      <Eyebrow>{t("dashboard.adminPitches.timelineEyebrow")}</Eyebrow>
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
              {PITCH_EVENT_LABEL_KEYS[e.event_type] ? t(PITCH_EVENT_LABEL_KEYS[e.event_type]) : e.event_type}
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
