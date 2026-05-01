"use client";

/**
 * Talent drawer bodies — all `export function Talent*Drawer()` components
 * extracted from _talent.tsx by WS-13.2 (split by page / module).
 *
 * ─── What lives here ─────────────────────────────────────────────────────────
 *   • Every drawer body that the talent surface opens (40+ drawers)
 *   • Private helpers that are ONLY used within those drawers:
 *       useSaveAndClose, StandardFooter, statusLabel, KvRow, ModePicker,
 *       ModePickerCard, LogWorkForm, BlockTimeForm, ToggleRow,
 *       AvailabilityAddAction, SubsectionLabel, AvailabilityToggleRow,
 *       ReachStat, ReachStatDivider, ExposurePresetSlider, ProTierValueCard,
 *       ReachHealthScore, ProTierCompactStrip, DistributionCard,
 *       ChannelRow, AvailableChannelRow, PresetButton, NetworkRow,
 *       SummaryStat, netOf, SourceChip, SectionLabel, and others
 *   • LockedBadge — inlined here (also kept in _talent.tsx for MyProfilePage)
 *
 * ─── What stays in _talent.tsx ───────────────────────────────────────────────
 *   • Shell: TalentSurface, TalentTopbar, TalentRouter
 *   • Pages: TalentTodayPage, MyProfilePage, TalentMessagesPage,
 *            CalendarPage, ActivityPage, ReachPage, SettingsPage
 *   • Late page components: EarningsTile, WeekRhythmStrip,
 *            AgenciesPage, PublicPageEditor
 *
 * ─── Dev note (WS-13.2 follow-up) ───────────────────────────────────────────
 *   Each page should be further split into its own file
 *   (_talent_today.tsx, _talent_profile.tsx, _talent_messages.tsx, …)
 *   and lazy-loaded via next/dynamic in TalentRouter.
 */

import { useState, type ReactNode } from "react";
import {
  AVAILABILITY_BLOCKS,
  AVAILABLE_CHANNELS,
  CLIENT_TRUST_LEVELS,
  CLIENT_TRUST_META,
  COLORS,
  DEFAULT_CONTACT_POLICY,
  EARNINGS_ROWS,
  FONTS,
  RADIUS,
  TRANSITION,
  MY_AGENCIES,
  MY_TALENT_PROFILE,
  POLAROID_SET,
  SELECTIVE_CONTACT_POLICY,
  TALENT_BOOKINGS,
  TALENT_CHANNELS,
  TALENT_PAGE_TEMPLATES,
  TALENT_REQUESTS,
  TALENT_SPECIALTY_LABEL,
  TALENT_TIER_META,
  summarizeLanguages,
  tierAllows,
  useProto,
  type TalentContactPolicy,
  type TalentCredit,
  type TalentLink,
  type TalentLimit,
  type TalentMediaEmbed,
  type TalentRequest,
  type TalentReview,
  type TalentSkill,
  type TalentSubscriptionTier,
} from "./_state";
import {
  Avatar,
  CapsLabel,
  CelebrationBanner,
  ClientTrustChip,
  Divider,
  DrawerShell,
  FieldRow,
  Icon,
  PrimaryButton,
  ProfilePhotoBadgeOverlay,
  SecondaryButton,
  TextArea,
  TextInput,
  Toggle,
  TrustBadgeGroup,
} from "./_primitives";

// ─── LockedBadge (inlined — also in _talent.tsx for MyProfilePage) ────────────
/** Lock badge shown next to a feature card when the talent's tier doesn't unlock it. */
function LockedBadge({ requiredTier }: { requiredTier: TalentSubscriptionTier }) {
  const meta = TALENT_TIER_META[requiredTier];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: "2px 7px",
        background: requiredTier === "portfolio" ? COLORS.fill : COLORS.accentSoft,
        color: requiredTier === "portfolio" ? "#fff" : COLORS.accent,
        border: `1px solid ${requiredTier === "portfolio" ? COLORS.accent : "rgba(15,79,62,0.28)"}`,
        fontFamily: FONTS.body,
        fontSize: 10,
        fontWeight: 600,
        letterSpacing: 0.3,
        borderRadius: 999,
        textTransform: "uppercase",
      }}
      title={`Unlocked at ${meta.label}`}
    >
      <span style={{ fontSize: 9 }}>🔒</span>
      {meta.label}
    </span>
  );
}

// ─── RequestKindBadge (moved from _talent.tsx — only used by drawers) ────────
function RequestKindBadge({ kind, status }: { kind: TalentRequest["kind"]; status: TalentRequest["status"] }) {
  const labels: Record<TalentRequest["kind"], string> = {
    offer: "Offer",
    hold: "Hold",
    casting: "Casting",
    request: "Request",
  };
  let bg = "rgba(11,11,13,0.05)";
  let fg = COLORS.ink;
  if (status === "needs-answer") {
    bg = "rgba(82,96,109,0.12)";
    fg = COLORS.amberDeep;
  } else if (status === "accepted") {
    bg = COLORS.successSoft;
    fg = COLORS.successDeep;
  } else if (status === "declined" || status === "expired") {
    bg = "rgba(11,11,13,0.04)";
    fg = COLORS.inkDim;
  }
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "3px 9px",
        borderRadius: 999,
        background: bg,
        color: fg,
        fontFamily: FONTS.body,
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: 0.4,
        textTransform: "uppercase",
      }}
    >
      {labels[kind]}
    </span>
  );
}

// ════════════════════════════════════════════════════════════════════
// DRAWERS
// ════════════════════════════════════════════════════════════════════

// Helper — close + toast
function useSaveAndClose(message = "Saved") {
  const { closeDrawer, toast } = useProto();
  return () => {
    toast(message);
    closeDrawer();
  };
}

function StandardFooter({
  onSave,
  saveLabel = "Save",
  destructive,
}: {
  onSave?: () => void;
  saveLabel?: string;
  destructive?: { label: string; onClick: () => void };
}) {
  const { closeDrawer } = useProto();
  return (
    <>
      {destructive && (
        <button
          onClick={destructive.onClick}
          style={{
            background: "transparent",
            border: `1px solid ${COLORS.borderSoft}`,
            color: COLORS.red,
            padding: "8px 12px",
            borderRadius: 8,
            fontFamily: FONTS.body,
            fontSize: 12.5,
            fontWeight: 500,
            cursor: "pointer",
            marginRight: "auto",
          }}
        >
          {destructive.label}
        </button>
      )}
      <SecondaryButton onClick={closeDrawer}>Cancel</SecondaryButton>
      {onSave && <PrimaryButton onClick={onSave}>{saveLabel}</PrimaryButton>}
    </>
  );
}

// ─── Today pulse drawer ───────────────────────────────────────────

export function TalentTodayPulseDrawer() {
  const { state, closeDrawer, openDrawer } = useProto();
  const open = state.drawer.drawerId === "talent-today-pulse";
  const items = TALENT_REQUESTS.filter((r) => r.status === "needs-answer" || r.status === "viewed");
  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title="Inbox · what's hot"
      description="Everything from your agencies that's still in motion."
      width={560}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {items.map((r) => (
          <button
            key={r.id}
            onClick={() => openDrawer("talent-offer-detail", { id: r.id })}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "12px 14px",
              background: "#fff",
              border: `1px solid ${COLORS.borderSoft}`,
              borderRadius: 10,
              cursor: "pointer",
              textAlign: "left",
              fontFamily: FONTS.body,
            }}
          >
            <RequestKindBadge kind={r.kind} status={r.status} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  fontSize: 13.5,
                  fontWeight: 500,
                  color: COLORS.ink,
                }}
              >
                <span style={{ flex: "0 1 auto", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {r.client} · {r.brief}
                </span>
                <ClientTrustChip level={r.clientTrust} compact />
              </div>
              <div style={{ fontSize: 11.5, color: COLORS.inkMuted, marginTop: 2 }}>
                via {r.agency}
                {r.date && <> · {r.date}</>}
                {r.amount && <> · {r.amount}</>}
              </div>
            </div>
            <Icon name="chevron-right" size={14} color={COLORS.inkDim} />
          </button>
        ))}
      </div>
    </DrawerShell>
  );
}

// ─── Offer detail drawer ──────────────────────────────────────────

export function TalentOfferDetailDrawer() {
  const { state, closeDrawer, toast, openDrawer } = useProto();
  const open = state.drawer.drawerId === "talent-offer-detail" || state.drawer.drawerId === "talent-request-detail";
  const id = (state.drawer.payload?.id as string) ?? "rq1";
  const r = TALENT_REQUESTS.find((x) => x.id === id) ?? TALENT_REQUESTS[0];

  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title={`${r.client} · ${r.brief}`}
      description={`via ${r.agency}${r.date ? ` · ${r.date}` : ""}`}
      toolbar={<ClientTrustChip level={r.clientTrust} />}
      width={560}
      footer={
        r.status === "needs-answer" ? (
          <>
            <button
              onClick={() => {
                toast("Declined — agency notified");
                closeDrawer();
              }}
              style={{
                background: "transparent",
                border: `1px solid ${COLORS.borderSoft}`,
                color: COLORS.red,
                padding: "8px 12px",
                borderRadius: 8,
                fontFamily: FONTS.body,
                fontSize: 12.5,
                fontWeight: 500,
                cursor: "pointer",
                marginRight: "auto",
              }}
            >
              Decline
            </button>
            <SecondaryButton
              onClick={() => {
                toast("Marked as 'on hold' for the agency");
                closeDrawer();
              }}
            >
              Hold open
            </SecondaryButton>
            <SecondaryButton onClick={() => openDrawer("talent-voice-reply")}>
              🎙️ Voice reply
            </SecondaryButton>
            <PrimaryButton
              onClick={() => {
                toast("Accepted — booking will be created when terms are final");
                closeDrawer();
              }}
            >
              Accept
            </PrimaryButton>
          </>
        ) : (
          <SecondaryButton onClick={closeDrawer}>Close</SecondaryButton>
        )
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <KvRow label="Status" value={statusLabel(r.status)} />
        <KvRow label="Date" value={r.date ?? "TBC"} />
        <KvRow label="Fee" value={r.amount ?? "TBC"} />
        <KvRow label="Client" value={r.client} />
        <KvRow label="Agency" value={r.agency} />
        <Divider label="Brief" />
        <p style={{ fontFamily: FONTS.body, fontSize: 13.5, color: COLORS.ink, lineHeight: 1.6 }}>
          The agency briefed this as: "<em>{r.brief}</em>". Tap accept to confirm — your agency
          will turn this into a confirmed booking with full call sheet and contract once the
          client locks in. You can also hold open if you want more time.
        </p>
        <Divider label="Terms (preview)" />
        <ul style={{ margin: 0, paddingLeft: 18, fontFamily: FONTS.body, fontSize: 13, color: COLORS.inkMuted, lineHeight: 1.7 }}>
          <li>Usage: web + social, 12 months · in-region (Europe)</li>
          <li>Turnaround: deliver same week</li>
          <li>Buyout option: clients can extend usage at +30%</li>
          <li>Cancellation: 50% if &lt; 48h notice</li>
        </ul>
      </div>
    </DrawerShell>
  );
}

function statusLabel(s: TalentRequest["status"]): string {
  return ({
    "needs-answer": "Needs your answer",
    viewed: "Viewed",
    accepted: "Accepted",
    declined: "Declined",
    expired: "Expired",
  } as const)[s];
}

function KvRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
      <span
        style={{
          fontFamily: FONTS.body,
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: 1.2,
          textTransform: "uppercase",
          color: COLORS.inkMuted,
          minWidth: 90,
        }}
      >
        {label}
      </span>
      <span style={{ fontFamily: FONTS.body, fontSize: 13.5, color: COLORS.ink }}>{value}</span>
    </div>
  );
}

// ─── Booking detail (call sheet) ──────────────────────────────────

export function TalentBookingDetailDrawer() {
  const { state, closeDrawer, toast } = useProto();
  const open = state.drawer.drawerId === "talent-booking-detail";
  const id = (state.drawer.payload?.id as string) ?? "bk1";
  const b = TALENT_BOOKINGS.find((x) => x.id === id) ?? TALENT_BOOKINGS[0];

  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title={`${b.client} · ${b.brief}`}
      description={`Booking via ${b.agency}`}
      width={560}
      footer={
        <>
          <SecondaryButton onClick={() => toast("Saved to calendar")}>Add to calendar</SecondaryButton>
          <PrimaryButton onClick={closeDrawer}>Got it</PrimaryButton>
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <KvRow label="Date" value={b.endDate ? `${b.startDate} → ${b.endDate}` : b.startDate} />
        <KvRow label="Call time" value={b.call} />
        <KvRow label="Location" value={b.location} />
        <KvRow label="Fee" value={b.amount} />
        <KvRow label="Status" value={b.status} />
        <Divider label="What to bring" />
        <ul style={{ margin: 0, paddingLeft: 18, fontFamily: FONTS.body, fontSize: 13, color: COLORS.ink, lineHeight: 1.7 }}>
          <li>Nude underwear · neutral footwear</li>
          <li>Hair dry & natural · light skin prep only</li>
          <li>Government ID · agency contract reference</li>
        </ul>
        <Divider label="Contacts on the day" />
        <KvRow label="Producer" value="Inés López · +34 612 — 451" />
        <KvRow label="Stylist" value="Lia Roca" />
        <KvRow label="Photographer" value="Studio Roca" />
      </div>
    </DrawerShell>
  );
}

// ─── Closed booking (read-only past-work archive) ────────────────────
// Opens when a talent clicks a row in "Recent earnings" on Today.
// Shows what the booking WAS — team, key facts, archived chat — so a
// talent can look back at past work without leaving Today. Read-only by
// design: this isn't a booking workflow, it's a portfolio entry.

export function TalentClosedBookingDrawer() {
  const { state, closeDrawer, openDrawer, toast } = useProto();
  const open = state.drawer.drawerId === "talent-closed-booking";
  const earningId = (state.drawer.payload?.earningId as string) ?? "e1";
  const e = EARNINGS_ROWS.find((x) => x.id === earningId) ?? EARNINGS_ROWS[0]!;
  const idx = EARNINGS_ROWS.findIndex((x) => x.id === earningId);
  const prev = idx > 0 ? EARNINGS_ROWS[idx - 1] : null;
  const next = idx < EARNINGS_ROWS.length - 1 ? EARNINGS_ROWS[idx + 1] : null;

  // Mock per-booking detail (in production, derived from the booking +
  // archived inquiry thread). Different shape per client to demonstrate
  // variety.
  const detail = MOCK_CLOSED_DETAIL[e.id] ?? MOCK_CLOSED_DETAIL.default!;

  // Repeat-client signal — count of bookings + lifetime earnings with
  // this client across all completed bookings. Surfaces "this is your
  // 5th gig with Vogue Italia" as a relationship signal.
  const sameClient = EARNINGS_ROWS.filter((x) => x.client === e.client);
  const lifetimeAmount = sameClient.reduce((sum, x) => {
    const num = parseFloat(x.amount.replace(/[^0-9.]/g, ""));
    return sum + (isNaN(num) ? 0 : num);
  }, 0);
  const currency = e.amount.match(/[€£$]/)?.[0] ?? "€";
  const lifetimeLabel = `${currency}${lifetimeAmount.toLocaleString()}`;
  const isRepeat = sameClient.length > 1;

  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title={`${e.client} · ${detail.brief}`}
      description={`Closed booking · worked ${e.workDate} · paid ${e.payoutDate}`}
      width={580}
      footer={
        <>
          <button
            type="button"
            onClick={() => prev && openDrawer("talent-closed-booking", { earningId: prev.id })}
            disabled={!prev}
            style={{
              background: "transparent",
              border: `1px solid ${COLORS.borderSoft}`,
              borderRadius: 7,
              padding: "7px 11px",
              fontFamily: FONTS.body,
              fontSize: 12,
              color: prev ? COLORS.ink : COLORS.inkDim,
              cursor: prev ? "pointer" : "not-allowed",
            }}
          >
            ← Newer
          </button>
          <button
            type="button"
            onClick={() => next && openDrawer("talent-closed-booking", { earningId: next.id })}
            disabled={!next}
            style={{
              background: "transparent",
              border: `1px solid ${COLORS.borderSoft}`,
              borderRadius: 7,
              padding: "7px 11px",
              fontFamily: FONTS.body,
              fontSize: 12,
              color: next ? COLORS.ink : COLORS.inkDim,
              cursor: next ? "pointer" : "not-allowed",
            }}
          >
            Older →
          </button>
          <div style={{ flex: 1 }} />
          <SecondaryButton onClick={() => openDrawer("talent-chat-archive")}>
            📄 Archive thread
          </SecondaryButton>
          <SecondaryButton onClick={closeDrawer}>Close</SecondaryButton>
        </>
      }
    >
      {/* Closed/archived banner — visual cue that this is read-only. */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "8px 12px",
          background: "rgba(11,11,13,0.04)",
          border: `1px solid ${COLORS.borderSoft}`,
          borderRadius: 8,
          marginBottom: 12,
          fontFamily: FONTS.body,
          fontSize: 12,
          color: COLORS.inkMuted,
        }}
      >
        <Icon name="lock" size={12} stroke={1.7} />
        <span>Archived · paid {e.payoutDate}. Read-only.</span>
        <span style={{ marginLeft: "auto", color: COLORS.ink, fontWeight: 600 }}>
          {e.amount}
        </span>
      </div>

      {/* Source attribution — answers "where did this booking come from?"
          The chip + optional "you brought" pill teach the talent the value
          of each distribution channel over time. */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          flexWrap: "wrap",
          marginBottom: 16,
          fontFamily: FONTS.body,
          fontSize: 11.5,
        }}
      >
        <SourceChip source={e.source} />
        {e.broughtTeam && e.team && e.team.length > 0 && (
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              padding: "3px 8px",
              borderRadius: 999,
              background: COLORS.coralSoft,
              color: COLORS.coralDeep,
              fontWeight: 600,
              fontSize: 11,
            }}
          >
            <Icon name="user" size={10} stroke={1.8} />
            You brought {e.team.join(", ")}
          </span>
        )}
        {!e.team || e.team.length === 0 ? (
          <span
            style={{
              padding: "3px 8px",
              borderRadius: 999,
              background: "rgba(11,11,13,0.05)",
              color: COLORS.inkMuted,
              fontWeight: 500,
              fontSize: 11,
            }}
          >
            Solo
          </span>
        ) : null}
      </div>

      {/* Repeat-client signal — only shows for clients with > 1 booking.
          Sage tone to mark a relationship; meaningful info for a talent
          looking back at career history. */}
      {isRepeat && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "10px 14px",
            background: "rgba(46,125,91,0.08)",
            border: `1px solid rgba(46,125,91,0.18)`,
            borderRadius: 8,
            marginBottom: 16,
            fontFamily: FONTS.body,
            fontSize: 12.5,
          }}
        >
          <Icon name="check" size={12} stroke={1.7} color={COLORS.green} />
          <span style={{ color: COLORS.successDeep, fontWeight: 500 }}>
            Booking #{sameClient.length} with {e.client} · {lifetimeLabel} lifetime
          </span>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {/* Booking facts */}
        <section>
          <SectionLabel>Booking</SectionLabel>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
            <KvRow label="Date worked" value={e.workDate} />
            <KvRow label="Location" value={detail.location} />
            <KvRow label="Call time" value={detail.call} />
            <KvRow label="Agency" value={e.agency} />
            <KvRow label="Fee paid" value={e.amount} />
          </div>
        </section>

        {/* Team — who else was on the booking */}
        <section>
          <SectionLabel>Who was there</SectionLabel>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 0,
              marginTop: 8,
              border: `1px solid ${COLORS.borderSoft}`,
              borderRadius: 10,
              overflow: "hidden",
            }}
          >
            {detail.team.map((p, i) => (
              <div
                key={p.name}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "10px 12px",
                  borderTop: i === 0 ? "none" : `1px solid ${COLORS.borderSoft}`,
                  fontFamily: FONTS.body,
                  fontSize: 12.5,
                }}
              >
                <Avatar
                  size={28}
                  tone="auto"
                  hashSeed={p.name}
                  initials={p.name
                    .split(/\s+/)
                    .map((w) => w.charAt(0))
                    .slice(0, 2)
                    .join("")
                    .toUpperCase()}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: COLORS.ink, fontWeight: 500 }}>{p.name}</div>
                  <div style={{ color: COLORS.inkMuted, fontSize: 11 }}>{p.role}</div>
                </div>
                {p.you && (
                  <span
                    style={{
                      fontSize: 10.5,
                      fontWeight: 600,
                      letterSpacing: 0.4,
                      textTransform: "uppercase",
                      padding: "2px 7px",
                      background: COLORS.coralSoft,
                      color: COLORS.coralDeep,
                      borderRadius: 999,
                    }}
                  >
                    You
                  </span>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* Chat archive — read-only snapshot */}
        <section>
          <SectionLabel>Archived chat</SectionLabel>
          <div
            style={{
              marginTop: 8,
              padding: "12px 14px",
              background: COLORS.surfaceAlt,
              border: `1px solid ${COLORS.borderSoft}`,
              borderRadius: 10,
              display: "flex",
              flexDirection: "column",
              gap: 12,
              fontFamily: FONTS.body,
              fontSize: 12.5,
            }}
          >
            {detail.chat.map((m, i) => (
              <div key={i} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "baseline",
                    gap: 6,
                    color: COLORS.inkMuted,
                    fontSize: 11,
                  }}
                >
                  <span style={{ fontWeight: 600, color: COLORS.ink }}>{m.from}</span>
                  <span style={{ color: COLORS.inkDim }}>· {m.when}</span>
                </div>
                <div style={{ color: COLORS.ink, lineHeight: 1.5 }}>{m.body}</div>
              </div>
            ))}
            <div
              style={{
                marginTop: 4,
                paddingTop: 10,
                borderTop: `1px solid ${COLORS.borderSoft}`,
                fontSize: 11,
                color: COLORS.inkDim,
                textAlign: "center",
              }}
            >
              Thread closed when payout landed. {detail.chat.length} messages archived.
            </div>
          </div>
        </section>

        {/* What was delivered */}
        {detail.delivered && (
          <section>
            <SectionLabel>Delivered</SectionLabel>
            <ul
              style={{
                margin: "8px 0 0",
                paddingLeft: 18,
                fontFamily: FONTS.body,
                fontSize: 12.5,
                color: COLORS.ink,
                lineHeight: 1.7,
              }}
            >
              {detail.delivered.map((d) => (
                <li key={d}>{d}</li>
              ))}
            </ul>
          </section>
        )}

        {/* Client review — when present. Sage soft surface + 5-star rating
            + quoted feedback. Builds the talent's portfolio of validation
            over time. */}

        {/* D4: Contract section. Production: pull signed PDF from
            booking_contracts table. For prototype: scaffold the link. */}
        <section>
          <SectionLabel>Contract</SectionLabel>
          <button
            type="button"
            onClick={() => toast(`Opening signed contract for ${e.client}…`)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              width: "100%",
              padding: "12px 14px",
              marginTop: 8,
              background: "#fff",
              border: `1px solid ${COLORS.borderSoft}`,
              borderRadius: 10,
              cursor: "pointer",
              fontFamily: FONTS.body,
              textAlign: "left",
            }}
          >
            <span
              aria-hidden
              style={{
                width: 28,
                height: 28,
                borderRadius: 6,
                background: COLORS.surfaceAlt,
                color: COLORS.ink,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
                fontFamily: FONTS.display,
                fontSize: 11,
                fontWeight: 600,
              }}
            >
              PDF
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12.5, fontWeight: 500, color: COLORS.ink }}>
                Signed booking agreement
              </div>
              <div style={{ fontSize: 11, color: COLORS.inkMuted, marginTop: 1 }}>
                {e.client} · {e.workDate} · counter-signed by both parties
              </div>
            </div>
            <Icon name="external" size={13} color={COLORS.inkDim} />
          </button>
        </section>

        {detail.review && (
          <section>
            <SectionLabel>Client review</SectionLabel>
            <div
              style={{
                marginTop: 8,
                padding: "12px 14px",
                background: "rgba(46,125,91,0.06)",
                border: `1px solid rgba(46,125,91,0.16)`,
                borderRadius: 10,
                fontFamily: FONTS.body,
                fontSize: 12.5,
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  marginBottom: 6,
                }}
              >
                <span
                  style={{
                    color: COLORS.green,
                    fontSize: 13,
                    letterSpacing: 1,
                  }}
                >
                  {"★".repeat(detail.review.rating)}
                  <span style={{ color: COLORS.inkDim, opacity: 0.6 }}>
                    {"★".repeat(5 - detail.review.rating)}
                  </span>
                </span>
                <span
                  style={{
                    fontSize: 11.5,
                    color: COLORS.inkMuted,
                  }}
                >
                  {detail.review.author}
                </span>
              </div>
              <div
                style={{
                  color: COLORS.ink,
                  lineHeight: 1.6,
                  fontStyle: "italic",
                }}
              >
                "{detail.review.body}"
              </div>
            </div>
          </section>
        )}
      </div>
    </DrawerShell>
  );
}

/**
 * Source chip in the closed-booking drawer header. Tone-coded by kind so
 * the talent learns where each booking came from at a glance:
 *   agency      slate    standard agency-routed
 *   hub         indigo   Tulala Hub or external aggregator
 *   personal    royal    talent's premium personal page (Pro+)
 *   studio      sage     studio / free-book partner
 *   marketplace amber    open marketplace
 */
function SourceChip({ source }: { source: import("./_state").EarningSource }) {
  const labelFor = (s: typeof source) => {
    switch (s.kind) {
      case "agency":
        return "Agency-routed";
      case "hub":
        return `via ${s.name}`;
      case "personal":
        return "Direct · personal page";
      case "studio":
        return `via ${s.name}`;
      case "marketplace":
        return `via ${s.name}`;
      case "manual":
        return "Off-platform · added by you";
    }
  };
  const palette: Record<typeof source.kind, { bg: string; fg: string }> = {
    agency: { bg: COLORS.amberSoft, fg: COLORS.amberDeep },
    hub: { bg: COLORS.indigoSoft, fg: COLORS.indigoDeep },
    personal: { bg: COLORS.royalSoft, fg: COLORS.royalDeep },
    studio: { bg: COLORS.successSoft, fg: COLORS.successDeep },
    marketplace: { bg: COLORS.amberSoft, fg: COLORS.amberDeep },
    manual: { bg: COLORS.coralSoft, fg: COLORS.coralDeep },
  };
  const c = palette[source.kind];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        padding: "3px 8px",
        borderRadius: 999,
        background: c.bg,
        color: c.fg,
        fontWeight: 600,
        fontSize: 11,
        letterSpacing: -0.05,
      }}
    >
      {labelFor(source)}
    </span>
  );
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        fontFamily: FONTS.body,
        fontSize: 10.5,
        fontWeight: 600,
        letterSpacing: 0.6,
        textTransform: "uppercase",
        color: COLORS.inkMuted,
      }}
    >
      {children}
    </div>
  );
}

// Mock chat + team per closed booking. Three distinct shapes to show the
// drawer renders differently based on what actually happened on each job.
const MOCK_CLOSED_DETAIL: Record<
  string,
  {
    brief: string;
    location: string;
    call: string;
    team: { name: string; role: string; you?: boolean }[];
    chat: { from: string; when: string; body: string }[];
    delivered?: string[];
    review?: { author: string; rating: number; body: string };
  }
> = {
  e1: {
    brief: "Spring campaign · 1 day",
    location: "Madrid · ESTUDIO ROCA",
    call: "08:30 — 18:00",
    team: [
      { name: "Marta Reyes", role: "Talent · lead", you: true },
      { name: "Tomás Navarro", role: "Talent" },
      { name: "Inés López", role: "Producer · Zara" },
      { name: "Lia Roca", role: "Stylist" },
      { name: "Studio Roca", role: "Photographer" },
      { name: "Ana Vega", role: "Coordinator · Acme Models" },
    ],
    chat: [
      {
        from: "Ana Vega",
        when: "Mar 22 · 10:14",
        body: "Zara spring campaign confirmed for Mar 28. Marta + Tomás on lead, Studio Roca shooting.",
      },
      {
        from: "Marta",
        when: "Mar 22 · 10:31",
        body: "Confirmed. Will bring nude underwear + neutrals as briefed.",
      },
      {
        from: "Inés López",
        when: "Mar 27 · 17:02",
        body: "Reminder — call time 08:30 sharp. Coffee from 08:15. Forecast says light rain so we're going indoors only.",
      },
      {
        from: "Marta",
        when: "Mar 28 · 19:48",
        body: "Wrapped. Great energy on set, thanks all 🙏",
      },
    ],
    delivered: ["12 looks · Zara spring campaign", "Hero image (selected by client)"],
    review: {
      author: "Inés López · Producer · Zara",
      rating: 5,
      body: "Marta is a complete pro — on time, prepared, and sets the tone for the whole crew. We'll book her again for the autumn campaign.",
    },
  },
  e2: {
    brief: "Editorial · spring/summer campaign",
    location: "London · Studio 2C",
    call: "07:00 — 16:30",
    team: [
      { name: "Marta Reyes", role: "Talent · solo", you: true },
      { name: "James Hart", role: "Producer · Burberry" },
      { name: "Olive Carter", role: "Stylist" },
      { name: "Praline London", role: "Coordinator" },
    ],
    chat: [
      {
        from: "Praline London",
        when: "Mar 5 · 09:20",
        body: "Burberry editorial confirmed for Mar 10. Solo booking, you're carrying the campaign.",
      },
      {
        from: "Marta",
        when: "Mar 5 · 09:42",
        body: "Confirmed. Travel to London Mar 9, Studio 2C call at 07:00.",
      },
      {
        from: "James Hart",
        when: "Mar 10 · 18:11",
        body: "Brilliant work today, Marta. We'll send selects within two weeks.",
      },
    ],
    delivered: ["8 final selects · Burberry SS editorial", "Behind-the-scenes carousel"],
  },
  e3: {
    brief: "Editorial spread · 2 day shoot",
    location: "Milan · Studio 5",
    call: "07:00 — 19:00",
    team: [
      { name: "Marta Reyes", role: "Talent", you: true },
      { name: "Lina Park", role: "Talent" },
      { name: "Paolo Bianchi", role: "Photographer · Vogue Italia" },
      { name: "Ana Vega", role: "Coordinator · Acme Models" },
    ],
    chat: [
      {
        from: "Ana Vega",
        when: "Feb 24 · 14:30",
        body: "Vogue Italia editorial confirmed Mar 1–2 in Milan. You + Lina Park.",
      },
      {
        from: "Marta",
        when: "Feb 24 · 14:51",
        body: "Confirmed. Booking flights for Feb 29.",
      },
      {
        from: "Paolo Bianchi",
        when: "Mar 2 · 21:15",
        body: "Grazie a tutte. Pages will run in the May issue.",
      },
    ],
    delivered: ["8-page editorial spread (May issue)", "Cover try"],
    review: {
      author: "Paolo Bianchi · Photographer",
      rating: 5,
      body: "Una pleasure assoluta. Marta brought presence and patience to a difficult two-day shoot. Highly recommended.",
    },
  },
  // Solo gig sourced via Tulala Hub. Demonstrates a non-agency channel
  // delivering paid work — the kind of booking that would be invisible
  // before the Hub became a distribution surface.
  e6: {
    brief: "Brand campaign · 1 day",
    location: "Berlin · Studio Mitte",
    call: "09:00 — 17:00",
    team: [
      { name: "Marta Reyes", role: "Talent · solo", you: true },
      { name: "Hanna Berg", role: "Producer · Bumble" },
      { name: "Studio Mitte", role: "Photographer" },
    ],
    chat: [
      {
        from: "Tulala Hub",
        when: "Mar 30 · 11:24",
        body: "Bumble forwarded an inquiry for you via the Tulala Hub. Solo, 1 day in Berlin Apr 5.",
      },
      {
        from: "Marta",
        when: "Mar 30 · 11:48",
        body: "Confirmed. I'll travel up Apr 4.",
      },
      {
        from: "Hanna Berg",
        when: "Apr 5 · 17:32",
        body: "Wrap. Selects in 10 days, payout via Tulala Hub.",
      },
    ],
    delivered: ["6 final selects · spring brand campaign"],
  },

  // Personal-page gig where Marta brought her friend Carla as the second
  // talent. Marta acted as de-facto coordinator. Demonstrates the
  // talent-as-coordinator path that exists when distribution comes
  // through her own premium page.
  e7: {
    brief: "Capsule editorial · 2 talent · 1 day",
    location: "Madrid · ESTUDIO ROCA",
    call: "08:00 — 18:00",
    team: [
      { name: "Marta Reyes", role: "Talent · brought the team", you: true },
      { name: "Carla Vega", role: "Talent · brought by Marta" },
      { name: "Loewe team", role: "Producer · Loewe" },
      { name: "Studio Roca", role: "Photographer" },
    ],
    chat: [
      {
        from: "Loewe",
        when: "Apr 1 · 09:12",
        body: "Hi Marta — found you via your page. We need two talent for a capsule day on Apr 12. Can you bring a second?",
      },
      {
        from: "Marta",
        when: "Apr 1 · 09:34",
        body: "Yes — Carla Vega works well with me. Sending her details now. Day rate €1,800/talent · €3,600 total.",
      },
      {
        from: "Loewe",
        when: "Apr 1 · 10:02",
        body: "Approved. See you both Apr 12.",
      },
      {
        from: "Marta",
        when: "Apr 12 · 18:47",
        body: "Wrapped. Carla and I had a great day. Gracias 🙏",
      },
    ],
    delivered: [
      "8-look capsule editorial · 2 talent",
      "Hero campaign image · selected by client",
    ],
  },

  default: {
    brief: "Closed booking",
    location: "—",
    call: "—",
    team: [{ name: "Marta Reyes", role: "Talent", you: true }],
    chat: [],
  },
};

// ─── Add event (manual booking / block) ─────────────────────────────
//
// Talents have lives outside the platform — full-time jobs, school,
// vacation, friend's photo shoots, repeat clients they've worked with
// for years. Tulala becomes their booking manager only if they can
// log ALL of it here — not just Tulala-routed gigs.
//
// Two flows, one entry point:
//   work    → off-platform booking. Earnings row + calendar event +
//             coral "Off-platform" source chip when surfaced later.
//             Quick form (3 fields, 5 seconds) by default; advanced
//             toggle reveals location / time / contact / brief / notes.
//   block   → calendar block for non-work. Reason taxonomy: travel /
//             personal / other job / family / other. Doesn't count as
//             earnings, doesn't fight booking pitches the way "paused"
//             availability does — it's a single window.
//
// In production this also feeds tax exports (talent self-reports
// off-platform income) and powers the "convert to Tulala-tracked"
// suggestion when a manual client name matches a verified Tulala
// client identity.

type AddEventMode = "pick" | "work" | "block";

// ─── A3: Hub-detail mini-drawer ─────────────────────────────────────
//
// Opens when a talent clicks "+ Add" on an unjoined channel in Reach.
// Shows the channel's terms, fees, expected response time BEFORE the
// talent commits. Avoids the "I joined this and now I'm spammed" problem.

export function TalentHubDetailDrawer() {
  const { state, closeDrawer, toast } = useProto();
  const open = state.drawer.drawerId === "talent-hub-detail";
  const channelId = (state.drawer.payload?.channelId as string) ?? "";
  const channel =
    TALENT_CHANNELS.find((c) => c.id === channelId) ??
    AVAILABLE_CHANNELS.find((c) => c.id === channelId) ??
    null;

  if (!channel) return null;

  const feePct = channel.feeRate ? Math.round(channel.feeRate * 100) : 0;
  const responseTime =
    channel.kind === "studio"
      ? "1–3 weeks (slow but high-quality leads)"
      : channel.verified
        ? "Within 24h for most inquiries"
        : "Variable — newer platform, less data";

  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title={channel.name}
      description={`${channel.kind === "studio" ? "Studio · free book" : channel.verified ? "Verified external hub" : "External hub · not yet Tulala-verified"} · joining is reversible`}
      width={520}
      footer={
        <>
          <SecondaryButton onClick={closeDrawer}>Cancel</SecondaryButton>
          <PrimaryButton
            onClick={() => {
              toast(`Joined ${channel.name} · they'll forward inquiries to you`);
              closeDrawer();
            }}
          >
            Join {channel.name}
          </PrimaryButton>
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 18, fontFamily: FONTS.body }}>
        {channel.description && (
          <div
            style={{
              padding: "12px 14px",
              background: COLORS.surfaceAlt,
              borderRadius: 10,
              fontSize: 13,
              color: COLORS.ink,
              lineHeight: 1.55,
            }}
          >
            {channel.description}
          </div>
        )}

        <section>
          <SubsectionLabel>The deal</SubsectionLabel>
          <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
            <KvRow label="Fee rate" value={feePct === 0 ? "0% · no platform take" : `${feePct}% on bookings via ${channel.name}`} />
            <KvRow label="Response time" value={responseTime} />
            <KvRow
              label="Verified"
              value={
                channel.verified ? "Yes — Tulala-vetted" : "No — newer / unverified"
              }
            />
            <KvRow label="Reversible?" value="Yes — toggle off anytime in Reach" />
          </div>
        </section>

        <section>
          <SubsectionLabel>What happens when you join</SubsectionLabel>
          <ul
            style={{
              margin: "8px 0 0",
              paddingLeft: 18,
              fontSize: 12.5,
              color: COLORS.ink,
              lineHeight: 1.7,
            }}
          >
            <li>{channel.name} can list your profile + forward inquiries</li>
            <li>Inquiries land in your Tulala inbox alongside agency-routed ones</li>
            <li>Your contact-policy filters still apply — Basic-tier clients are blocked if you've blocked them</li>
            {feePct > 0 && (
              <li>
                When a booking comes through {channel.name}, they take {feePct}% of the fee at payout
              </li>
            )}
            <li>You can pause or leave any time from Reach</li>
          </ul>
        </section>

        {!channel.verified && (
          <div
            style={{
              padding: "10px 12px",
              background: COLORS.coralSoft,
              border: `1px solid rgba(194,106,69,0.18)`,
              borderRadius: 8,
              fontSize: 11.5,
              color: COLORS.coralDeep,
              lineHeight: 1.5,
            }}
          >
            <strong style={{ fontWeight: 600 }}>Heads up:</strong>{" "}
            {channel.name} isn't yet Tulala-verified. Inquiries may include
            unvetted clients. You can leave with one click if quality drops.
          </div>
        )}
      </div>
    </DrawerShell>
  );
}

export function TalentAddEventDrawer() {
  const { state, closeDrawer, toast } = useProto();
  const open = state.drawer.drawerId === "talent-add-event";
  const initialMode = (state.drawer.payload?.mode as AddEventMode | undefined) ?? "pick";
  const [mode, setMode] = useState<AddEventMode>(initialMode);

  // Reset to picker when drawer reopens with no mode (open from a generic CTA)
  // — but if reopened with a specific mode (e.g., from a "Block dates" link),
  // honor that.
  // Note: state.drawer.payload changes don't auto-reset useState; this only
  // matters on first mount.

  return (
    <DrawerShell
      open={open}
      onClose={() => {
        setMode("pick");
        closeDrawer();
      }}
      title={
        mode === "pick"
          ? "Add to your calendar"
          : mode === "work"
            ? "Log work"
            : "Block time"
      }
      description={
        mode === "pick"
          ? "Track your booking life — even when the gig didn't come through Tulala."
          : mode === "work"
            ? "Off-platform booking? Log it here so it counts toward your earnings + history."
            : "Block your calendar so agencies don't pitch you when you're unavailable."
      }
      width={540}
      footer={
        mode === "pick" ? (
          <SecondaryButton onClick={closeDrawer}>Cancel</SecondaryButton>
        ) : undefined // forms own their own footers
      }
    >
      {mode === "pick" && (
        <ModePicker
          onPick={(m) => setMode(m)}
        />
      )}
      {mode === "work" && (
        <LogWorkForm
          onCancel={() => setMode("pick")}
          onSave={(data) => {
            const summary =
              data.client && data.amount
                ? `Logged ${data.client} · ${data.amount}`
                : "Booking logged";
            toast(`${summary} · added to your calendar + earnings`);
            closeDrawer();
          }}
        />
      )}
      {mode === "block" && (
        <BlockTimeForm
          onCancel={() => setMode("pick")}
          onSave={(data) => {
            toast(
              `${data.reason || "Time"} blocked · ${data.from || "—"}${data.to ? ` → ${data.to}` : ""}`,
            );
            closeDrawer();
          }}
        />
      )}
    </DrawerShell>
  );
}

/** Mode picker — two big choices, clear contracts. */
function ModePicker({ onPick }: { onPick: (m: "work" | "block") => void }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <ModePickerCard
        kind="work"
        title="Log work"
        body="A booking you did (or will do) outside Tulala. Adds to your earnings + calendar."
        meta="Quick add or full details"
        toneFg={COLORS.green}
        toneBg={COLORS.successSoft}
        icon="credit"
        onPick={() => onPick("work")}
      />
      <ModePickerCard
        kind="block"
        title="Block time"
        body="Vacation, day job, school, family — anything that means you're not available. Won't count as earnings."
        meta="Reason + date range"
        toneFg={COLORS.amber}
        toneBg={COLORS.amberSoft}
        icon="lock"
        onPick={() => onPick("block")}
      />
    </div>
  );
}

function ModePickerCard({
  title,
  body,
  meta,
  toneFg,
  toneBg,
  icon,
  onPick,
}: {
  kind: "work" | "block";
  title: string;
  body: string;
  meta: string;
  toneFg: string;
  toneBg: string;
  icon: "credit" | "lock";
  onPick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onPick}
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 12,
        width: "100%",
        padding: "16px 18px",
        background: "#fff",
        border: `1px solid ${COLORS.borderSoft}`,
        borderRadius: 12,
        cursor: "pointer",
        textAlign: "left",
        fontFamily: FONTS.body,
        transition: `border-color ${TRANSITION.micro}, transform ${TRANSITION.micro}`,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = COLORS.border;
        e.currentTarget.style.transform = "translateY(-1px)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = COLORS.borderSoft;
        e.currentTarget.style.transform = "translateY(0)";
      }}
    >
      <span
        aria-hidden
        style={{
          width: 32,
          height: 32,
          borderRadius: 8,
          background: toneBg,
          color: toneFg,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <Icon name={icon} size={14} stroke={1.7} />
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 14,
            fontWeight: 600,
            color: COLORS.ink,
            letterSpacing: -0.05,
          }}
        >
          {title}
        </div>
        <div
          style={{
            fontSize: 12.5,
            color: COLORS.inkMuted,
            marginTop: 2,
            lineHeight: 1.5,
          }}
        >
          {body}
        </div>
        <div
          style={{
            fontSize: 11,
            color: COLORS.inkDim,
            marginTop: 6,
            fontWeight: 500,
            letterSpacing: 0.3,
            textTransform: "uppercase",
          }}
        >
          {meta}
        </div>
      </div>
      <Icon name="chevron-right" size={14} color={COLORS.inkDim} />
    </button>
  );
}

/** Log work form — Quick by default, Advanced on toggle. */
function LogWorkForm({
  onCancel,
  onSave,
}: {
  onCancel: () => void;
  onSave: (data: {
    client: string;
    date: string;
    amount: string;
    advanced: boolean;
  }) => void;
}) {
  const [client, setClient] = useState("");
  const [date, setDate] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("€");
  const [advanced, setAdvanced] = useState(false);
  const [brief, setBrief] = useState("");
  const [location, setLocation] = useState("");
  const [callTime, setCallTime] = useState("");
  const [contact, setContact] = useState("");
  const [notes, setNotes] = useState("");
  const [delivered, setDelivered] = useState("");
  // A1: Team-mates — comma-separated names of others on the booking.
  // Free text in v1; production should autocomplete from talent network.
  const [teamMates, setTeamMates] = useState("");
  const [iBroughtTeam, setIBroughtTeam] = useState(false);
  // A2: Payment method picker.
  const [paymentMethod, setPaymentMethod] = useState<"transfer" | "card" | "cash" | "in-kind" | "mixed" | "">("");
  const [paymentNote, setPaymentNote] = useState("");

  const canSave = client.trim().length > 0 && date.trim().length > 0;

  return (
    <>
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        {/* Quick fields — always visible. The MVP for one-tap logging. */}
        <section>
          <SubsectionLabel>The basics</SubsectionLabel>
          <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 12 }}>
            <FieldRow label="Client" hint="Who paid you. Free text — they don't have to be on Tulala.">
              <TextInput
                value={client}
                onChange={(e) => setClient(e.target.value)}
                placeholder="e.g. Friend's brand · Studio Roca · Old colleague"
              />
            </FieldRow>
            <FieldRow label="Date" hint="When you worked.">
              <TextInput
                value={date}
                onChange={(e) => setDate(e.target.value)}
                placeholder="May 12, 2026  or  May 12–13"
              />
            </FieldRow>
            <FieldRow label="Amount" hint="What you earned. Optional if you haven't been paid yet.">
              <div style={{ display: "flex", gap: 8 }}>
                <select
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  style={{
                    background: "#fff",
                    border: `1px solid ${COLORS.border}`,
                    borderRadius: 8,
                    padding: "0 10px",
                    fontFamily: FONTS.body,
                    fontSize: 13,
                    color: COLORS.ink,
                    cursor: "pointer",
                    minWidth: 64,
                  }}
                >
                  <option>€</option>
                  <option>£</option>
                  <option>$</option>
                  <option>¥</option>
                  <option>—</option>
                </select>
                <div style={{ flex: 1 }}>
                  <TextInput
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="1,800"
                  />
                </div>
              </div>
            </FieldRow>
          </div>
        </section>

        {/* Advanced toggle — on by talent's choice */}
        <button
          type="button"
          onClick={() => setAdvanced((o) => !o)}
          aria-expanded={advanced}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            background: "transparent",
            border: "none",
            padding: 0,
            color: COLORS.ink,
            fontFamily: FONTS.body,
            fontSize: 12.5,
            fontWeight: 500,
            cursor: "pointer",
            alignSelf: "flex-start",
          }}
        >
          <Icon
            name="chevron-down"
            size={11}
            stroke={2}
            color={COLORS.ink}
          />
          <span
            style={{
              transform: advanced ? "none" : "none",
            }}
          >
            {advanced ? "Hide details" : "Add details (location, time, contact, deliverables)"}
          </span>
        </button>

        {advanced && (
          <section>
            <SubsectionLabel>Details</SubsectionLabel>
            <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 12 }}>
              <FieldRow label="Brief" hint="What was the job?">
                <TextInput
                  value={brief}
                  onChange={(e) => setBrief(e.target.value)}
                  placeholder="e.g. Lookbook · spring capsule · 1 day"
                />
              </FieldRow>
              <FieldRow label="Location">
                <TextInput
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="City · studio or address"
                />
              </FieldRow>
              <FieldRow label="Call time">
                <TextInput
                  value={callTime}
                  onChange={(e) => setCallTime(e.target.value)}
                  placeholder="08:30 — 18:00"
                />
              </FieldRow>
              <FieldRow label="Contact" optional hint="Producer / photographer / who to message after.">
                <TextInput
                  value={contact}
                  onChange={(e) => setContact(e.target.value)}
                  placeholder="Name · email or phone"
                />
              </FieldRow>
              <FieldRow label="Delivered" optional hint="Comma-separated list of deliverables.">
                <TextInput
                  value={delivered}
                  onChange={(e) => setDelivered(e.target.value)}
                  placeholder="8 looks, hero image, BTS carousel"
                />
              </FieldRow>
              <FieldRow
                label="Other talent on the booking"
                optional
                hint="Names — comma-separated. Useful when you brought a friend or worked as a team."
              >
                <TextInput
                  value={teamMates}
                  onChange={(e) => setTeamMates(e.target.value)}
                  placeholder="Carla Vega, Tomás Navarro"
                />
              </FieldRow>
              {teamMates.trim().length > 0 && (
                <FieldRow
                  label=""
                  optional
                  hint=""
                >
                  <button
                    type="button"
                    onClick={() => setIBroughtTeam((b) => !b)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      width: "100%",
                      padding: "10px 12px",
                      background: iBroughtTeam ? COLORS.coralSoft : "#fff",
                      border: `1px solid ${iBroughtTeam ? "rgba(194,106,69,0.30)" : COLORS.border}`,
                      borderRadius: 8,
                      cursor: "pointer",
                      fontFamily: FONTS.body,
                      textAlign: "left",
                    }}
                  >
                    <span
                      style={{
                        width: 16,
                        height: 16,
                        borderRadius: 4,
                        background: iBroughtTeam ? COLORS.coral : "transparent",
                        border: `1.5px solid ${iBroughtTeam ? COLORS.coral : COLORS.border}`,
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                      }}
                    >
                      {iBroughtTeam && <Icon name="check" size={10} stroke={2.5} color="#fff" />}
                    </span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 12.5, fontWeight: 500, color: COLORS.ink }}>
                        I brought them
                      </div>
                      <div style={{ fontSize: 11, color: COLORS.inkMuted, marginTop: 1 }}>
                        Marks you as the de-facto coordinator. Surfaces a "You brought {teamMates.split(",")[0]?.trim()}" tag in your booking history.
                      </div>
                    </div>
                  </button>
                </FieldRow>
              )}
              <FieldRow
                label="Payment method"
                optional
                hint="How you got paid. Tax-relevant — especially in-kind / gifts."
              >
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {([
                    { id: "transfer", label: "Transfer" },
                    { id: "cash", label: "Cash · efectivo" },
                    { id: "card", label: "Card" },
                    { id: "in-kind", label: "In-kind · gift" },
                    { id: "mixed", label: "Mixed" },
                  ] as const).map((m) => {
                    const active = paymentMethod === m.id;
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => setPaymentMethod(active ? "" : m.id)}
                        style={{
                          padding: "6px 11px",
                          borderRadius: 999,
                          background: active ? COLORS.fill : "#fff",
                          border: `1px solid ${active ? COLORS.accent : COLORS.borderSoft}`,
                          cursor: "pointer",
                          fontFamily: FONTS.body,
                          fontSize: 12,
                          fontWeight: 500,
                          color: active ? "#fff" : COLORS.ink,
                        }}
                      >
                        {m.label}
                      </button>
                    );
                  })}
                </div>
              </FieldRow>
              {(paymentMethod === "in-kind" || paymentMethod === "mixed") && (
                <FieldRow
                  label="Payment note"
                  optional
                  hint="Describe the in-kind value or the mixed-method split."
                >
                  <TextInput
                    value={paymentNote}
                    onChange={(e) => setPaymentNote(e.target.value)}
                    placeholder={
                      paymentMethod === "in-kind"
                        ? "e.g. Bvlgari watch · est €1,200"
                        : "e.g. 60% transfer + 40% product"
                    }
                  />
                </FieldRow>
              )}
              <FieldRow label="Notes" optional>
                <TextArea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Anything you want to remember about this job."
                  rows={3}
                />
              </FieldRow>
            </div>
          </section>
        )}

        {/* Off-platform note — sets expectations on what this means. */}
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 8,
            padding: "10px 12px",
            background: COLORS.coralSoft,
            border: `1px solid rgba(194,106,69,0.18)`,
            borderRadius: 8,
            fontFamily: FONTS.body,
            fontSize: 11.5,
            color: COLORS.coralDeep,
            lineHeight: 1.55,
          }}
        >
          <Icon name="info" size={11} stroke={1.7} />
          <span>
            <strong>Off-platform booking</strong> — visible only to you. Adds to your earnings,
            calendar and history. Not shared with agencies unless you choose to.
          </span>
        </div>
      </div>

      <div
        style={{
          position: "sticky",
          bottom: 0,
          marginTop: 24,
          marginLeft: -24,
          marginRight: -24,
          padding: "12px 24px",
          background: "#fff",
          borderTop: `1px solid ${COLORS.borderSoft}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
        }}
      >
        <SecondaryButton onClick={onCancel}>Back</SecondaryButton>
        <button
          type="button"
          disabled={!canSave}
          onClick={() =>
            onSave({
              client: client.trim(),
              date: date.trim(),
              amount: amount ? `${currency}${amount.trim()}` : "",
              advanced,
            })
          }
          style={{
            background: canSave ? COLORS.fill : "rgba(11,11,13,0.20)",
            color: "#fff",
            border: "none",
            borderRadius: 8,
            padding: "9px 16px",
            fontFamily: FONTS.body,
            fontSize: 13,
            fontWeight: 500,
            cursor: canSave ? "pointer" : "not-allowed",
          }}
        >
          Log booking
        </button>
      </div>
    </>
  );
}

/** Block time form — date range + reason taxonomy. */
function BlockTimeForm({
  onCancel,
  onSave,
}: {
  onCancel: () => void;
  onSave: (data: { from: string; to: string; reason: string; note: string }) => void;
}) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [reason, setReason] = useState<string>("");
  const [note, setNote] = useState("");

  const reasonOptions: { id: string; label: string; hint: string }[] = [
    { id: "travel", label: "Travel", hint: "Flight, holiday, between cities" },
    { id: "personal", label: "Personal", hint: "Time off, recovery, life" },
    { id: "other-job", label: "Other job", hint: "Day job, school, recurring shift" },
    { id: "family", label: "Family", hint: "Wedding, illness, kid's event" },
    { id: "audition", label: "Audition / casting", hint: "Off-platform casting prep" },
    { id: "other", label: "Other", hint: "" },
  ];

  const canSave = from.trim().length > 0 && reason.trim().length > 0;

  return (
    <>
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <section>
          <SubsectionLabel>When</SubsectionLabel>
          <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 12 }}>
            <FieldRow label="From">
              <TextInput
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                placeholder="May 22, 2026"
              />
            </FieldRow>
            <FieldRow label="To" optional hint="Leave blank for a single day.">
              <TextInput
                value={to}
                onChange={(e) => setTo(e.target.value)}
                placeholder="May 26, 2026"
              />
            </FieldRow>
          </div>
        </section>

        <section>
          <SubsectionLabel>Reason</SubsectionLabel>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 6,
              marginTop: 10,
            }}
          >
            {reasonOptions.map((r) => {
              const active = reason === r.id;
              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setReason(r.id)}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "6px 11px",
                    borderRadius: 999,
                    background: active ? COLORS.fill : "#fff",
                    border: `1px solid ${active ? COLORS.accent : COLORS.borderSoft}`,
                    cursor: "pointer",
                    fontFamily: FONTS.body,
                    fontSize: 12.5,
                    fontWeight: 500,
                    color: active ? "#fff" : COLORS.ink,
                  }}
                >
                  {r.label}
                </button>
              );
            })}
          </div>
          {reason && (
            <div
              style={{
                marginTop: 8,
                fontSize: 11.5,
                color: COLORS.inkMuted,
                fontFamily: FONTS.body,
              }}
            >
              {reasonOptions.find((r) => r.id === reason)?.hint}
            </div>
          )}
        </section>

        <section>
          <SubsectionLabel>Note for your agencies</SubsectionLabel>
          <div
            style={{
              fontSize: 11.5,
              color: COLORS.inkMuted,
              marginTop: 4,
              marginBottom: 10,
            }}
          >
            Optional. They see this when they try to pitch you on a blocked date.
          </div>
          <TextInput
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. Annual family trip · back full availability May 27"
          />
        </section>
      </div>

      <div
        style={{
          position: "sticky",
          bottom: 0,
          marginTop: 24,
          marginLeft: -24,
          marginRight: -24,
          padding: "12px 24px",
          background: "#fff",
          borderTop: `1px solid ${COLORS.borderSoft}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
        }}
      >
        <SecondaryButton onClick={onCancel}>Back</SecondaryButton>
        <button
          type="button"
          disabled={!canSave}
          onClick={() => onSave({ from, to, reason, note })}
          style={{
            background: canSave ? COLORS.fill : "rgba(11,11,13,0.20)",
            color: "#fff",
            border: "none",
            borderRadius: 8,
            padding: "9px 16px",
            fontFamily: FONTS.body,
            fontSize: 13,
            fontWeight: 500,
            cursor: canSave ? "pointer" : "not-allowed",
          }}
        >
          Block time
        </button>
      </div>
    </>
  );
}


function ToggleRow({ label, hint, defaultOn }: { label: string; hint?: string; defaultOn?: boolean }) {
  const [on, setOn] = useState(defaultOn ?? false);
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 12,
        padding: "12px 14px",
        background: "#fff",
        border: `1px solid ${COLORS.borderSoft}`,
        borderRadius: 10,
      }}
    >
      <div style={{ flex: 1 }}>
        <div style={{ fontFamily: FONTS.body, fontSize: 13, fontWeight: 500, color: COLORS.ink }}>
          {label}
        </div>
        {hint && (
          <div style={{ fontFamily: FONTS.body, fontSize: 12, color: COLORS.inkMuted, marginTop: 2 }}>
            {hint}
          </div>
        )}
      </div>
      <Toggle on={on} onChange={setOn} />
    </div>
  );
}

// ─── Section editor (used for sub-sections of profile) ───────────

export function TalentProfileSectionDrawer() {
  const { state, closeDrawer } = useProto();
  const open = state.drawer.drawerId === "talent-profile-section";
  const label = (state.drawer.payload?.label as string) ?? "Section";
  const onSave = useSaveAndClose(`${label} saved`);

  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title={`Edit · ${label}`}
      description="Update this section. Changes propagate to all your rosters automatically."
      width={520}
      footer={<StandardFooter onSave={onSave} />}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <FieldRow label="Notes" hint="Field-specific UI lands in production. Prototype shows a textarea.">
          <TextArea rows={6} defaultValue="Edit this section's content here." />
        </FieldRow>
      </div>
    </DrawerShell>
  );
}

// ─── Availability ────────────────────────────────────────────────

export function TalentAvailabilityDrawer() {
  const { state, closeDrawer } = useProto();
  const open = state.drawer.drawerId === "talent-availability";
  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title="Availability"
      description="Your blocks are visible to your agencies — they won't pitch you when you're unavailable."
      width={520}
      footer={<StandardFooter onSave={() => closeDrawer()} saveLabel="Done" />}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {AVAILABILITY_BLOCKS.map((a) => (
          <div
            key={a.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "12px 14px",
              background: "#fff",
              border: `1px solid ${COLORS.borderSoft}`,
              borderRadius: 10,
              fontFamily: FONTS.body,
            }}
          >
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: a.type === "travel" ? COLORS.amber : COLORS.inkMuted,
              }}
            />
            <span style={{ flex: 1, fontSize: 13.5, color: COLORS.ink }}>
              {a.startDate} – {a.endDate}
            </span>
            <span style={{ fontSize: 11.5, color: COLORS.inkMuted }}>{a.reason}</span>
          </div>
        ))}
      </div>
    </DrawerShell>
  );
}

// ─── Block dates ────────────────────────────────────────────────

/**
 * Availability drawer — formerly "Block dates", expanded to be the talent's
 * single availability surface. Three layers, in order of decision frequency:
 *
 *   1. Where are you?       → Current location. Changes weekly for traveling
 *                              talent. Drives "available to work in {city}"
 *                              hero copy + powers location-aware pitch routing.
 *   2. Taking work?         → Master availability + travel toggle. Daily/weekly.
 *   3. Block specific dates → Single-shot date-range blocks. Monthly.
 *
 * The previous "Block dates" surface only handled #3. Talents in real life
 * spend more time toggling #1 (where they ARE) and #2 (whether they're up
 * for travel) than blocking specific date ranges.
 */
export function TalentBlockDatesDrawer() {
  const { state, closeDrawer, openDrawer, toast } = useProto();
  const open = state.drawer.drawerId === "talent-block-dates";
  const p = MY_TALENT_PROFILE;

  // Local form state. In production this would persist via a mutation;
  // for the prototype it just toasts on save and closes.
  const [location, setLocation] = useState(p.currentLocation);
  const [availableForWork, setAvailableForWork] = useState(p.availableForWork);
  const [availableToTravel, setAvailableToTravel] = useState(p.availableToTravel);

  const handleSave = () => {
    // In production: persist the three fields + any blocked-date range,
    // then notify representing agencies. Toast labels what changed so
    // the user can verify the right thing was saved.
    const parts: string[] = [];
    if (location !== p.currentLocation) parts.push(`location → ${location.split("·")[0]?.trim()}`);
    if (availableForWork !== p.availableForWork)
      parts.push(availableForWork ? "available" : "paused");
    if (availableToTravel !== p.availableToTravel)
      parts.push(availableToTravel ? "open to travel" : "local-only");
    toast(
      parts.length > 0
        ? `Updated · ${parts.join(", ")} · agencies notified`
        : "No changes",
    );
    closeDrawer();
  };

  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title="Availability"
      description="Where you are, what you're up for, and dates you can't work. Visible to your agencies."
      width={540}
      footer={
        <>
          <SecondaryButton onClick={closeDrawer}>Cancel</SecondaryButton>
          <PrimaryButton onClick={handleSave}>Update</PrimaryButton>
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
        {/* ─── 1. Where are you? — C7 location autocomplete suggestions ── */}
        <section>
          <SubsectionLabel>Where are you?</SubsectionLabel>
          <div style={{ marginTop: 10 }}>
            <FieldRow
              label="Current location"
              hint="Synced with your profile · helps agencies pitch you the right local jobs first."
            >
              <TextInput
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="City · Country"
              />
            </FieldRow>
            {/* C7: Quick-pick chips for fashion-cities. Production should
                replace with Google Places autocomplete. */}
            <div
              style={{
                display: "flex",
                gap: 6,
                flexWrap: "wrap",
                marginTop: 8,
              }}
            >
              <span
                style={{
                  fontSize: 10.5,
                  color: COLORS.inkDim,
                  fontFamily: FONTS.body,
                  fontWeight: 500,
                  letterSpacing: 0.4,
                  textTransform: "uppercase",
                  marginRight: 4,
                  alignSelf: "center",
                }}
              >
                Quick pick:
              </span>
              {[
                "Madrid · Spain",
                "Paris · France",
                "Milan · Italy",
                "London · UK",
                "New York · USA",
                "Playa del Carmen · Mexico",
              ].map((city) => (
                <button
                  key={city}
                  type="button"
                  onClick={() => setLocation(city)}
                  style={{
                    padding: "3px 9px",
                    background: location === city ? COLORS.fill : "#fff",
                    border: `1px solid ${location === city ? COLORS.accent : COLORS.borderSoft}`,
                    borderRadius: 999,
                    cursor: "pointer",
                    fontFamily: FONTS.body,
                    fontSize: 11,
                    color: location === city ? "#fff" : COLORS.ink,
                  }}
                >
                  {city.split(" ·")[0]}
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* ─── 2. Taking work? — C6 travel preferences richer ─────────── */}
        <section>
          <SubsectionLabel>Taking work</SubsectionLabel>
          <div
            style={{
              marginTop: 10,
              border: `1px solid ${COLORS.borderSoft}`,
              borderRadius: 10,
              overflow: "hidden",
            }}
          >
            <AvailabilityToggleRow
              label="Available for new work"
              hint="When off, you're hidden from new pitches. Existing bookings aren't affected."
              on={availableForWork}
              onChange={setAvailableForWork}
            />
            <AvailabilityToggleRow
              label="Open to travel"
              hint={
                availableForWork
                  ? "When off, you'll only see local jobs in your current location."
                  : "Pause availability before changing travel preferences."
              }
              on={availableToTravel && availableForWork}
              onChange={setAvailableToTravel}
              disabled={!availableForWork}
            />
          </div>
          {/* C6: Travel preferences richer — only when travel is on */}
          {availableToTravel && availableForWork && (
            <div
              style={{
                marginTop: 12,
                padding: "12px 14px",
                background: COLORS.surfaceAlt,
                border: `1px solid ${COLORS.borderSoft}`,
                borderRadius: 10,
                fontFamily: FONTS.body,
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  letterSpacing: 0.4,
                  textTransform: "uppercase",
                  color: COLORS.inkMuted,
                  marginBottom: 8,
                }}
              >
                Travel preferences
              </div>
              <FieldRow label="Willing to fly to" optional hint="Cities or regions you'll travel for. Leave blank for anywhere.">
                <TextInput placeholder="Paris, Milan, NYC · or leave blank for anywhere" />
              </FieldRow>
              <div style={{ height: 8 }} />
              <FieldRow label="Min booking value when traveling" optional hint="Bookings below this amount won't be pitched if travel is required.">
                <TextInput placeholder="e.g. €1,500" />
              </FieldRow>
              <div style={{ height: 10 }} />
              <button
                type="button"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  width: "100%",
                  padding: "8px 10px",
                  background: "#fff",
                  border: `1px solid ${COLORS.border}`,
                  borderRadius: 8,
                  cursor: "pointer",
                  fontFamily: FONTS.body,
                  textAlign: "left",
                }}
              >
                <span
                  style={{
                    width: 14,
                    height: 14,
                    borderRadius: 3,
                    background: "transparent",
                    border: `1.5px solid ${COLORS.border}`,
                    flexShrink: 0,
                  }}
                />
                <div style={{ fontSize: 12, color: COLORS.ink }}>
                  Travel costs must be covered by client
                </div>
              </button>
            </div>
          )}
        </section>

        {/* ─── 3. Existing blocks (A5) ──────────────────────────── */}
        {AVAILABILITY_BLOCKS.length > 0 && (
          <section>
            <SubsectionLabel>Your existing blocks · {AVAILABILITY_BLOCKS.length}</SubsectionLabel>
            <div
              style={{
                marginTop: 10,
                display: "flex",
                flexDirection: "column",
                gap: 0,
                border: `1px solid ${COLORS.borderSoft}`,
                borderRadius: 10,
                overflow: "hidden",
              }}
            >
              {AVAILABILITY_BLOCKS.map((b, i) => (
                <div
                  key={b.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "10px 12px",
                    borderTop: i === 0 ? "none" : `1px solid ${COLORS.borderSoft}`,
                    fontFamily: FONTS.body,
                  }}
                >
                  <span
                    aria-hidden
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: "50%",
                      background: b.type === "travel" ? COLORS.amber : COLORS.inkMuted,
                      flexShrink: 0,
                    }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, color: COLORS.ink, fontWeight: 500 }}>
                      {b.startDate} – {b.endDate}
                    </div>
                    <div style={{ fontSize: 11, color: COLORS.inkMuted, marginTop: 1 }}>
                      {b.reason}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => toast(`Block "${b.reason}" removed`)}
                    aria-label={`Remove block ${b.startDate}-${b.endDate}`}
                    style={{
                      background: "transparent",
                      border: "none",
                      padding: "4px 6px",
                      cursor: "pointer",
                      color: COLORS.inkDim,
                    }}
                  >
                    <Icon name="x" size={11} stroke={1.8} />
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ─── 4. Add to your calendar ────────────────────────────
            Two action paths into the full Add Event drawer. Replaces the
            prior inline From/To/Reason form because the dedicated drawer
            does it better — reason chips, currency picker, advanced
            details, source attribution. The Availability drawer now
            handles the simple state (location + toggles) and hands off
            to the richer flow when the talent needs to log or block. */}
        <section>
          <SubsectionLabel>Add to your calendar</SubsectionLabel>
          <div
            style={{
              marginTop: 6,
              fontFamily: FONTS.body,
              fontSize: 12,
              color: COLORS.inkMuted,
              marginBottom: 10,
            }}
          >
            Track work you did off-platform, or block dates when you can't work.
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <AvailabilityAddAction
              icon="credit"
              tone="success"
              title="Log work"
              body="Off-platform booking — adds to earnings + calendar."
              onClick={() => {
                openDrawer("talent-add-event", { mode: "work" });
              }}
            />
            <AvailabilityAddAction
              icon="lock"
              tone="caution"
              title="Block time"
              body="Vacation, day job, school, family — anything that means you're not available."
              onClick={() => {
                openDrawer("talent-add-event", { mode: "block" });
              }}
            />
          </div>
        </section>
      </div>
    </DrawerShell>
  );
}

/**
 * Compact action row used inside the Availability drawer's "Add to your
 * calendar" section. Tinted icon chip + title + body + chevron. Click
 * launches the full TalentAddEventDrawer in the appropriate mode.
 */
function AvailabilityAddAction({
  icon,
  tone,
  title,
  body,
  onClick,
}: {
  icon: "credit" | "lock";
  tone: "success" | "caution";
  title: string;
  body: string;
  onClick: () => void;
}) {
  const palette = {
    success: { bg: COLORS.successSoft, fg: COLORS.green },
    caution: { bg: COLORS.amberSoft, fg: COLORS.amber },
  }[tone];
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        width: "100%",
        padding: "12px 14px",
        background: "#fff",
        border: `1px solid ${COLORS.borderSoft}`,
        borderRadius: 10,
        cursor: "pointer",
        fontFamily: FONTS.body,
        textAlign: "left",
        transition: `border-color ${TRANSITION.micro}, transform ${TRANSITION.micro}`,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = COLORS.border;
        e.currentTarget.style.transform = "translateY(-1px)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = COLORS.borderSoft;
        e.currentTarget.style.transform = "translateY(0)";
      }}
    >
      <span
        aria-hidden
        style={{
          width: 28,
          height: 28,
          borderRadius: 7,
          background: palette.bg,
          color: palette.fg,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <Icon name={icon} size={13} stroke={1.7} />
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: COLORS.ink,
          }}
        >
          {title}
        </div>
        <div
          style={{
            fontSize: 11.5,
            color: COLORS.inkMuted,
            marginTop: 2,
            lineHeight: 1.4,
          }}
        >
          {body}
        </div>
      </div>
      <Icon name="chevron-right" size={13} color={COLORS.inkDim} />
    </button>
  );
}

function SubsectionLabel({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        fontFamily: FONTS.body,
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: 0.5,
        textTransform: "uppercase",
        color: COLORS.inkMuted,
      }}
    >
      {children}
    </div>
  );
}

/**
 * Compact toggle row used inside the Availability drawer's grouped panels.
 * Disabled state collapses the toggle to a no-op + dims the row.
 */
function AvailabilityToggleRow({
  label,
  hint,
  on,
  onChange,
  disabled = false,
}: {
  label: string;
  hint?: string;
  on: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "space-between",
        gap: 14,
        padding: "12px 14px",
        borderBottom: `1px solid ${COLORS.borderSoft}`,
        opacity: disabled ? 0.55 : 1,
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontFamily: FONTS.body,
            fontSize: 13,
            fontWeight: 600,
            color: COLORS.ink,
          }}
        >
          {label}
        </div>
        {hint && (
          <div
            style={{
              fontFamily: FONTS.body,
              fontSize: 12,
              color: COLORS.inkMuted,
              marginTop: 2,
              lineHeight: 1.5,
            }}
          >
            {hint}
          </div>
        )}
      </div>
      <Toggle
        on={on}
        onChange={() => !disabled && onChange(!on)}
      />
    </div>
  );
}

// ─── Portfolio manager ───────────────────────────────────────────

export function TalentPortfolioDrawer() {
  const { state, closeDrawer } = useProto();
  const open = state.drawer.drawerId === "talent-portfolio";
  const onSave = useSaveAndClose("Portfolio updated");
  const shots = ["🌸", "🌊", "🍃", "🌷", "🌹", "🪷", "🌾", "🌺", "🌿", "🌳", "🍂", "🌲"];
  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title="Portfolio"
      description="12 / 15 shots. Your agencies favour fresh work — try to keep at least 3 from this year."
      width={620}
      footer={<StandardFooter onSave={onSave} saveLabel="Save order" />}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 8,
        }}
      >
        {shots.map((s, i) => (
          <div
            key={i}
            style={{
              aspectRatio: "3 / 4",
              background: COLORS.surfaceAlt,
              borderRadius: 8,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 28,
              border: `1px solid ${COLORS.borderSoft}`,
            }}
          >
            {s}
          </div>
        ))}
        <div
          style={{
            aspectRatio: "3 / 4",
            background: "rgba(11,11,13,0.02)",
            borderRadius: 8,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            border: `1px dashed rgba(11,11,13,0.18)`,
            color: COLORS.inkMuted,
            fontFamily: FONTS.body,
            fontSize: 12,
          }}
        >
          + Add
        </div>
      </div>
    </DrawerShell>
  );
}

// ─── Agency relationship ─────────────────────────────────────────

export function TalentAgencyRelationshipDrawer() {
  const { state, closeDrawer, openDrawer } = useProto();
  const open = state.drawer.drawerId === "talent-agency-relationship";
  const mode = state.drawer.payload?.mode;
  if (mode === "add") {
    return (
      <DrawerShell
        open={open}
        onClose={closeDrawer}
        title="Add another agency"
        description="On Tulala, agencies invite talent — not the other way around. Forward an invite to your inbox or share your public profile with the agency."
        width={520}
        footer={<SecondaryButton onClick={closeDrawer}>Got it</SecondaryButton>}
      >
        <div style={{ fontFamily: FONTS.body, fontSize: 13, color: COLORS.ink, lineHeight: 1.6 }}>
          Share this URL with the agency you'd like to work with — they can request you onto
          their roster, and you'll see the request in your inbox.
        </div>
        <div
          style={{
            marginTop: 14,
            padding: "10px 12px",
            background: COLORS.surfaceAlt,
            border: `1px solid rgba(15,79,62,0.18)`,
            borderRadius: 10,
            fontFamily: FONTS.mono,
            fontSize: 12,
            color: COLORS.ink,
          }}
        >
          {MY_TALENT_PROFILE.publicUrl}
        </div>
      </DrawerShell>
    );
  }
  const id = (state.drawer.payload?.id as string) ?? "ag1";
  const a = MY_AGENCIES.find((x) => x.id === id) ?? MY_AGENCIES[0];

  // Plan-tier shapes the rules: free can't be exclusive, agency/studio
  // sets exclusivity + commission. Per the agency-exclusivity product spec.
  const planLabel = a.planTier === "free"
    ? "Free plan"
    : a.planTier === "studio"
      ? "Studio plan"
      : "Agency plan";
  const exclusivityRule = a.planTier === "free"
    ? "Free-tier agencies can't hold exclusivity. They share their link to refer work but you're not bound."
    : a.status === "exclusive"
      ? `${a.name} is your exclusive agency. You can have only one exclusive at a time.`
      : `${a.name} represents you alongside other agencies. Exclusivity is granted per agency.`;
  const commissionLabel = a.commissionRate === 0
    ? "No commission · friend / free-plan agency"
    : `${Math.round(a.commissionRate * 100)}% on bookings ${a.name} brings`;

  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title={a.name}
      description={`${a.status === "exclusive" ? "Exclusive" : a.status === "non-exclusive" ? "Non-exclusive" : "Active"} relationship · joined ${a.joinedAt}`}
      width={540}
      footer={
        <StandardFooter
          onSave={() => closeDrawer()}
          saveLabel="Done"
          destructive={{ label: "End relationship", onClick: () => openDrawer("talent-leave-agency", { id: a.id }) }}
        />
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {/* Plan + commission summary chip */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "10px 12px",
            background: a.planTier === "free" ? "rgba(11,11,13,0.04)" : COLORS.indigoSoft,
            border: `1px solid ${a.planTier === "free" ? COLORS.borderSoft : "rgba(91,107,160,0.18)"}`,
            borderRadius: 8,
            fontFamily: FONTS.body,
            fontSize: 12,
          }}
        >
          <Icon name="info" size={12} stroke={1.7} color={COLORS.inkMuted} />
          <span style={{ color: COLORS.ink, fontWeight: 500 }}>
            {planLabel} · {commissionLabel}
          </span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <KvRow label="Status" value={a.status} />
          <KvRow label="Joined" value={a.joinedAt} />
          <KvRow label="Bookings YTD" value={a.bookingsYTD} />
          <KvRow label="Primary" value={a.isPrimary ? "Yes" : "No"} />
          <KvRow label="Take rate" value={a.commissionRate === 0 ? "—" : `${Math.round(a.commissionRate * 100)}%`} />
        </div>

        <Divider label="Exclusivity" />
        <div
          style={{
            fontFamily: FONTS.body,
            fontSize: 12.5,
            color: COLORS.inkMuted,
            lineHeight: 1.6,
          }}
        >
          {exclusivityRule}
        </div>
        {a.planTier !== "free" && a.status !== "exclusive" && (
          <button
            type="button"
            onClick={() => openDrawer("talent-leave-agency", { id: a.id, mode: "make-exclusive" })}
            style={{
              alignSelf: "flex-start",
              padding: "7px 12px",
              background: "transparent",
              border: `1px solid ${COLORS.border}`,
              borderRadius: 7,
              fontFamily: FONTS.body,
              fontSize: 12,
              fontWeight: 500,
              color: COLORS.ink,
              cursor: "pointer",
            }}
          >
            Make {a.name} exclusive →
          </button>
        )}
        {a.status === "exclusive" && (
          <div
            style={{
              fontFamily: FONTS.body,
              fontSize: 11.5,
              color: COLORS.inkDim,
              fontStyle: "italic",
            }}
          >
            To switch exclusivity to a different agency, end this relationship first.
          </div>
        )}

        <Divider label="What this agency can do" />
        <ul style={{ margin: 0, paddingLeft: 18, fontFamily: FONTS.body, fontSize: 13, color: COLORS.ink, lineHeight: 1.7 }}>
          <li>Pitch you to clients (you confirm before anything is booked)</li>
          <li>List you on their public roster</li>
          <li>Hold dates on your calendar with your approval</li>
          <li>Send you direct messages via the inbox</li>
          {a.commissionRate > 0 && (
            <li>Take {Math.round(a.commissionRate * 100)}% of any booking they bring you</li>
          )}
        </ul>
      </div>
    </DrawerShell>
  );
}

// ─── Leave agency ───────────────────────────────────────────────

export function TalentLeaveAgencyDrawer() {
  const { state, closeDrawer, toast } = useProto();
  const open = state.drawer.drawerId === "talent-leave-agency";
  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title="End relationship"
      description="This is a serious step. Your agency is notified and has 14 days to wind down active bookings."
      width={520}
      footer={
        <>
          <SecondaryButton onClick={closeDrawer}>Keep working with them</SecondaryButton>
          <button
            onClick={() => {
              toast("Notice sent — agency informed");
              closeDrawer();
            }}
            style={{
              background: COLORS.red,
              color: "#fff",
              border: "none",
              padding: "9px 16px",
              fontFamily: FONTS.body,
              fontSize: 13,
              fontWeight: 500,
              borderRadius: 8,
              cursor: "pointer",
            }}
          >
            Send 14-day notice
          </button>
        </>
      }
    >
      <div style={{ fontFamily: FONTS.body, fontSize: 13.5, color: COLORS.ink, lineHeight: 1.6 }}>
        Active bookings stay confirmed and get paid out. New pitches stop immediately. Past
        earnings remain in your activity log. Your agency can't see your inbox or calendar
        once the 14 days are up.
      </div>
    </DrawerShell>
  );
}

// ─── Notifications ──────────────────────────────────────────────
// TalentNotificationsDrawer is now defined in _wave2.tsx (richer version
// with notification list + collapsible settings). Removed the simpler
// settings-only version that lived here.

// ─── Privacy ────────────────────────────────────────────────────

export function TalentPrivacyDrawer() {
  const { state, closeDrawer } = useProto();
  const open = state.drawer.drawerId === "talent-privacy";
  const onSave = useSaveAndClose("Privacy saved");
  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title="Privacy"
      description="Where you appear, and who can see your full profile."
      width={520}
      footer={<StandardFooter onSave={onSave} />}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <ToggleRow label="Tulala hub (curated discovery)" hint="Only featured talent are shown." defaultOn={true} />
        <ToggleRow label="Acme Models public roster" defaultOn={true} />
        <ToggleRow label="Praline London public roster" defaultOn={true} />
        <ToggleRow
          label="Search engines (Google etc.)"
          hint="Lets people find your public page from a Google search."
          defaultOn={true}
        />
        <Divider label="Sensitive data" />
        <ToggleRow
          label="Show measurements publicly"
          hint="Off = only agencies + clients you accept can see them."
          defaultOn={true}
        />
      </div>
    </DrawerShell>
  );
}

// ─── Contact preferences ────────────────────────────────────────
//
// Per-tier on/off gate for inbound inquiries. Default = all tiers on
// (open marketplace). Selectivity is opt-in. The "Most selective"
// preset offers a one-click move to Verified+. Copy is plain English —
// never frames it as "pay to message". See project_client_trust_badges.md.

export function TalentContactPreferencesDrawer() {
  const { state, closeDrawer, toast } = useProto();
  const open = state.drawer.drawerId === "talent-contact-preferences";
  const [policy, setPolicy] = useState<TalentContactPolicy>(MY_TALENT_PROFILE.contactPolicy);
  const allowedCount = (Object.values(policy) as boolean[]).filter(Boolean).length;
  const allOn = allowedCount === CLIENT_TRUST_LEVELS.length;

  const onSave = () => {
    toast(
      allOn
        ? "Contact preferences saved · open to all tiers"
        : `Contact preferences saved · ${allowedCount} of ${CLIENT_TRUST_LEVELS.length} tiers on`,
    );
    closeDrawer();
  };

  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title="Contact preferences"
      description="Decide which client trust tiers can send you inquiries. Your agency still sees everything internally — this gates inbound contact, not visibility."
      width={560}
      footer={
        <>
          <SecondaryButton onClick={closeDrawer}>Close</SecondaryButton>
          <PrimaryButton onClick={onSave}>Save</PrimaryButton>
        </>
      }
    >
      {/* Framing card — explains the principle without leaking the
          "pay to DM" anti-pattern. */}
      <div
        style={{
          padding: "14px 16px",
          background: "rgba(11,11,13,0.03)",
          border: `1px solid ${COLORS.borderSoft}`,
          borderRadius: 12,
          marginBottom: 18,
        }}
      >
        <CapsLabel>How this works</CapsLabel>
        <div
          style={{
            fontFamily: FONTS.body,
            fontSize: 13,
            color: COLORS.ink,
            marginTop: 6,
            lineHeight: 1.55,
          }}
        >
          Higher-trust clients have completed verification or funded their
          account on Tulala. You decide which tiers can reach you. Lower-trust
          tiers always have your agency's roster page available — they just
          can't drop straight into your inbox.
        </div>
      </div>

      {/* Presets — quick way to flip without micromanaging four toggles. */}
      <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
        <PresetButton
          label="Open to everyone"
          active={JSON.stringify(policy) === JSON.stringify(DEFAULT_CONTACT_POLICY)}
          onClick={() => setPolicy({ ...DEFAULT_CONTACT_POLICY })}
        />
        <PresetButton
          label="Verified clients only"
          active={JSON.stringify(policy) === JSON.stringify(SELECTIVE_CONTACT_POLICY)}
          onClick={() => setPolicy({ ...SELECTIVE_CONTACT_POLICY })}
        />
      </div>

      {/* Per-tier toggles — the actual control surface. */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {CLIENT_TRUST_LEVELS.map((tier) => {
          const meta = CLIENT_TRUST_META[tier];
          return (
            <div
              key={tier}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 12,
                padding: "12px 14px",
                background: "#fff",
                border: `1px solid ${COLORS.borderSoft}`,
                borderRadius: 10,
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    fontFamily: FONTS.body,
                    fontSize: 13,
                    fontWeight: 500,
                    color: COLORS.ink,
                  }}
                >
                  <ClientTrustChip level={tier} compact withDot={false} />
                  Allow inquiries from {meta.label} clients
                </div>
                <div
                  style={{
                    fontFamily: FONTS.body,
                    fontSize: 12,
                    color: COLORS.inkMuted,
                    marginTop: 4,
                    lineHeight: 1.5,
                  }}
                >
                  {meta.rationale}
                </div>
              </div>
              <Toggle
                on={policy[tier]}
                onChange={(next) => setPolicy({ ...policy, [tier]: next })}
              />
            </div>
          );
        })}
      </div>

      {/* What changes — a soft note about the consequence of selectivity. */}
      {!allOn && (
        <div
          style={{
            marginTop: 14,
            fontFamily: FONTS.body,
            fontSize: 12.5,
            color: COLORS.inkMuted,
            lineHeight: 1.55,
          }}
        >
          Blocked tiers can still see your roster page. They'll be invited to
          verify or fund their account before they can send you a direct
          inquiry. Your agency's coordinator inbox is unaffected.
        </div>
      )}
    </DrawerShell>
  );
}

function PresetButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        background: active ? COLORS.fill : "#fff",
        color: active ? "#fff" : COLORS.ink,
        border: `1px solid ${active ? COLORS.accent : COLORS.borderSoft}`,
        borderRadius: 999,
        padding: "6px 12px",
        fontFamily: FONTS.body,
        fontSize: 12,
        fontWeight: 500,
        cursor: "pointer",
        letterSpacing: 0.2,
      }}
    >
      {label}
    </button>
  );
}

// ─── Payouts ────────────────────────────────────────────────────

export function TalentPayoutsDrawer() {
  const { state, closeDrawer, toast } = useProto();
  const open = state.drawer.drawerId === "talent-payouts";
  // Multi-step Stripe-Connect-style onboarding scaffold. Each step
  // captures one logical block; the actual KYC + bank handoff happens
  // via Stripe's hosted flow in production. The drawer mocks the
  // progression so the prototype demonstrates the experience.
  type Step = "country" | "personal" | "bank" | "tax" | "verify" | "done";
  const [step, setStep] = useState<Step>("country");
  const [country, setCountry] = useState("Spain");
  const stepIndex: Record<Step, number> = {
    country: 0,
    personal: 1,
    bank: 2,
    tax: 3,
    verify: 4,
    done: 5,
  };
  const stepCount = 5;
  const stepLabels = ["Country", "Personal", "Bank", "Tax", "Verify"];

  const advance = (next: Step) => {
    setStep(next);
    if (next === "done") toast("Payout setup complete — you'll be paid out via Stripe");
  };

  const reset = () => {
    setStep("country");
  };

  return (
    <DrawerShell
      open={open}
      onClose={() => {
        closeDrawer();
        // Defer reset so the closing animation doesn't show the country step.
        setTimeout(reset, 200);
      }}
      title="Set up payouts"
      description="Stripe Connect handles KYC + banking. Tulala never sees your bank details."
      width={560}
      footer={
        step === "done" ? (
          <PrimaryButton onClick={() => { closeDrawer(); setTimeout(reset, 200); }}>Done</PrimaryButton>
        ) : (
          <>
            <SecondaryButton onClick={() => { closeDrawer(); setTimeout(reset, 200); }}>
              Save & exit
            </SecondaryButton>
            <PrimaryButton
              onClick={() => {
                if (step === "country") advance("personal");
                else if (step === "personal") advance("bank");
                else if (step === "bank") advance("tax");
                else if (step === "tax") advance("verify");
                else if (step === "verify") advance("done");
              }}
            >
              {step === "verify" ? "Submit" : "Continue"}
            </PrimaryButton>
          </>
        )
      }
    >
      {/* Step indicator */}
      <div
        aria-hidden
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          marginBottom: 18,
        }}
      >
        {stepLabels.map((label, idx) => {
          const isActive = idx === stepIndex[step];
          const isDone = idx < stepIndex[step];
          return (
            <div key={idx} style={{ display: "flex", alignItems: "center", gap: 6, flex: 1 }}>
              <span
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: "50%",
                  background: isDone ? COLORS.green : isActive ? COLORS.fill : "rgba(11,11,13,0.06)",
                  color: isDone || isActive ? "#fff" : COLORS.inkDim,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 10,
                  fontWeight: 700,
                  fontFamily: FONTS.body,
                  flexShrink: 0,
                }}
              >
                {isDone ? <Icon name="check" size={11} color="#fff" /> : idx + 1}
              </span>
              <span
                style={{
                  fontFamily: FONTS.body,
                  fontSize: 11,
                  color: isActive ? COLORS.ink : COLORS.inkMuted,
                  fontWeight: isActive ? 600 : 500,
                }}
              >
                {label}
              </span>
              {idx < stepLabels.length - 1 && (
                <span
                  style={{
                    flex: 1,
                    height: 1,
                    background: idx < stepIndex[step] ? COLORS.green : "rgba(11,11,13,0.10)",
                    marginRight: 0,
                  }}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Trust banner — always visible during the flow */}
      <div
        style={{
          padding: "12px 14px",
          background: COLORS.accentSoft,
          border: `1px solid rgba(15,79,62,0.18)`,
          borderRadius: 10,
          marginBottom: 14,
          fontFamily: FONTS.body,
          fontSize: 12,
          color: COLORS.ink,
          lineHeight: 1.5,
        }}
      >
        <strong style={{ color: COLORS.accentDeep }}>Encrypted via Stripe.</strong>{" "}
        Bank details and ID never touch Tulala servers. You'll see a Stripe-hosted page in production.
      </div>

      {step === "country" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <FieldRow label="Country of residence" hint="Determines your payout currency and tax form">
            <select
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              style={{
                width: "100%",
                padding: "10px 12px",
                fontFamily: FONTS.body,
                fontSize: 13,
                border: `1px solid ${COLORS.borderSoft}`,
                borderRadius: 8,
                background: "#fff",
                color: COLORS.ink,
              }}
            >
              <option>Spain</option>
              <option>Italy</option>
              <option>France</option>
              <option>Germany</option>
              <option>United Kingdom</option>
              <option>United States</option>
            </select>
          </FieldRow>
          <KvRow label="Payout currency" value={country === "United States" ? "USD" : country === "United Kingdom" ? "GBP" : "EUR"} />
          <KvRow label="Tax form" value={country === "United States" ? "W-9" : "W-8BEN"} />
        </div>
      )}

      {step === "personal" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <FieldRow label="Legal name">
            <TextInput defaultValue="Marta Reyes" />
          </FieldRow>
          <FieldRow label="Date of birth">
            <TextInput placeholder="DD / MM / YYYY" />
          </FieldRow>
          <FieldRow label="Address">
            <TextInput placeholder="Street, city, postcode" />
          </FieldRow>
        </div>
      )}

      {step === "bank" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div
            style={{
              padding: "16px",
              background: "#fff",
              border: `1px dashed ${COLORS.border}`,
              borderRadius: 12,
              textAlign: "center",
              fontFamily: FONTS.body,
              fontSize: 13,
              color: COLORS.inkMuted,
            }}
          >
            <Icon name="external" size={20} color={COLORS.accentDeep} />
            <div style={{ marginTop: 10, fontWeight: 600, color: COLORS.ink, fontSize: 14 }}>
              Continue on Stripe to add your bank
            </div>
            <div style={{ marginTop: 6, lineHeight: 1.5, maxWidth: 360, margin: "6px auto 0" }}>
              In production this opens a Stripe-hosted page where your IBAN / sort code is
              entered behind their PCI-DSS infrastructure.
            </div>
          </div>
        </div>
      )}

      {step === "tax" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <FieldRow label={country === "United States" ? "W-9 form" : "W-8BEN form"} hint="Confirms your tax residency">
            <TextInput defaultValue={`${country} resident`} />
          </FieldRow>
          <FieldRow label="Tax ID" hint="Your local TIN, NIE, or SSN">
            <TextInput placeholder="••••••" />
          </FieldRow>
          <KvRow label="VAT number" value="(optional)" />
        </div>
      )}

      {step === "verify" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <KvRow label="Country" value={country} />
          <KvRow label="Bank" value="Connected via Stripe" />
          <KvRow label="Tax form" value={country === "United States" ? "W-9 · ready" : "W-8BEN · ready"} />
          <KvRow label="Schedule" value="Per-booking · paid 14 days after wrap" />
          <KvRow label="First payout ETA" value="Once your next booking wraps" />
        </div>
      )}

      {step === "done" && (
        <CelebrationBanner
          tone="forest"
          eyebrow="Setup complete"
          title="Payouts are live"
          body="Stripe will pay you 14 days after each wrap. You can update bank or tax details anytime from Settings."
        />
      )}
    </DrawerShell>
  );
}

// ─── Trust verification (D1) ────────────────────────────────────

/**
 * Identity verification scaffold. Multi-step ID upload flow that — once
 * approved by an admin — lifts the talent's trust tier from Basic to
 * Verified, unlocking the Verified badge on roster cards and inquiry
 * workspaces.
 *
 * This is a scaffold. The real flow uses a vendor (Stripe Identity, Onfido,
 * Persona) that returns a verification result via webhook; the prototype
 * stops at "submitted — under review" so the admin queue is implied but
 * not modeled here.
 */
export function TalentVerificationDrawer() {
  const { state, closeDrawer, toast } = useProto();
  const open = state.drawer.drawerId === "talent-verification";
  type Step = "intro" | "id-type" | "upload" | "selfie" | "submitted";
  const [step, setStep] = useState<Step>("intro");
  const [idType, setIdType] = useState<"passport" | "drivers-license" | "national-id">("passport");

  const reset = () => setStep("intro");

  return (
    <DrawerShell
      open={open}
      onClose={() => {
        closeDrawer();
        setTimeout(reset, 200);
      }}
      title="Verify your identity"
      description="Upload a government ID + a quick selfie. Once approved you get the Verified badge — clients see it on every inquiry."
      width={560}
      footer={
        step === "submitted" ? (
          <PrimaryButton onClick={() => { closeDrawer(); setTimeout(reset, 200); }}>Done</PrimaryButton>
        ) : (
          <>
            <SecondaryButton onClick={() => { closeDrawer(); setTimeout(reset, 200); }}>Cancel</SecondaryButton>
            <PrimaryButton
              onClick={() => {
                if (step === "intro") setStep("id-type");
                else if (step === "id-type") setStep("upload");
                else if (step === "upload") setStep("selfie");
                else if (step === "selfie") {
                  setStep("submitted");
                  toast("Verification submitted — you'll hear back within 24h");
                }
              }}
            >
              {step === "selfie" ? "Submit for review" : "Continue"}
            </PrimaryButton>
          </>
        )
      }
    >
      <div
        style={{
          padding: "12px 14px",
          background: COLORS.accentSoft,
          border: `1px solid rgba(15,79,62,0.18)`,
          borderRadius: 10,
          marginBottom: 14,
          fontFamily: FONTS.body,
          fontSize: 12,
          color: COLORS.ink,
          lineHeight: 1.5,
        }}
      >
        <strong style={{ color: COLORS.accentDeep }}>End-to-end encrypted.</strong>{" "}
        Documents are reviewed by Tulala's trust team and deleted after approval. Never shared with clients.
      </div>

      {step === "intro" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <h3
            style={{
              fontFamily: FONTS.display,
              fontSize: 18,
              fontWeight: 500,
              color: COLORS.ink,
              margin: 0,
              letterSpacing: -0.15,
            }}
          >
            Why verify?
          </h3>
          <ul style={{ margin: 0, paddingLeft: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 8 }}>
            {[
              { label: "Verified badge on every inquiry", body: "Clients filter on it. Verified profiles get ~3× more replies in our data." },
              { label: "Higher trust tier", body: "Eligible for Silver and Gold tiers as your booking history grows." },
              { label: "Required for payouts > €1k", body: "Compliance — Stripe needs the same KYC anyway." },
            ].map((item, idx) => (
              <li
                key={idx}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 10,
                  padding: "10px 12px",
                  background: "#fff",
                  border: `1px solid ${COLORS.borderSoft}`,
                  borderRadius: 9,
                  fontFamily: FONTS.body,
                }}
              >
                <span
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: "50%",
                    background: COLORS.accentSoft,
                    color: COLORS.accentDeep,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 11,
                    fontWeight: 700,
                    flexShrink: 0,
                  }}
                >
                  {idx + 1}
                </span>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500, color: COLORS.ink, lineHeight: 1.35 }}>
                    {item.label}
                  </div>
                  <div style={{ fontSize: 12, color: COLORS.inkMuted, marginTop: 2, lineHeight: 1.45 }}>
                    {item.body}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {step === "id-type" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <CapsLabel>Choose ID type</CapsLabel>
          {([
            { id: "passport" as const, label: "Passport", body: "Best — single-page, accepted globally." },
            { id: "drivers-license" as const, label: "Driver's license", body: "Front + back. Some countries only." },
            { id: "national-id" as const, label: "National ID card", body: "EU residents — front + back." },
          ]).map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => setIdType(opt.id)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "12px 14px",
                background: "#fff",
                border: `1px solid ${idType === opt.id ? COLORS.accent : COLORS.borderSoft}`,
                borderRadius: 10,
                cursor: "pointer",
                textAlign: "left",
                fontFamily: FONTS.body,
              }}
            >
              <span
                aria-hidden
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: "50%",
                  border: `2px solid ${idType === opt.id ? COLORS.accent : COLORS.border}`,
                  background: idType === opt.id ? COLORS.accent : "transparent",
                  flexShrink: 0,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {idType === opt.id && (
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#fff" }} />
                )}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: COLORS.ink }}>{opt.label}</div>
                <div style={{ fontSize: 11.5, color: COLORS.inkMuted, marginTop: 2 }}>{opt.body}</div>
              </div>
            </button>
          ))}
        </div>
      )}

      {step === "upload" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <CapsLabel>Upload your {idType === "passport" ? "passport photo page" : idType === "drivers-license" ? "license front + back" : "ID front + back"}</CapsLabel>
          <button
            type="button"
            style={{
              padding: "32px 16px",
              background: "#fff",
              border: `2px dashed ${COLORS.border}`,
              borderRadius: 12,
              textAlign: "center",
              fontFamily: FONTS.body,
              cursor: "pointer",
            }}
          >
            <Icon name="external" size={22} color={COLORS.inkMuted} />
            <div style={{ marginTop: 10, fontSize: 14, fontWeight: 500, color: COLORS.ink }}>
              Drop file or click to upload
            </div>
            <div style={{ fontSize: 11.5, color: COLORS.inkMuted, marginTop: 4 }}>
              JPG or PNG · max 8MB · clear corners visible
            </div>
          </button>
          {idType !== "passport" && (
            <button
              type="button"
              style={{
                padding: "32px 16px",
                background: "#fff",
                border: `2px dashed ${COLORS.border}`,
                borderRadius: 12,
                textAlign: "center",
                fontFamily: FONTS.body,
                cursor: "pointer",
              }}
            >
              <Icon name="external" size={22} color={COLORS.inkMuted} />
              <div style={{ marginTop: 10, fontSize: 14, fontWeight: 500, color: COLORS.ink }}>
                Upload back side
              </div>
            </button>
          )}
        </div>
      )}

      {step === "selfie" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <CapsLabel>Quick selfie</CapsLabel>
          <button
            type="button"
            style={{
              aspectRatio: "1 / 1",
              maxWidth: 280,
              margin: "0 auto",
              background: COLORS.surfaceAlt,
              border: `2px dashed ${COLORS.border}`,
              borderRadius: "50%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexDirection: "column",
              gap: 8,
              fontFamily: FONTS.body,
              cursor: "pointer",
              color: COLORS.inkMuted,
            }}
          >
            <Icon name="user" size={32} color={COLORS.inkMuted} />
            <div style={{ fontSize: 13, fontWeight: 500, color: COLORS.ink }}>Take selfie</div>
            <div style={{ fontSize: 11.5 }}>So we know it's really you</div>
          </button>
          <p style={{ fontFamily: FONTS.body, fontSize: 11.5, color: COLORS.inkMuted, margin: 0, lineHeight: 1.5, textAlign: "center" }}>
            One photo. We compare it to your ID. Deleted after approval.
          </p>
        </div>
      )}

      {step === "submitted" && (
        <CelebrationBanner
          tone="accent"
          eyebrow="Submitted"
          title="Under review — you'll hear back in 24 hours"
          body="We email you once approved. Your inquiries get a small 'verification pending' chip until then."
        />
      )}
    </DrawerShell>
  );
}

// ─── Friend referrals (D7) ──────────────────────────────────────

const REFERRAL_LIST = [
  { id: "r1", name: "Sara Mendez", status: "joined" as const, joinedAt: "2 weeks ago", earned: 0 },
  { id: "r2", name: "Marco Vasquez", status: "earning" as const, joinedAt: "5 weeks ago", earned: 50 },
  { id: "r3", name: "Lia Torres", status: "invited" as const, joinedAt: "Sent 3 days ago", earned: 0 },
];

export function TalentReferralsDrawer() {
  const { state, closeDrawer, toast } = useProto();
  const open = state.drawer.drawerId === "talent-referrals";
  const link = "tulala.digital/r/marta-reyes";
  const earnedTotal = REFERRAL_LIST.reduce((sum, r) => sum + r.earned, 0);
  const joinedCount = REFERRAL_LIST.filter((r) => r.status !== "invited").length;
  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title="Refer a friend"
      description="When a talent you invited closes their first booking, you both earn €50 in payout credit."
      width={560}
      footer={<SecondaryButton onClick={closeDrawer}>Close</SecondaryButton>}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 8,
          marginBottom: 16,
        }}
      >
        <SummaryStat label="Sent" value={String(REFERRAL_LIST.length)} accent="ink" />
        <SummaryStat label="Joined" value={String(joinedCount)} accent="green" />
        <SummaryStat label="Earned" value={`€${earnedTotal}`} accent="green" />
      </div>

      <FieldRow label="Your invite link" hint="Click to copy. Anyone who signs up via this link is yours.">
        <button
          type="button"
          onClick={() => toast("Invite link copied")}
          style={{
            width: "100%",
            padding: "10px 12px",
            background: "#fff",
            border: `1px solid ${COLORS.borderSoft}`,
            borderRadius: 8,
            fontFamily: FONTS.body,
            fontSize: 13,
            color: COLORS.ink,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 10,
            textAlign: "left",
          }}
        >
          <Icon name="external" size={13} color={COLORS.inkMuted} />
          <span style={{ flex: 1, fontFamily: "monospace" }}>{link}</span>
          <span style={{ fontSize: 11.5, color: COLORS.accentDeep, fontWeight: 600 }}>Copy</span>
        </button>
      </FieldRow>

      <Divider label="Referrals" />

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {REFERRAL_LIST.map((r) => (
          <div
            key={r.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "10px 12px",
              background: "#fff",
              border: `1px solid ${COLORS.borderSoft}`,
              borderRadius: 9,
              fontFamily: FONTS.body,
            }}
          >
            <Avatar initials={r.name.split(" ").map((n) => n[0]).join("")} size={28} tone="ink" />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: COLORS.ink }}>{r.name}</div>
              <div style={{ fontSize: 11.5, color: COLORS.inkMuted, marginTop: 1 }}>
                {r.status === "earning"
                  ? `Earned · joined ${r.joinedAt}`
                  : r.status === "joined"
                    ? `Joined ${r.joinedAt} · waiting on first booking`
                    : r.joinedAt}
              </div>
            </div>
            {r.earned > 0 && (
              <span
                style={{
                  fontFamily: FONTS.body,
                  fontSize: 13,
                  fontWeight: 600,
                  color: COLORS.green,
                }}
              >
                +€{r.earned}
              </span>
            )}
            {r.status === "invited" && (
              <SecondaryButton size="sm" onClick={() => toast("Reminder sent")}>Remind</SecondaryButton>
            )}
          </div>
        ))}
      </div>
    </DrawerShell>
  );
}

// ─── Hub compare (E7) ───────────────────────────────────────────

const HUB_COMPARE_DATA = [
  {
    name: "Tulala Hub · Madrid",
    listingFee: "€8/mo",
    avgInquiriesPerMonth: 9,
    averageDayRate: "€280",
    closeRate: "22%",
    talentCount: 240,
    notes: "Strong fashion + commercial briefs. Hub-fee waived for verified talents.",
    recommended: true,
  },
  {
    name: "Tulala Hub · Barcelona",
    listingFee: "€8/mo",
    avgInquiriesPerMonth: 6,
    averageDayRate: "€240",
    closeRate: "18%",
    talentCount: 180,
    notes: "More editorial / lifestyle. Slower volume, higher day rates.",
    recommended: false,
  },
  {
    name: "TalentLink · Lisbon",
    listingFee: "€12/mo",
    avgInquiriesPerMonth: 4,
    averageDayRate: "€220",
    closeRate: "14%",
    talentCount: 90,
    notes: "Smaller hub, higher signal-to-noise. Good if you're already on a Madrid hub.",
    recommended: false,
  },
];

export function TalentHubCompareDrawer() {
  const { state, closeDrawer, toast } = useProto();
  const open = state.drawer.drawerId === "talent-hub-compare";
  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title="Compare hubs"
      description="Side-by-side: listing fee, monthly volume, and close-rate. Numbers are rolling 90-day averages from talents on each hub."
      width={760}
      footer={<SecondaryButton onClick={closeDrawer}>Close</SecondaryButton>}
    >
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
        {HUB_COMPARE_DATA.map((hub) => (
          <div
            key={hub.name}
            style={{
              position: "relative",
              padding: "14px 14px 16px",
              background: "#fff",
              border: `1px solid ${hub.recommended ? COLORS.accent : COLORS.borderSoft}`,
              borderRadius: 12,
              fontFamily: FONTS.body,
            }}
          >
            {hub.recommended && (
              <span
                style={{
                  position: "absolute",
                  top: -10,
                  left: 12,
                  background: COLORS.accent,
                  color: "#fff",
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: 0.6,
                  textTransform: "uppercase",
                  padding: "3px 8px",
                  borderRadius: 999,
                }}
              >
                Best fit
              </span>
            )}
            <div
              style={{
                fontFamily: FONTS.display,
                fontSize: 15,
                fontWeight: 500,
                color: COLORS.ink,
                marginBottom: 10,
                letterSpacing: -0.1,
              }}
            >
              {hub.name}
            </div>
            <KvRow label="Listing fee" value={hub.listingFee} />
            <KvRow label="Inquiries / mo" value={String(hub.avgInquiriesPerMonth)} />
            <KvRow label="Avg day rate" value={hub.averageDayRate} />
            <KvRow label="Close rate" value={hub.closeRate} />
            <KvRow label="Roster size" value={`${hub.talentCount} talents`} />
            <p
              style={{
                margin: "10px 0 0",
                fontSize: 11.5,
                color: COLORS.inkMuted,
                lineHeight: 1.5,
              }}
            >
              {hub.notes}
            </p>
            <div style={{ marginTop: 12 }}>
              <PrimaryButton
                size="sm"
                onClick={() => toast(`Listed on ${hub.name}`)}
              >
                {hub.recommended ? "Get listed" : "List on this hub"}
              </PrimaryButton>
            </div>
          </div>
        ))}
      </div>
    </DrawerShell>
  );
}

// ─── Tax docs (D3) ──────────────────────────────────────────────
//
// Documented decision in DP1 + DP10: should off-platform earnings flow
// into 1099 reporting? In-kind / gift earnings? Default position taken
// here: ON-platform earnings are reported automatically; off-platform is
// opt-in (talent declares it) with a clear tax-receipt download. This
// matches what most marketplaces do (Fiverr, Upwork, Etsy) and avoids
// surprising talents at year-end.

export function TalentTaxDocsDrawer() {
  const { state, closeDrawer, toast } = useProto();
  const open = state.drawer.drawerId === "talent-tax-docs";
  const yearTotal = EARNINGS_ROWS.reduce((sum, e) => {
    const num = parseFloat(e.amount.replace(/[^0-9.]/g, "")) || 0;
    return sum + num;
  }, 0);
  const platformTotal = EARNINGS_ROWS
    .filter((e) => e.source.kind !== "manual")
    .reduce((sum, e) => sum + (parseFloat(e.amount.replace(/[^0-9.]/g, "")) || 0), 0);
  const offPlatformTotal = yearTotal - platformTotal;

  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title="Tax documents"
      description="Year-end summary + downloadable forms. Tulala reports your platform earnings; off-platform you declare yourself."
      width={580}
      footer={<SecondaryButton onClick={closeDrawer}>Close</SecondaryButton>}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 8,
          marginBottom: 16,
        }}
      >
        <SummaryStat label="2026 total" value={`€${yearTotal.toLocaleString()}`} accent="ink" />
        <SummaryStat label="Platform" value={`€${platformTotal.toLocaleString()}`} accent="green" />
        <SummaryStat label="Off-platform" value={`€${offPlatformTotal.toLocaleString()}`} accent="amber" />
      </div>

      <Divider label="Available documents" />

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {[
          { label: "2026 W-8BEN form", body: "On file · expires Dec 2029", action: "Download" },
          { label: "2025 income summary (1099-K equivalent)", body: "EU residents: tax receipt PDF · €18,420 reported", action: "Download" },
          { label: "2026 in-progress income receipt", body: `€${platformTotal.toLocaleString()} platform · regenerates monthly`, action: "Preview" },
        ].map((doc, idx) => (
          <button
            key={idx}
            type="button"
            onClick={() => toast(`${doc.label} · ${doc.action.toLowerCase()}d`)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "12px 14px",
              background: "#fff",
              border: `1px solid ${COLORS.borderSoft}`,
              borderRadius: 10,
              fontFamily: FONTS.body,
              cursor: "pointer",
              textAlign: "left",
            }}
          >
            <Icon name="external" size={14} color={COLORS.inkMuted} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: COLORS.ink }}>{doc.label}</div>
              <div style={{ fontSize: 11.5, color: COLORS.inkMuted, marginTop: 2 }}>{doc.body}</div>
            </div>
            <span style={{ fontSize: 11.5, fontWeight: 600, color: COLORS.accentDeep }}>{doc.action}</span>
          </button>
        ))}
      </div>

      <div
        style={{
          marginTop: 16,
          padding: "12px 14px",
          background: COLORS.indigoSoft,
          border: `1px solid rgba(91,107,160,0.18)`,
          borderRadius: 10,
          fontFamily: FONTS.body,
          fontSize: 12,
          color: COLORS.indigoDeep,
          lineHeight: 1.5,
        }}
      >
        <strong style={{ fontWeight: 600 }}>About off-platform & in-kind:</strong>{" "}
        Off-platform earnings you log via "Log work" appear in your year-end summary
        as self-declared income. In-kind / gift work shows separately and isn't
        included in the cash total — useful for your records, not reported to tax
        authorities. Talk to a local advisor for your jurisdiction.
      </div>
    </DrawerShell>
  );
}

// ─── Smart conflict resolution (E2) ─────────────────────────────
//
// Surfaces a calendar conflict (two holds for overlapping dates, or a
// new inquiry that overlaps a confirmed booking) and offers three
// resolution paths: prefer-A, prefer-B, propose-alt-window. The
// resolution flow is wrapped in a confirm-step so the talent owns the
// decision; AI ranks options based on day-rate, client trust tier, and
// agency relationship.

export function TalentConflictResolveDrawer() {
  const { state, closeDrawer, toast } = useProto();
  const open = state.drawer.drawerId === "talent-conflict-resolve";
  const [choice, setChoice] = useState<"a" | "b" | "alt" | null>(null);

  // Mock conflict — in production resolved from inquiry.dates × booking.dates
  const conflict = {
    a: { client: "Mango", date: "May 14", brief: "Spring campaign · Madrid", rate: "€1,200/day", trust: "Verified", recommended: true },
    b: { client: "Atelier Paris", date: "May 14", brief: "Editorial wrap · Paris", rate: "€800/day", trust: "Basic", recommended: false },
  };

  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title="Conflict on May 14"
      description="Two clients want you the same day. Tulala ranks them by rate, trust, and agency relationship. You decide."
      width={620}
      footer={
        <>
          <SecondaryButton onClick={closeDrawer}>Decide later</SecondaryButton>
          <PrimaryButton
            onClick={() => {
              if (!choice) return toast("Pick a resolution first");
              const action = choice === "a" ? "Mango confirmed · Atelier declined" :
                             choice === "b" ? "Atelier confirmed · Mango declined" :
                             "Alternative window proposed to both";
              toast(action);
              closeDrawer();
            }}
          >
            Apply resolution
          </PrimaryButton>
        </>
      }
    >
      {(["a", "b"] as const).map((key) => {
        const c = conflict[key];
        const selected = choice === key;
        return (
          <button
            key={key}
            type="button"
            onClick={() => setChoice(key)}
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 12,
              width: "100%",
              padding: "14px 16px",
              marginBottom: 10,
              background: "#fff",
              border: `1px solid ${selected ? COLORS.accent : c.recommended ? "rgba(15,79,62,0.30)" : COLORS.borderSoft}`,
              borderRadius: 12,
              cursor: "pointer",
              textAlign: "left",
              fontFamily: FONTS.body,
              position: "relative",
            }}
          >
            {c.recommended && (
              <span
                style={{
                  position: "absolute",
                  top: -10,
                  left: 14,
                  background: COLORS.accent,
                  color: "#fff",
                  fontSize: 9.5,
                  fontWeight: 700,
                  letterSpacing: 0.6,
                  textTransform: "uppercase",
                  padding: "3px 8px",
                  borderRadius: 999,
                }}
              >
                AI suggests
              </span>
            )}
            <span
              aria-hidden
              style={{
                width: 18,
                height: 18,
                borderRadius: "50%",
                border: `2px solid ${selected ? COLORS.accent : COLORS.border}`,
                background: selected ? COLORS.accent : "transparent",
                marginTop: 2,
                flexShrink: 0,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {selected && <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#fff" }} />}
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: COLORS.ink }}>{c.client}</div>
              <div style={{ fontSize: 12, color: COLORS.inkMuted, marginTop: 2 }}>{c.brief}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 8, flexWrap: "wrap" }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: COLORS.green }}>{c.rate}</span>
                <span style={{ fontSize: 11.5, color: COLORS.inkMuted }}>· {c.trust}</span>
              </div>
            </div>
          </button>
        );
      })}

      <button
        type="button"
        onClick={() => setChoice("alt")}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          width: "100%",
          padding: "12px 16px",
          background: "rgba(11,11,13,0.025)",
          border: `1px dashed ${choice === "alt" ? COLORS.accent : COLORS.border}`,
          borderRadius: 12,
          cursor: "pointer",
          textAlign: "left",
          fontFamily: FONTS.body,
        }}
      >
        <span
          aria-hidden
          style={{
            width: 18,
            height: 18,
            borderRadius: "50%",
            border: `2px solid ${choice === "alt" ? COLORS.accent : COLORS.border}`,
            background: choice === "alt" ? COLORS.accent : "transparent",
            flexShrink: 0,
          }}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: COLORS.ink }}>Propose alternative dates to both</div>
          <div style={{ fontSize: 11.5, color: COLORS.inkMuted, marginTop: 2 }}>
            Suggest May 12 to Mango and May 16 to Atelier · we draft the messages
          </div>
        </div>
      </button>
    </DrawerShell>
  );
}

// ─── Talent-to-talent network (E4) ──────────────────────────────
//
// Lightweight network where talents follow each other, see who's working
// where, and trade casting recommendations. NOT a chat product — that
// would invite spam. Instead: read-only activity feed + one-click "I'm
// not free, try her" referral.

const NETWORK_TALENTS = [
  { id: "n1", name: "Sara Mendez", initials: "SM", category: "Editorial", lastSeen: "2d ago", booked: 12, mutuals: 3, follows: true },
  { id: "n2", name: "Lia Torres", initials: "LT", category: "Commercial", lastSeen: "Today", booked: 8, mutuals: 5, follows: true },
  { id: "n3", name: "Marco Vasquez", initials: "MV", category: "Runway", lastSeen: "1w ago", booked: 4, mutuals: 1, follows: false },
  { id: "n4", name: "Camille Roux", initials: "CR", category: "Editorial · Lifestyle", lastSeen: "Today", booked: 18, mutuals: 7, follows: false },
];

export function TalentNetworkDrawer() {
  const { state, closeDrawer, toast } = useProto();
  const open = state.drawer.drawerId === "talent-network";
  const [follows, setFollows] = useState<Record<string, boolean>>(
    () => Object.fromEntries(NETWORK_TALENTS.map((t) => [t.id, t.follows])),
  );
  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title="Your network"
      description="Talents you follow + suggested matches. Useful when you need to hand off a brief — one tap, fully attributed."
      width={620}
      footer={<SecondaryButton onClick={closeDrawer}>Close</SecondaryButton>}
    >
      <CapsLabel>Following · {Object.values(follows).filter(Boolean).length}</CapsLabel>
      <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6, marginBottom: 16 }}>
        {NETWORK_TALENTS.filter((t) => follows[t.id]).map((t) => (
          <NetworkRow
            key={t.id}
            t={t}
            following={true}
            onToggle={() => setFollows((p) => ({ ...p, [t.id]: !p[t.id] }))}
            onRefer={() => toast(`Referral note sent to ${t.name}`)}
          />
        ))}
      </div>
      <Divider label="Suggested · same category" />
      <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
        {NETWORK_TALENTS.filter((t) => !follows[t.id]).map((t) => (
          <NetworkRow
            key={t.id}
            t={t}
            following={false}
            onToggle={() => setFollows((p) => ({ ...p, [t.id]: true }))}
            onRefer={() => toast(`Follow ${t.name} first to refer`)}
          />
        ))}
      </div>
    </DrawerShell>
  );
}

function NetworkRow({
  t,
  following,
  onToggle,
  onRefer,
}: {
  t: typeof NETWORK_TALENTS[number];
  following: boolean;
  onToggle: () => void;
  onRefer: () => void;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "10px 12px",
        background: "#fff",
        border: `1px solid ${COLORS.borderSoft}`,
        borderRadius: 9,
        fontFamily: FONTS.body,
      }}
    >
      <Avatar initials={t.initials} size={32} tone="ink" />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: COLORS.ink }}>{t.name}</div>
        <div style={{ fontSize: 11.5, color: COLORS.inkMuted, marginTop: 1 }}>
          {t.category} · {t.booked} bookings · {t.mutuals} mutuals · {t.lastSeen}
        </div>
      </div>
      {following && (
        <SecondaryButton size="sm" onClick={onRefer}>Refer brief</SecondaryButton>
      )}
      <SecondaryButton size="sm" onClick={onToggle}>
        {following ? "Unfollow" : "Follow"}
      </SecondaryButton>
    </div>
  );
}

// ─── Voice replies (E5) ─────────────────────────────────────────
//
// Mobile-first hold-to-talk. Drawer shows the recording UI (waveform +
// transcript preview) and submits the audio + transcript to the inquiry
// as a normal message. Default privacy position taken: transcripts are
// stored alongside audio; talent can delete either independently.

export function TalentVoiceReplyDrawer() {
  const { state, closeDrawer, toast } = useProto();
  const open = state.drawer.drawerId === "talent-voice-reply";
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [done, setDone] = useState(false);

  return (
    <DrawerShell
      open={open}
      onClose={() => {
        closeDrawer();
        setTimeout(() => { setRecording(false); setSeconds(0); setDone(false); }, 200);
      }}
      title="Voice reply"
      description="Hold to talk · we transcribe automatically. Both audio + transcript go to the inquiry; you can delete either."
      width={460}
      footer={
        done ? (
          <>
            <SecondaryButton onClick={() => { setDone(false); setSeconds(0); }}>Re-record</SecondaryButton>
            <PrimaryButton onClick={() => { toast("Voice reply sent"); closeDrawer(); }}>
              Send reply
            </PrimaryButton>
          </>
        ) : (
          <SecondaryButton onClick={closeDrawer}>Cancel</SecondaryButton>
        )
      }
    >
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16, padding: "20px 0" }}>
        {!done ? (
          <button
            type="button"
            onPointerDown={() => { setRecording(true); setSeconds(0); }}
            onPointerUp={() => {
              if (recording) {
                setRecording(false);
                if (seconds > 0) setDone(true);
              }
            }}
            onPointerLeave={() => {
              if (recording) {
                setRecording(false);
                if (seconds > 0) setDone(true);
              }
            }}
            aria-label={recording ? "Recording — release to stop" : "Hold to record"}
            style={{
              width: 96,
              height: 96,
              borderRadius: "50%",
              background: recording ? COLORS.coral : COLORS.accent,
              border: "none",
              color: "#fff",
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: recording ? `0 0 0 12px rgba(194,106,69,0.18)` : `0 0 0 0 rgba(15,79,62,0)`,
              transition: `background ${TRANSITION.sm}, box-shadow .25s`,
            }}
          >
            <svg width={32} height={32} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <rect x="9" y="3" width="6" height="12" rx="3" />
              <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
            </svg>
          </button>
        ) : (
          <div
            style={{
              width: "100%",
              padding: "16px",
              background: "#fff",
              border: `1px solid ${COLORS.borderSoft}`,
              borderRadius: 12,
              fontFamily: FONTS.body,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <span aria-hidden style={{ width: 6, height: 6, borderRadius: "50%", background: COLORS.green }} />
              <CapsLabel>Transcript · {Math.max(seconds, 8)}s</CapsLabel>
            </div>
            <p style={{ margin: 0, fontSize: 13, color: COLORS.ink, lineHeight: 1.55 }}>
              "Hi Mango — yes, available May 14, day rate is twelve hundred euros. Sending quote now."
            </p>
            <div style={{ marginTop: 12, fontSize: 11.5, color: COLORS.inkMuted }}>
              Edit transcript before sending if you want — the audio still goes through as-is.
            </div>
          </div>
        )}
        {!done && (
          <div style={{ fontFamily: FONTS.body, fontSize: 13, color: COLORS.inkMuted, textAlign: "center" }}>
            {recording ? `Recording · ${seconds}s` : "Hold to record · max 60s"}
          </div>
        )}
      </div>
    </DrawerShell>
  );
}

// ─── Network plan multi-agency picker (X6) ──────────────────────
//
// For talents on the Network plan (workspace owner with multi-agency
// reach). Switches the active workspace context across agencies the
// talent owns — Studio → Agency upgrade picker if they want to add a
// new one. Default position on commission cross-routing: each agency
// keeps its own contracted rate; the picker is only about WHO sees the
// inquiry first, not who gets paid.

const MY_NETWORK_AGENCIES = [
  { id: "ag-acme", name: "Acme Models", role: "Owner", plan: "Agency", talents: 28, primary: true },
  { id: "ag-studio", name: "Studio Reyes", role: "Owner", plan: "Studio", talents: 6, primary: false },
  { id: "ag-bumble", name: "Bumble Talents (sub-roster)", role: "Coordinator", plan: "Free", talents: 4, primary: false },
];

export function TalentMultiAgencyPickerDrawer() {
  const { state, closeDrawer, toast } = useProto();
  const open = state.drawer.drawerId === "talent-multi-agency-picker";
  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title="Switch workspace"
      description="On the Network plan you can own multiple agencies. Each keeps its own roster + commission. Pick one to see its inbox."
      width={520}
      footer={
        <>
          <SecondaryButton onClick={closeDrawer}>Close</SecondaryButton>
          <PrimaryButton onClick={() => toast("Open Network plan upgrade")}>
            + New agency
          </PrimaryButton>
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {MY_NETWORK_AGENCIES.map((a) => (
          <button
            key={a.id}
            type="button"
            onClick={() => { toast(`Switched to ${a.name}`); closeDrawer(); }}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "12px 14px",
              background: "#fff",
              border: `1px solid ${a.primary ? COLORS.accent : COLORS.borderSoft}`,
              borderRadius: 10,
              fontFamily: FONTS.body,
              cursor: "pointer",
              textAlign: "left",
              position: "relative",
            }}
          >
            <Avatar initials={a.name.split(" ").map((n) => n[0]).join("")} size={32} tone="ink" />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: COLORS.ink }}>{a.name}</span>
                {a.primary && (
                  <span
                    style={{
                      fontSize: 9.5,
                      fontWeight: 700,
                      letterSpacing: 0.6,
                      textTransform: "uppercase",
                      color: COLORS.accentDeep,
                      background: COLORS.accentSoft,
                      padding: "2px 6px",
                      borderRadius: 999,
                    }}
                  >
                    Primary
                  </span>
                )}
              </div>
              <div style={{ fontSize: 11.5, color: COLORS.inkMuted, marginTop: 2 }}>
                {a.role} · {a.plan} plan · {a.talents} talents
              </div>
            </div>
            <Icon name="chevron-right" size={13} color={COLORS.inkDim} />
          </button>
        ))}
      </div>
      <div
        style={{
          marginTop: 16,
          padding: "12px 14px",
          background: COLORS.indigoSoft,
          border: `1px solid rgba(91,107,160,0.18)`,
          borderRadius: 10,
          fontFamily: FONTS.body,
          fontSize: 12,
          color: COLORS.indigoDeep,
          lineHeight: 1.5,
        }}
      >
        <strong style={{ fontWeight: 600 }}>Cross-agency commission:</strong>{" "}
        Each agency keeps its contracted rate. Switching workspace doesn't move money — it's only about who sees what inbox.
      </div>
    </DrawerShell>
  );
}

// ─── Chat archive (F8) ──────────────────────────────────────────
//
// Closed-booking → "Download chat" generates a PDF mock with the full
// thread + attachments index. Useful for talents who want a record of
// what was agreed before contract.

/**
 * Audit #53 — reply templates drawer. Pre-written common responses
 * the talent can insert with one click. Edit before send. The list is
 * mock; production reads from `talent_reply_templates` table.
 */
const REPLY_TEMPLATES = [
  { id: "rt1", title: "Yes — confirm availability", body: "Hi! Yes — I'm available on the dates you mentioned. Sending availability and rate card. Looking forward to hearing more about the brief." },
  { id: "rt2", title: "Need more info", body: "Hi — thanks for reaching out. Before I confirm, could you share: usage scope, location, hair/makeup, and call time? Happy to move quickly once I have those." },
  { id: "rt3", title: "Polite decline — rate", body: "Thank you for thinking of me. Unfortunately the rate offered isn't aligned with my current bookings. Happy to revisit if there's flexibility." },
  { id: "rt4", title: "Polite decline — schedule", body: "Thank you so much for the offer. Unfortunately I'm already booked on those dates. Hope we can work together soon." },
  { id: "rt5", title: "Hold response", body: "Got it — happy to hold these dates for 48h. If you need more time, just let me know and I'll see what I can do." },
];

export function ReplyTemplatesDrawer() {
  const { state, closeDrawer, toast } = useProto();
  const open = state.drawer.drawerId === "reply-templates";
  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title="Reply with template"
      description="Tap a template to insert it into the reply box. You can still edit before sending."
      width={560}
      footer={
        <>
          <SecondaryButton onClick={() => toast("New template — coming soon")}>+ New template</SecondaryButton>
          <SecondaryButton onClick={closeDrawer}>Close</SecondaryButton>
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {REPLY_TEMPLATES.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => { toast(`Template inserted · "${t.title}"`); closeDrawer(); }}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "stretch",
              gap: 4,
              padding: "12px 14px",
              background: "#fff",
              border: `1px solid ${COLORS.borderSoft}`,
              borderRadius: 10,
              fontFamily: FONTS.body,
              cursor: "pointer",
              textAlign: "left",
              transition: `border-color ${TRANSITION.micro}`,
            }}
            onMouseEnter={(e) => (e.currentTarget.style.borderColor = COLORS.accent)}
            onMouseLeave={(e) => (e.currentTarget.style.borderColor = COLORS.borderSoft)}
          >
            <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.ink }}>{t.title}</div>
            <div style={{ fontSize: 11.5, color: COLORS.inkMuted, marginTop: 2, lineHeight: 1.5 }}>
              {t.body.length > 120 ? `${t.body.slice(0, 118)}…` : t.body}
            </div>
          </button>
        ))}
      </div>
    </DrawerShell>
  );
}

export function TalentChatArchiveDrawer() {
  const { state, closeDrawer, toast } = useProto();
  const open = state.drawer.drawerId === "talent-chat-archive";
  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title="Archive this thread"
      description="Generate a timestamped PDF with the full message history + attachments index. Yours to keep — outside Tulala."
      width={520}
      footer={
        <>
          <SecondaryButton onClick={closeDrawer}>Cancel</SecondaryButton>
          <PrimaryButton onClick={() => { toast("Chat archive · ready in your inbox"); closeDrawer(); }}>
            Generate PDF
          </PrimaryButton>
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <KvRow label="Thread" value="Mango · Spring campaign" />
        <KvRow label="Messages" value="42 · April 2 to April 19" />
        <KvRow label="Attachments" value="3 files · 2 PDFs + 1 image" />
        <KvRow label="Format" value="PDF · sealed timestamp" />
        <Divider label="Includes" />
        <ul style={{ margin: 0, paddingLeft: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 6 }}>
          {[
            "Full message history with timestamps + sender labels",
            "All client + agency replies in original order",
            "Attachment index with filenames + upload dates",
            "Booking summary card (dates, rate, scope, status)",
          ].map((line, idx) => (
            <li key={idx} style={{ display: "flex", alignItems: "flex-start", gap: 8, fontFamily: FONTS.body, fontSize: 12.5, color: COLORS.ink }}>
              <span style={{ marginTop: 4, width: 4, height: 4, borderRadius: "50%", background: COLORS.green, flexShrink: 0 }} />
              {line}
            </li>
          ))}
        </ul>
        <div
          style={{
            marginTop: 4,
            padding: "10px 12px",
            background: "rgba(46,125,91,0.08)",
            border: `1px solid rgba(46,125,91,0.20)`,
            borderRadius: 8,
            fontFamily: FONTS.body,
            fontSize: 11.5,
            color: COLORS.green,
            lineHeight: 1.5,
          }}
        >
          The PDF is generated server-side and signed with a timestamp hash — useful as evidence if there's a dispute.
        </div>
      </div>
    </DrawerShell>
  );
}

// ─── Earnings detail ────────────────────────────────────────────

export function TalentEarningsDetailDrawer() {
  const { state, closeDrawer } = useProto();
  const open = state.drawer.drawerId === "talent-earnings-detail";
  const id = (state.drawer.payload?.id as string) ?? "e1";
  const e = EARNINGS_ROWS.find((x) => x.id === id) ?? EARNINGS_ROWS[0];
  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title={`${e.client} · ${e.amount}`}
      description={`Paid ${e.payoutDate} via ${e.agency}`}
      width={520}
      footer={<SecondaryButton onClick={closeDrawer}>Close</SecondaryButton>}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <KvRow label="Work date" value={e.workDate} />
        <KvRow label="Paid on" value={e.payoutDate} />
        <KvRow label="Agency" value={e.agency} />
        <KvRow label="Client" value={e.client} />
        <KvRow label="Gross" value={e.amount} />
        <KvRow label="Agency cut" value="20%" />
        <KvRow label="Net to you" value={netOf(e.amount)} />
        <Divider label="Documents" />
        <button
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "10px 14px",
            background: "#fff",
            border: `1px solid ${COLORS.borderSoft}`,
            borderRadius: 10,
            fontFamily: FONTS.body,
            fontSize: 13,
            color: COLORS.ink,
            cursor: "pointer",
            textAlign: "left",
            width: "100%",
          }}
        >
          <Icon name="external" size={13} />
          Booking contract.pdf
          <span style={{ marginLeft: "auto", color: COLORS.inkMuted, fontSize: 11.5 }}>2 pages</span>
        </button>
        <button
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "10px 14px",
            background: "#fff",
            border: `1px solid ${COLORS.borderSoft}`,
            borderRadius: 10,
            fontFamily: FONTS.body,
            fontSize: 13,
            color: COLORS.ink,
            cursor: "pointer",
            textAlign: "left",
            width: "100%",
          }}
        >
          <Icon name="external" size={13} />
          Payout statement.pdf
          <span style={{ marginLeft: "auto", color: COLORS.inkMuted, fontSize: 11.5 }}>1 page</span>
        </button>
      </div>
    </DrawerShell>
  );
}

function netOf(gross: string): string {
  const num = parseFloat(gross.replace(/[^0-9.]/g, "")) || 0;
  const symbol = gross.match(/[^0-9.,\s]/)?.[0] ?? "€";
  return `${symbol}${Math.round(num * 0.8).toLocaleString()}`;
}

// ════════════════════════════════════════════════════════════════════
// EXPANDED PROFILE DRAWERS
// ────────────────────────────────────────────────────────────────────
//   These 14 drawers back the new MyProfilePage bands:
//   visual identity · physicality · capability · history · trust ·
//   commercial · public preview.
//
//   Pattern: DrawerShell + useSaveAndClose + StandardFooter,
//   matching the rest of the talent surface.
// ════════════════════════════════════════════════════════════════════

// ─── Photo edit (cover or headshot) ───────────────────────────────

export function TalentPhotoEditDrawer() {
  const { state, closeDrawer, toast } = useProto();
  const open = state.drawer.drawerId === "talent-photo-edit";
  const which = (state.drawer.payload?.which as "cover" | "headshot") ?? "headshot";
  const isCover = which === "cover";
  const onSave = useSaveAndClose(`${isCover ? "Cover photo" : "Headshot"} updated · agencies notified`);

  const swatches = isCover
    ? ["🌅", "🌊", "🏔️", "🌆", "🏝️", "🌃", "🌌", "🌇"]
    : ["🌸", "🌷", "🌹", "🪷", "🌺", "🌻", "🌼", "🌿"];

  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title={isCover ? "Replace cover photo" : "Replace headshot"}
      description={
        isCover
          ? "1600 × 480 minimum. Wide horizon shots work best — your headshot will overlap the lower edge."
          : "Square crop. Faces forward, daylight, neutral background — the same headshot used on your comp card."
      }
      width={560}
      footer={<StandardFooter onSave={onSave} saveLabel="Use selection" />}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div
          style={{
            background: COLORS.surfaceAlt,
            border: `1px solid rgba(15,79,62,0.18)`,
            borderRadius: 12,
            padding: 14,
            display: "flex",
            alignItems: "center",
            gap: 12,
          }}
        >
          <div
            style={{
              width: isCover ? 96 : 64,
              height: 64,
              background: "#fff",
              borderRadius: isCover ? 8 : "50%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 32,
              border: `1px solid ${COLORS.borderSoft}`,
            }}
          >
            {isCover ? MY_TALENT_PROFILE.coverPhoto : MY_TALENT_PROFILE.profilePhoto}
          </div>
          <div>
            <div style={{ fontFamily: FONTS.body, fontSize: 12, color: COLORS.inkMuted }}>Currently using</div>
            <div style={{ fontFamily: FONTS.body, fontSize: 13.5, color: COLORS.ink, marginTop: 2 }}>
              {isCover ? "Sunset over a coastline · uploaded Apr 12" : "Pink florals · uploaded Mar 28"}
            </div>
          </div>
        </div>
        <FieldRow label="Upload" hint="JPG / PNG / HEIC up to 12 MB. We'll auto-crop and generate retina sizes.">
          <button
            onClick={() => toast("Upload picker — coming soon")}
            style={{
              padding: "16px 14px",
              background: "rgba(11,11,13,0.02)",
              border: `1px dashed rgba(11,11,13,0.18)`,
              borderRadius: 10,
              fontFamily: FONTS.body,
              fontSize: 13,
              color: COLORS.inkMuted,
              cursor: "pointer",
              textAlign: "center",
            }}
          >
            Drop a file or click to upload
          </button>
        </FieldRow>
        <Divider label="Or pick a placeholder" />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
          {swatches.map((s, i) => (
            <button
              key={i}
              onClick={() => toast(`${isCover ? "Cover" : "Headshot"} placeholder selected`)}
              style={{
                aspectRatio: isCover ? "16 / 9" : "1 / 1",
                background: COLORS.surfaceAlt,
                border: `1px solid ${COLORS.borderSoft}`,
                borderRadius: 8,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 28,
                cursor: "pointer",
              }}
            >
              {s}
            </button>
          ))}
        </div>
        {!isCover && (
          <>
            <Divider label="Crop guide" />
            <ul
              style={{
                margin: 0,
                paddingLeft: 18,
                fontFamily: FONTS.body,
                fontSize: 12.5,
                color: COLORS.inkMuted,
                lineHeight: 1.7,
              }}
            >
              <li>Eyes on the upper third</li>
              <li>Neutral or daylight background</li>
              <li>No filters or heavy retouch — agencies use this to verify identity</li>
            </ul>
          </>
        )}
      </div>
    </DrawerShell>
  );
}

// ─── Polaroids ───────────────────────────────────────────────────

export function TalentPolaroidsDrawer() {
  const { state, closeDrawer, toast } = useProto();
  const open = state.drawer.drawerId === "talent-polaroids";
  const onSave = useSaveAndClose("Polaroid set updated");

  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title="Polaroid set"
      description="Industry standard: 5 angles, no styling, daylight. Clients use polaroids to verify what you actually look like in person."
      width={560}
      footer={<StandardFooter onSave={onSave} saveLabel="Save set" />}
    >
      <div
        style={{
          padding: "12px 14px",
          background: COLORS.surfaceAlt,
          border: `1px solid rgba(15,79,62,0.18)`,
          borderRadius: 10,
          marginBottom: 14,
          display: "flex",
          alignItems: "center",
          gap: 10,
        }}
      >
        <Icon name="info" size={14} color={COLORS.accentDeep} />
        <span style={{ fontFamily: FONTS.body, fontSize: 12.5, color: COLORS.ink }}>
          Refresh every 3 months · before / after major haircuts · weight changes ≥ 4 kg.
        </span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
        {POLAROID_SET.map((p) => (
          <div
            key={p.id}
            style={{
              border: `1px solid ${p.updatedAgo === "missing" ? COLORS.red : COLORS.borderSoft}`,
              borderRadius: 10,
              overflow: "hidden",
              background: "#fff",
            }}
          >
            <div
              style={{
                aspectRatio: "3 / 4",
                background: COLORS.surfaceAlt,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 36,
                color: p.thumb === "—" ? COLORS.inkDim : "inherit",
              }}
            >
              {p.thumb}
            </div>
            <div style={{ padding: "8px 10px" }}>
              <div style={{ fontFamily: FONTS.body, fontSize: 12.5, fontWeight: 500, color: COLORS.ink }}>
                {p.angle}
              </div>
              <div
                style={{
                  fontFamily: FONTS.body,
                  fontSize: 11,
                  color: p.updatedAgo === "missing" ? COLORS.red : COLORS.inkMuted,
                  marginTop: 2,
                }}
              >
                {p.updatedAgo === "missing" ? "Missing — upload now" : `Updated ${p.updatedAgo} ago`}
              </div>
            </div>
          </div>
        ))}
      </div>
      <button
        onClick={() => toast("Bulk uploader — coming soon")}
        style={{
          marginTop: 14,
          padding: "12px 14px",
          width: "100%",
          background: "rgba(11,11,13,0.02)",
          border: `1px dashed rgba(11,11,13,0.18)`,
          borderRadius: 10,
          fontFamily: FONTS.body,
          fontSize: 13,
          color: COLORS.inkMuted,
          cursor: "pointer",
        }}
      >
        Replace all 5 in a single shoot
      </button>
    </DrawerShell>
  );
}

// ─── Credits ─────────────────────────────────────────────────────

export function TalentCreditsDrawer() {
  const { state, closeDrawer, toast } = useProto();
  const open = state.drawer.drawerId === "talent-credits";
  const onSave = useSaveAndClose("Credits updated");
  const credits = MY_TALENT_PROFILE.credits;

  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title="Credits & tearsheets"
      description="Your work history. Pin up to 3 — they show first to clients. Add new credits as bookings wrap."
      width={620}
      footer={
        <>
          <SecondaryButton onClick={() => toast("New credit form — coming soon")}>+ Add credit</SecondaryButton>
          <StandardFooter onSave={onSave} saveLabel="Save order" />
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {credits.map((c) => (
          <div
            key={c.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "12px 14px",
              background: "#fff",
              border: `1px solid ${COLORS.borderSoft}`,
              borderRadius: 10,
            }}
          >
            <span
              style={{
                width: 56,
                fontFamily: FONTS.mono,
                fontSize: 11,
                color: COLORS.inkMuted,
              }}
            >
              {c.year}
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: FONTS.body, fontSize: 13.5, fontWeight: 500, color: COLORS.ink }}>
                {c.brand}
                {c.pinned && <span style={{ color: COLORS.accentDeep, marginLeft: 6 }}>★</span>}
              </div>
              <div style={{ fontFamily: FONTS.body, fontSize: 11.5, color: COLORS.inkMuted, marginTop: 2 }}>
                {c.type}
                {c.role && <> · {c.role}</>}
                {c.credit && <> · {c.credit}</>}
              </div>
            </div>
            <button
              onClick={() => toast(c.pinned ? "Unpinned" : "Pinned to top")}
              style={{
                background: "transparent",
                border: `1px solid ${COLORS.borderSoft}`,
                color: c.pinned ? COLORS.accentDeep : COLORS.inkMuted,
                padding: "6px 10px",
                borderRadius: 6,
                fontFamily: FONTS.body,
                fontSize: 11.5,
                cursor: "pointer",
              }}
            >
              {c.pinned ? "★ Pinned" : "Pin"}
            </button>
          </div>
        ))}
      </div>
    </DrawerShell>
  );
}

// ─── Skills ─────────────────────────────────────────────────────

export function TalentSkillsDrawer() {
  const { state, closeDrawer, toast } = useProto();
  const open = state.drawer.drawerId === "talent-skills";
  const onSave = useSaveAndClose("Skills updated");
  const skills = MY_TALENT_PROFILE.skills;

  const grouped: Record<string, typeof skills> = {};
  for (const s of skills) {
    grouped[s.category] = grouped[s.category] || [];
    grouped[s.category].push(s);
  }

  const categoryLabels: Record<string, string> = {
    movement: "Movement",
    voice: "Voice",
    instrument: "Instruments",
    sport: "Sports",
    performance: "Performance",
    other: "Other",
  };

  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title="Skills"
      description="Movement, voice, sports, instruments — anything a client might cast for. Honesty matters more than completeness."
      width={560}
      footer={
        <>
          <SecondaryButton onClick={() => toast("Add-skill picker — coming soon")}>+ Add skill</SecondaryButton>
          <StandardFooter onSave={onSave} />
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {Object.keys(grouped).map((cat) => (
          <div key={cat}>
            <CapsLabel>{categoryLabels[cat] ?? cat}</CapsLabel>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 6 }}>
              {grouped[cat].map((s, i) => (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "10px 12px",
                    background: "#fff",
                    border: `1px solid ${COLORS.borderSoft}`,
                    borderRadius: 8,
                  }}
                >
                  <span style={{ flex: 1, fontFamily: FONTS.body, fontSize: 13, color: COLORS.ink }}>
                    {s.label}
                  </span>
                  {s.level && (
                    <span style={{ fontFamily: FONTS.body, fontSize: 11.5, color: COLORS.inkMuted }}>
                      {s.level}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </DrawerShell>
  );
}

// ─── Limits ─────────────────────────────────────────────────────

export function TalentLimitsDrawer() {
  const { state, closeDrawer, toast } = useProto();
  const open = state.drawer.drawerId === "talent-limits";
  const onSave = useSaveAndClose("Limits saved · agencies notified");
  const limits = MY_TALENT_PROFILE.limits;

  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title="Wardrobe & lifestyle limits"
      description="Hard limits block any pitch with that brief. Soft limits trigger an extra confirmation step before you're put forward."
      width={560}
      footer={
        <>
          <SecondaryButton onClick={() => toast("Add-limit form — coming soon")}>+ Add limit</SecondaryButton>
          <StandardFooter onSave={onSave} />
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {limits.map((l) => (
          <div
            key={l.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "12px 14px",
              background: "#fff",
              border: `1px solid ${COLORS.borderSoft}`,
              borderRadius: 10,
            }}
          >
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: l.enforcement === "hard" ? COLORS.red : COLORS.amber,
                flexShrink: 0,
              }}
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: FONTS.body, fontSize: 13.5, color: COLORS.ink, fontWeight: 500 }}>
                {l.label}
              </div>
              <div style={{ fontFamily: FONTS.body, fontSize: 11.5, color: COLORS.inkMuted, marginTop: 2, textTransform: "capitalize" }}>
                {l.category} · {l.enforcement === "hard" ? "Hard limit" : "Needs confirmation"}
              </div>
            </div>
            <button
              onClick={() => toast("Limit removed")}
              style={{
                background: "transparent",
                border: "none",
                color: COLORS.inkMuted,
                fontFamily: FONTS.body,
                fontSize: 11.5,
                cursor: "pointer",
              }}
            >
              Remove
            </button>
          </div>
        ))}
      </div>
      <div
        style={{
          marginTop: 14,
          padding: "12px 14px",
          background: COLORS.surfaceAlt,
          border: `1px solid rgba(15,79,62,0.18)`,
          borderRadius: 10,
          fontFamily: FONTS.body,
          fontSize: 12.5,
          color: COLORS.ink,
          lineHeight: 1.55,
        }}
      >
        Agencies on Tulala are contractually bound to honour your limits. If a client brief
        violates a hard limit, the offer is auto-blocked before it ever reaches your inbox.
      </div>
    </DrawerShell>
  );
}

// ─── Rate card ──────────────────────────────────────────────────

export function TalentRateCardDrawer() {
  const { state, closeDrawer } = useProto();
  const open = state.drawer.drawerId === "talent-rate-card";
  const onSave = useSaveAndClose("Rate card saved");
  const rc = MY_TALENT_PROFILE.rateCard;
  const [vis, setVis] = useState(rc.visibility);

  const visOptions: Array<{ value: typeof rc.visibility; label: string; hint: string }> = [
    { value: "public", label: "Public", hint: "Shown on your public profile to anyone." },
    { value: "agency-only", label: "Agency only", hint: "Only your agencies and confirmed clients see ranges." },
    { value: "on-request", label: "On request", hint: "Hidden — clients have to inquire to get a quote." },
  ];

  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title="Rate card"
      description="Reference ranges, not final fees. The actual offer is per-booking and includes usage."
      width={580}
      footer={<StandardFooter onSave={onSave} saveLabel="Save rate card" />}
    >
      <CapsLabel>Visibility</CapsLabel>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 6, marginBottom: 16 }}>
        {visOptions.map((o) => (
          <button
            key={o.value}
            onClick={() => setVis(o.value)}
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 10,
              padding: "10px 12px",
              background: vis === o.value ? COLORS.surfaceAlt : "#fff",
              border: `1px solid ${vis === o.value ? "rgba(15,79,62,0.32)" : COLORS.borderSoft}`,
              borderRadius: 10,
              cursor: "pointer",
              textAlign: "left",
            }}
          >
            <span
              style={{
                width: 14,
                height: 14,
                borderRadius: "50%",
                border: `1.5px solid ${vis === o.value ? COLORS.accentDeep : COLORS.inkMuted}`,
                background: vis === o.value ? COLORS.accentDeep : "transparent",
                flexShrink: 0,
                marginTop: 2,
              }}
            />
            <div>
              <div style={{ fontFamily: FONTS.body, fontSize: 13, fontWeight: 500, color: COLORS.ink }}>
                {o.label}
              </div>
              <div style={{ fontFamily: FONTS.body, fontSize: 11.5, color: COLORS.inkMuted, marginTop: 2 }}>
                {o.hint}
              </div>
            </div>
          </button>
        ))}
      </div>
      <Divider label="Rate lines" />
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
        {rc.lines.map((line, i) => (
          <div
            key={i}
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 160px",
              gap: 8,
              padding: "10px 12px",
              background: "#fff",
              border: `1px solid ${COLORS.borderSoft}`,
              borderRadius: 8,
            }}
          >
            <div>
              <div style={{ fontFamily: FONTS.body, fontSize: 13, color: COLORS.ink, fontWeight: 500 }}>
                {line.label}
              </div>
              {line.note && (
                <div style={{ fontFamily: FONTS.body, fontSize: 11, color: COLORS.inkMuted, marginTop: 2 }}>
                  {line.note}
                </div>
              )}
            </div>
            <div
              style={{
                fontFamily: FONTS.mono,
                fontSize: 12.5,
                color: COLORS.ink,
                textAlign: "right",
                alignSelf: "center",
              }}
            >
              {line.range}
            </div>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 14 }}>
        <FieldRow label="Usage policy" hint="One sentence on what's included and what triggers an upcharge.">
          <TextArea defaultValue={rc.usagePolicy} rows={3} />
        </FieldRow>
      </div>
    </DrawerShell>
  );
}

// ─── Travel & work auth ─────────────────────────────────────────

export function TalentTravelDrawer() {
  const { state, closeDrawer } = useProto();
  const open = state.drawer.drawerId === "talent-travel";
  const onSave = useSaveAndClose("Travel preferences saved");
  const t = MY_TALENT_PROFILE.travel;

  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title="Travel & work authorization"
      description="What countries can book you without visa drama, plus how far you'll fly for a job."
      width={560}
      footer={<StandardFooter onSave={onSave} />}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <FieldRow label="Based in">
          <TextInput defaultValue={t.basedIn} />
        </FieldRow>
        <FieldRow label="Willing to travel" hint="City · country · region · global.">
          <TextInput defaultValue={t.willingTravel} />
        </FieldRow>
        <FieldRow label="Home radius" optional hint="How fast can you arrive? Same-day, 24h, weekend?">
          <TextInput defaultValue={t.homeRadius ?? ""} />
        </FieldRow>
        <FieldRow label="Preferred travel class" optional>
          <TextInput defaultValue={t.preferredClass ?? "economy"} />
        </FieldRow>
        <Divider label="Work authorization" />
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {t.workAuth.map((w, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "10px 12px",
                background: "#fff",
                border: `1px solid ${COLORS.borderSoft}`,
                borderRadius: 8,
              }}
            >
              <Icon name="check" size={12} color={COLORS.green} />
              <span style={{ fontFamily: FONTS.body, fontSize: 13, color: COLORS.ink, flex: 1 }}>{w}</span>
            </div>
          ))}
        </div>
        <Divider label="Passports" />
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {t.passports.map((p, i) => (
            <span
              key={i}
              style={{
                padding: "5px 10px",
                background: COLORS.surfaceAlt,
                border: `1px solid rgba(15,79,62,0.24)`,
                borderRadius: 999,
                fontFamily: FONTS.body,
                fontSize: 12,
                color: COLORS.ink,
              }}
            >
              {p}
            </span>
          ))}
        </div>
        {t.lastTrip && (
          <div style={{ fontFamily: FONTS.body, fontSize: 12, color: COLORS.inkMuted }}>
            Last trip: {t.lastTrip}
          </div>
        )}
      </div>
    </DrawerShell>
  );
}

// ─── External links ─────────────────────────────────────────────

export function TalentLinksDrawer() {
  const { state, closeDrawer, toast } = useProto();
  const open = state.drawer.drawerId === "talent-links";
  const onSave = useSaveAndClose("Links saved");
  const links = MY_TALENT_PROFILE.links;

  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title="External links"
      description="Social, IMDb, personal site. Follower counts auto-refresh weekly when you connect the account."
      width={560}
      footer={
        <>
          <SecondaryButton onClick={() => toast("Connect account flow in production")}>+ Connect account</SecondaryButton>
          <StandardFooter onSave={onSave} />
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {links.map((l, i) => (
          <div
            key={i}
            style={{
              display: "grid",
              gridTemplateColumns: "auto 1fr auto",
              alignItems: "center",
              gap: 12,
              padding: "12px 14px",
              background: "#fff",
              border: `1px solid ${COLORS.borderSoft}`,
              borderRadius: 10,
            }}
          >
            <span
              style={{
                fontFamily: FONTS.body,
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: 1.2,
                textTransform: "uppercase",
                color: COLORS.inkMuted,
                width: 80,
              }}
            >
              {l.kind}
            </span>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontFamily: FONTS.body, fontSize: 13, color: COLORS.ink, fontWeight: 500 }}>
                {l.label}
              </div>
              <div style={{ fontFamily: FONTS.mono, fontSize: 11, color: COLORS.inkMuted, marginTop: 2 }}>
                {l.url}
              </div>
            </div>
            {l.followers ? (
              <span
                style={{
                  fontFamily: FONTS.body,
                  fontSize: 11.5,
                  color: COLORS.inkMuted,
                }}
              >
                {l.followers}
              </span>
            ) : (
              <span style={{ fontFamily: FONTS.body, fontSize: 11.5, color: COLORS.inkDim }}>—</span>
            )}
          </div>
        ))}
      </div>
    </DrawerShell>
  );
}

// ─── Reviews ────────────────────────────────────────────────────

export function TalentReviewsDrawer() {
  const { state, closeDrawer } = useProto();
  const open = state.drawer.drawerId === "talent-reviews";
  const reviews = MY_TALENT_PROFILE.reviews;
  const stats = MY_TALENT_PROFILE.bookingStats;
  const avg = reviews.reduce((a, r) => a + r.rating, 0) / Math.max(reviews.length, 1);

  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title="Reviews & endorsements"
      description="Producers and creative directors can leave a review after a wrap. They're verified — no anonymous critiques."
      width={580}
      footer={<SecondaryButton onClick={closeDrawer}>Close</SecondaryButton>}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 8,
          marginBottom: 16,
        }}
      >
        <SummaryStat label="Average" value={`${avg.toFixed(1)} / 5`} accent="green" />
        <SummaryStat label="Reviews" value={String(reviews.length)} accent="ink" />
        <SummaryStat label="On-time rate" value={`${stats.onTimeRate}%`} accent="green" />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {reviews.map((r) => (
          <div
            key={r.id}
            style={{
              padding: "14px 16px",
              background: "#fff",
              border: `1px solid ${COLORS.borderSoft}`,
              borderRadius: 10,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <span style={{ color: COLORS.accentDeep, fontSize: 13 }}>
                {"★".repeat(r.rating)}
                <span style={{ color: COLORS.inkDim }}>{"★".repeat(5 - r.rating)}</span>
              </span>
              <span style={{ fontFamily: FONTS.body, fontSize: 11.5, color: COLORS.inkMuted, marginLeft: "auto" }}>
                {r.shootDate}
              </span>
            </div>
            <p style={{ margin: 0, fontFamily: FONTS.body, fontSize: 13.5, color: COLORS.ink, lineHeight: 1.55 }}>
              "{r.body}"
            </p>
            <div style={{ marginTop: 8, fontFamily: FONTS.body, fontSize: 11.5, color: COLORS.inkMuted }}>
              — {r.reviewerName} · {r.reviewerRole} · {r.brand}
            </div>
          </div>
        ))}
      </div>
    </DrawerShell>
  );
}

function SummaryStat({ label, value, accent }: { label: string; value: string; accent: "green" | "ink" | "amber" }) {
  const tone = accent === "green" ? COLORS.green : accent === "amber" ? COLORS.amber : COLORS.ink;
  return (
    <div
      style={{
        padding: "12px 14px",
        background: "#fff",
        border: `1px solid ${COLORS.borderSoft}`,
        borderRadius: 10,
      }}
    >
      <div
        style={{
          fontFamily: FONTS.body,
          fontSize: 10.5,
          fontWeight: 600,
          letterSpacing: 1.2,
          textTransform: "uppercase",
          color: COLORS.inkMuted,
        }}
      >
        {label}
      </div>
      <div style={{ fontFamily: FONTS.display, fontSize: 18, color: tone, marginTop: 4 }}>{value}</div>
    </div>
  );
}

// ─── Showreel ───────────────────────────────────────────────────

export function TalentShowreelDrawer() {
  const { state, closeDrawer, toast } = useProto();
  const open = state.drawer.drawerId === "talent-showreel";
  const p = MY_TALENT_PROFILE;

  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title="Showreel"
      description={`${p.showreelDuration ?? "0:42"} · A 30–45 sec clip of you on camera. Casting directors love these.`}
      width={620}
      footer={
        <>
          <SecondaryButton onClick={() => toast("Replace showreel flow in production")}>Replace clip</SecondaryButton>
          <PrimaryButton onClick={closeDrawer}>Close</PrimaryButton>
        </>
      }
    >
      <div
        style={{
          aspectRatio: "16 / 9",
          background: COLORS.surfaceAlt,
          borderRadius: 12,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 96,
          border: `1px solid ${COLORS.borderSoft}`,
          marginBottom: 16,
          position: "relative",
        }}
      >
        {p.showreelThumb ?? "🎞️"}
        <button
          onClick={() => toast("Showreel plays in production")}
          style={{
            position: "absolute",
            inset: 0,
            background: "transparent",
            border: "none",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <span
            style={{
              width: 60,
              height: 60,
              borderRadius: "50%",
              background: "rgba(11,11,13,0.78)",
              color: "#fff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 22,
            }}
          >
            ▶
          </span>
        </button>
      </div>
      <Divider label="Why a showreel" />
      <ul style={{ margin: 0, paddingLeft: 18, fontFamily: FONTS.body, fontSize: 13, color: COLORS.ink, lineHeight: 1.7 }}>
        <li>Speaking voice + accent for any TV/voiceover briefs</li>
        <li>Range of expression beyond what a still shows</li>
        <li>Movement quality — walking, turning, gesture</li>
        <li>Natural light + tight crop is fine. No need for a studio piece.</li>
      </ul>
    </DrawerShell>
  );
}

// ─── Measurements ───────────────────────────────────────────────

export function TalentMeasurementsDrawer() {
  const { state, closeDrawer } = useProto();
  const open = state.drawer.drawerId === "talent-measurements";
  const onSave = useSaveAndClose("Measurements saved · agencies notified");
  const m = MY_TALENT_PROFILE.measurements;

  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title="Measurements"
      description="Your full comp card. Re-measure every 6 months — accurate stats prevent fitting reshoots."
      width={580}
      footer={<StandardFooter onSave={onSave} saveLabel="Save measurements" />}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div
          style={{
            padding: "12px 14px",
            background: COLORS.surfaceAlt,
            border: `1px solid rgba(15,79,62,0.18)`,
            borderRadius: 10,
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          <Icon name="info" size={14} color={COLORS.accentDeep} />
          <span style={{ fontFamily: FONTS.body, fontSize: 12.5, color: COLORS.ink }}>
            Sensitive data. Public visibility is controlled in Privacy settings.
          </span>
        </div>
        <Divider label="Body" />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <FieldRow label="Height (Imperial)">
            <TextInput defaultValue={m.heightImperial} />
          </FieldRow>
          <FieldRow label="Height (Metric)">
            <TextInput defaultValue={m.heightMetric} />
          </FieldRow>
          <FieldRow label="Bust">
            <TextInput defaultValue={m.bust} />
          </FieldRow>
          <FieldRow label="Waist">
            <TextInput defaultValue={m.waist} />
          </FieldRow>
          <FieldRow label="Hips">
            <TextInput defaultValue={m.hips} />
          </FieldRow>
          <FieldRow label="Inseam" optional>
            <TextInput defaultValue={m.inseam ?? ""} />
          </FieldRow>
          <FieldRow label="Dress">
            <TextInput defaultValue={m.dress} />
          </FieldRow>
          <FieldRow label="Suit" optional>
            <TextInput defaultValue={m.suit ?? ""} />
          </FieldRow>
        </div>
        <Divider label="Shoes" />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
          <FieldRow label="EU">
            <TextInput defaultValue={m.shoeEU} />
          </FieldRow>
          <FieldRow label="US">
            <TextInput defaultValue={m.shoeUS} />
          </FieldRow>
          <FieldRow label="UK">
            <TextInput defaultValue={m.shoeUK} />
          </FieldRow>
        </div>
        <Divider label="Features" />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <FieldRow label="Hair colour">
            <TextInput defaultValue={m.hairColor} />
          </FieldRow>
          <FieldRow label="Hair length">
            <TextInput defaultValue={m.hairLength} />
          </FieldRow>
          <FieldRow label="Eye colour">
            <TextInput defaultValue={m.eyeColor} />
          </FieldRow>
          <FieldRow label="Skin tone">
            <TextInput defaultValue={m.skinTone} />
          </FieldRow>
        </div>
        <FieldRow label="Tattoos" hint={m.hasTattoos ? "Visible · note location and coverability." : "None."}>
          <TextInput defaultValue={m.tattoosNote ?? ""} />
        </FieldRow>
        <FieldRow label="Piercings" hint={m.hasPiercings ? "Visible piercings only." : "None."}>
          <TextInput defaultValue={m.piercingsNote ?? ""} />
        </FieldRow>
        <FieldRow label="Scars / marks" optional>
          <TextInput defaultValue={m.scarsNote ?? ""} />
        </FieldRow>
      </div>
    </DrawerShell>
  );
}

// ─── Documents ──────────────────────────────────────────────────

export function TalentDocumentsDrawer() {
  const { state, closeDrawer, toast } = useProto();
  const open = state.drawer.drawerId === "talent-documents";
  const onSave = useSaveAndClose("Documents saved");
  const docs = MY_TALENT_PROFILE.documents;

  const stateMeta: Record<string, { color: string; label: string }> = {
    uploaded: { color: COLORS.green, label: "Uploaded" },
    missing: { color: COLORS.red, label: "Missing" },
    expired: { color: COLORS.amber, label: "Expired" },
  };

  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title="Documents"
      description="ID, tax forms, certifications. Stored encrypted. Visible only to your agency's admin team."
      width={560}
      footer={<StandardFooter onSave={onSave} />}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {docs.map((d) => {
          const meta = stateMeta[d.state];
          return (
            <div
              key={d.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "12px 14px",
                background: "#fff",
                border: `1px solid ${COLORS.borderSoft}`,
                borderRadius: 10,
              }}
            >
              <Icon name="external" size={14} color={COLORS.inkMuted} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: FONTS.body, fontSize: 13, color: COLORS.ink, fontWeight: 500 }}>
                  {d.label}
                </div>
                <div style={{ fontFamily: FONTS.body, fontSize: 11.5, color: COLORS.inkMuted, marginTop: 2 }}>
                  {meta.label}
                  {d.expiresOn && d.state === "uploaded" && <> · expires {d.expiresOn}</>}
                </div>
              </div>
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: meta.color,
                  flexShrink: 0,
                }}
              />
              <button
                onClick={() => toast(d.state === "uploaded" ? "Replace flow in production" : "Upload picker in production")}
                style={{
                  background: "transparent",
                  border: `1px solid ${COLORS.borderSoft}`,
                  color: COLORS.ink,
                  padding: "5px 10px",
                  borderRadius: 6,
                  fontFamily: FONTS.body,
                  fontSize: 11.5,
                  cursor: "pointer",
                }}
              >
                {d.state === "uploaded" ? "Replace" : "Upload"}
              </button>
            </div>
          );
        })}
      </div>
    </DrawerShell>
  );
}

// ─── Emergency contact ──────────────────────────────────────────

export function TalentEmergencyContactDrawer() {
  const { state, closeDrawer } = useProto();
  const open = state.drawer.drawerId === "talent-emergency-contact";
  const onSave = useSaveAndClose("Emergency contact saved");
  const c = MY_TALENT_PROFILE.emergencyContact;

  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title="Emergency contact"
      description="Visible only during an active booking, to the producer running the call sheet. Hidden the rest of the time."
      width={520}
      footer={<StandardFooter onSave={onSave} />}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <FieldRow label="Name">
          <TextInput defaultValue={c.name} />
        </FieldRow>
        <FieldRow label="Relation">
          <TextInput defaultValue={c.relation} />
        </FieldRow>
        <FieldRow label="Phone" hint="Stored encrypted. Masked on every other surface.">
          <TextInput defaultValue={c.phone} />
        </FieldRow>
        <Divider label="When this is shown" />
        <ul style={{ margin: 0, paddingLeft: 18, fontFamily: FONTS.body, fontSize: 13, color: COLORS.inkMuted, lineHeight: 1.7 }}>
          <li>The day of a confirmed booking, on that booking's call sheet only</li>
          <li>To the producer named on the contract — no one else</li>
          <li>Auto-revoked 24h after the wrap time</li>
        </ul>
      </div>
    </DrawerShell>
  );
}

// ─── Public preview ─────────────────────────────────────────────

export function TalentPublicPreviewDrawer() {
  const { state, closeDrawer, toast, openDrawer, getTrustSummary } = useProto();
  const open = state.drawer.drawerId === "talent-public-preview";
  const p = MY_TALENT_PROFILE;
  // Demo: prototype talent maps to roster id t1 (Marta) for trust lookup.
  const trust = getTrustSummary("talent_profile", "t1");
  const currentTier = p.subscription.tier;
  const [previewTier, setPreviewTier] = useState<TalentSubscriptionTier>(currentTier);
  const showEmbeds = previewTier !== "basic";
  const showPress = previewTier !== "basic";
  const showPortfolioExtras = previewTier === "portfolio";

  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title="Preview as a client"
      description="What an unverified visitor sees on your personal page. Use the tier toggle to see how your page changes if you upgrade."
      width={720}
      footer={
        <>
          <SecondaryButton onClick={() => toast("Public URL copied")}>Copy public URL</SecondaryButton>
          {previewTier !== currentTier && (
            <PrimaryButton onClick={() => { closeDrawer(); openDrawer("talent-tier-compare"); }}>
              Upgrade to {TALENT_TIER_META[previewTier].label}
            </PrimaryButton>
          )}
          {previewTier === currentTier && <PrimaryButton onClick={closeDrawer}>Close preview</PrimaryButton>}
        </>
      }
    >
      {/* Tier toggle */}
      <div
        style={{
          display: "flex",
          gap: 4,
          padding: 4,
          background: "rgba(11,11,13,0.04)",
          borderRadius: 999,
          marginBottom: 14,
          width: "fit-content",
        }}
      >
        {(["basic", "pro", "portfolio"] as const).map((t) => {
          const isActive = previewTier === t;
          const isCurrent = currentTier === t;
          return (
            <button
              key={t}
              onClick={() => setPreviewTier(t)}
              style={{
                padding: "5px 12px",
                background: isActive ? "#fff" : "transparent",
                color: isActive ? COLORS.ink : COLORS.inkMuted,
                border: "none",
                fontFamily: FONTS.body,
                fontSize: 12,
                fontWeight: 500,
                borderRadius: 999,
                cursor: "pointer",
                boxShadow: isActive ? "0 1px 3px rgba(11,11,13,0.06)" : "none",
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
              }}
            >
              {TALENT_TIER_META[t].label}
              {isCurrent && (
                <span
                  style={{
                    fontSize: 9,
                    color: COLORS.accentDeep,
                    fontWeight: 700,
                    letterSpacing: 0.4,
                    textTransform: "uppercase",
                  }}
                >
                  · current
                </span>
              )}
            </button>
          );
        })}
      </div>
      <div
        style={{
          background: "#fff",
          border: `1px solid ${COLORS.borderSoft}`,
          borderRadius: 12,
          overflow: "hidden",
        }}
      >
        {/* Cover */}
        <div
          style={{
            height: 120,
            background: `linear-gradient(135deg, ${COLORS.surfaceAlt} 0%, #fff 100%)`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 56,
          }}
        >
          {p.coverPhoto}
        </div>
        {/* Identity */}
        <div style={{ padding: "14px 18px", display: "flex", alignItems: "flex-start", gap: 14, position: "relative" }}>
          <div style={{ position: "relative", marginTop: -36, flexShrink: 0 }}>
            <div
              style={{
                width: 72,
                height: 72,
                borderRadius: "50%",
                background: COLORS.surfaceAlt,
                border: `3px solid #fff`,
                boxShadow: "0 1px 4px rgba(11,11,13,0.08)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 32,
              }}
            >
              {p.profilePhoto}
            </div>
            <ProfilePhotoBadgeOverlay trust={trust} size="md" />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: FONTS.display, fontSize: 22, color: COLORS.ink, lineHeight: 1.2 }}>{p.name}</div>
            <div style={{ fontFamily: FONTS.body, fontSize: 12.5, color: COLORS.inkMuted, marginTop: 4 }}>
              {p.pronouns} · {p.measurementsSummary} · {p.city.split(" ·")[0]}
            </div>
            <TrustBadgeGroup trust={trust} surface="public_profile" max={3} />

            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
              {p.specialties.slice(0, 4).map((s) => (
                <span
                  key={s}
                  style={{
                    padding: "3px 9px",
                    background: COLORS.surfaceAlt,
                    border: `1px solid rgba(15,79,62,0.24)`,
                    borderRadius: 999,
                    fontFamily: FONTS.body,
                    fontSize: 11,
                    color: COLORS.ink,
                  }}
                >
                  {TALENT_SPECIALTY_LABEL[s]}
                </span>
              ))}
            </div>
          </div>
          <button
            onClick={() => toast("Inquiry form — coming soon")}
            style={{
              background: COLORS.fill,
              color: "#fff",
              border: "none",
              padding: "8px 14px",
              borderRadius: 8,
              fontFamily: FONTS.body,
              fontSize: 12.5,
              fontWeight: 500,
              cursor: "pointer",
              flexShrink: 0,
            }}
          >
            Send inquiry
          </button>
        </div>
        {/* Body */}
        <div style={{ padding: "0 18px 18px", display: "flex", flexDirection: "column", gap: 14 }}>
          <Divider label="What's public" />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 8 }}>
            <PreviewKv label="Languages" value={summarizeLanguages(p.languages)} />
            <PreviewKv label="Travel" value="Global · 2 wk lead" />
            <PreviewKv label="Track record" value={`${p.bookingStats.completedBookings} bookings · ${p.bookingStats.onTimeRate}% on time`} />
            <PreviewKv label="Verified" value={`${p.badges.length} badges`} />
          </div>
          {/* Pro+ — embeds */}
          {showEmbeds && p.subscription.embeds.length > 0 && (
            <>
              <Divider label="Featured media" />
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
                {p.subscription.embeds.slice(0, 3).map((e) => (
                  <div
                    key={e.id}
                    style={{
                      aspectRatio: "1 / 1",
                      background: COLORS.surfaceAlt,
                      border: `1px solid ${COLORS.borderSoft}`,
                      borderRadius: 8,
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 4,
                    }}
                  >
                    <span style={{ fontSize: 28 }}>{e.thumb}</span>
                    <span style={{ fontFamily: FONTS.body, fontSize: 10.5, color: COLORS.inkMuted, textTransform: "capitalize" }}>
                      {e.kind}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
          {/* Pro+ — press */}
          {showPress && p.subscription.press.length > 0 && (
            <>
              <Divider label="Press" />
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {p.subscription.press.slice(0, 2).map((c) => (
                  <div
                    key={c.id}
                    style={{
                      padding: "8px 10px",
                      background: "rgba(11,11,13,0.02)",
                      border: `1px solid ${COLORS.borderSoft}`,
                      borderRadius: 8,
                    }}
                  >
                    <div style={{ fontFamily: FONTS.body, fontSize: 11, fontWeight: 600, color: COLORS.accentDeep, letterSpacing: 0.4, textTransform: "uppercase" }}>
                      {c.outlet}
                    </div>
                    <div style={{ fontFamily: FONTS.body, fontSize: 12.5, color: COLORS.ink, marginTop: 2 }}>
                      {c.headline}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
          {/* Portfolio — extra sections hint */}
          {showPortfolioExtras && (
            <>
              <Divider label="Portfolio sections" />
              <div
                style={{
                  padding: "10px 12px",
                  background: COLORS.fill,
                  color: "#fff",
                  borderRadius: 10,
                  fontFamily: FONTS.body,
                  fontSize: 12,
                  lineHeight: 1.5,
                }}
              >
                <strong style={{ letterSpacing: 0.4 }}>+ Story / About · Tour dates · Show calendar · EPK download · FAQ.</strong>
                <div style={{ opacity: 0.7, marginTop: 4 }}>
                  Custom domain: marta-reyes.com (replaces tulala.digital/t/marta-reyes).
                </div>
              </div>
            </>
          )}
          <Divider label="What's hidden until they inquire" />
          <ul style={{ margin: 0, paddingLeft: 18, fontFamily: FONTS.body, fontSize: 12.5, color: COLORS.inkMuted, lineHeight: 1.7 }}>
            <li>Full measurements (private — agency-controlled)</li>
            <li>Rate ranges (rate card visibility = {p.rateCard.visibility})</li>
            <li>Limits and wardrobe constraints</li>
            <li>Documents, emergency contact, agency-internal notes</li>
          </ul>
        </div>
      </div>
    </DrawerShell>
  );
}

function PreviewKv({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        padding: "8px 10px",
        background: "rgba(11,11,13,0.02)",
        border: `1px solid ${COLORS.borderSoft}`,
        borderRadius: 8,
      }}
    >
      <div
        style={{
          fontFamily: FONTS.body,
          fontSize: 10,
          fontWeight: 600,
          letterSpacing: 1.2,
          textTransform: "uppercase",
          color: COLORS.inkMuted,
        }}
      >
        {label}
      </div>
      <div style={{ fontFamily: FONTS.body, fontSize: 12.5, color: COLORS.ink, marginTop: 3 }}>{value}</div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
// PREMIUM TALENT PAGE DRAWERS
// ────────────────────────────────────────────────────────────────────
//   Tulala-direct subscription tier (Basic / Pro / Portfolio) is a
//   parallel monetization path: agencies pay for workspaces, talent
//   pay for richer personal pages. Tiers coexist — a Portfolio talent
//   on Acme's roster keeps appearing on Acme's site exactly the same.
// ════════════════════════════════════════════════════════════════════

// ─── Tier compare ────────────────────────────────────────────────

const TIER_FEATURE_MATRIX: Array<{ label: string; basic: string | true; pro: string | true; portfolio: string | true }> = [
  { label: "Standard public profile", basic: true, pro: true, portfolio: true },
  { label: "Roster · Tulala hub discovery", basic: true, pro: true, portfolio: true },
  { label: "Inquiry inbox + bookings", basic: true, pro: true, portfolio: true },
  { label: "Page templates", basic: "Roster only", pro: "+ Editorial / Studio", portfolio: "+ Stage / Creator / EPK" },
  { label: "Social + video embeds", basic: "—", pro: "Up to 6", portfolio: "Unlimited" },
  { label: "Press / clippings band", basic: "—", pro: true, portfolio: true },
  { label: "Downloadable media kit (EPK)", basic: "—", pro: true, portfolio: true },
  { label: "Custom domain (yourname.com)", basic: "—", pro: "—", portfolio: true },
  { label: "Multi-section page builder", basic: "—", pro: "—", portfolio: true },
  { label: "SEO controls + meta", basic: "—", pro: "—", portfolio: true },
  { label: "Priority discover placement", basic: "—", pro: "—", portfolio: true },
];

export function TalentTierCompareDrawer() {
  const { state, closeDrawer, toast } = useProto();
  const open = state.drawer.drawerId === "talent-tier-compare";
  const current = MY_TALENT_PROFILE.subscription.tier;

  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title="Compare talent plans"
      description="Your Tulala personal page tier. Coexists with whatever agencies and hubs you're on — agency rosters never change."
      width={760}
      footer={
        <>
          <SecondaryButton onClick={closeDrawer}>Maybe later</SecondaryButton>
          {current !== "portfolio" && (
            <PrimaryButton onClick={() => toast(`${current === "basic" ? "Pro" : "Portfolio"} trial started · 14 days free`)}>
              Start {current === "basic" ? "Pro" : "Portfolio"} trial
            </PrimaryButton>
          )}
        </>
      }
    >
      {/* Tier columns */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
        {(["basic", "pro", "portfolio"] as const).map((t) => {
          const meta = TALENT_TIER_META[t];
          const isCurrent = t === current;
          return (
            <div
              key={t}
              style={{
                padding: "16px 16px",
                background: t === "portfolio" ? COLORS.fill : "#fff",
                color: t === "portfolio" ? "#fff" : COLORS.ink,
                border: `1.5px solid ${isCurrent ? COLORS.accentDeep : t === "portfolio" ? COLORS.accent : COLORS.borderSoft}`,
                borderRadius: 12,
                position: "relative",
              }}
            >
              {isCurrent && (
                <span
                  style={{
                    position: "absolute",
                    top: -10,
                    left: 14,
                    background: COLORS.accentDeep,
                    color: "#fff",
                    fontFamily: FONTS.body,
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: 0.5,
                    padding: "3px 9px",
                    borderRadius: 999,
                    textTransform: "uppercase",
                  }}
                >
                  Current
                </span>
              )}
              <div
                style={{
                  fontFamily: FONTS.display,
                  fontSize: 22,
                  fontWeight: 500,
                  letterSpacing: -0.3,
                }}
              >
                {meta.label}
              </div>
              <div
                style={{
                  fontFamily: FONTS.body,
                  fontSize: 12.5,
                  opacity: 0.75,
                  marginTop: 3,
                }}
              >
                {meta.tagline}
              </div>
              <div
                style={{
                  fontFamily: FONTS.display,
                  fontSize: 18,
                  marginTop: 12,
                  color: t === "portfolio" ? "#fff" : COLORS.accentDeep,
                  fontWeight: 600,
                }}
              >
                {meta.monthlyPrice}
              </div>
              <p
                style={{
                  fontFamily: FONTS.body,
                  fontSize: 12.5,
                  lineHeight: 1.55,
                  marginTop: 8,
                  marginBottom: 0,
                  opacity: 0.85,
                }}
              >
                {meta.blurb}
              </p>
            </div>
          );
        })}
      </div>

      {/* Feature matrix */}
      <div style={{ marginTop: 18 }}>
        <CapsLabel>What's included</CapsLabel>
        <div
          style={{
            marginTop: 8,
            background: "#fff",
            border: `1px solid ${COLORS.borderSoft}`,
            borderRadius: 10,
            overflow: "hidden",
          }}
        >
          {/* Header */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1.6fr 1fr 1fr 1fr",
              padding: "10px 14px",
              background: "rgba(11,11,13,0.025)",
              borderBottom: `1px solid ${COLORS.borderSoft}`,
              fontFamily: FONTS.body,
              fontSize: 10.5,
              fontWeight: 600,
              letterSpacing: 1.2,
              textTransform: "uppercase",
              color: COLORS.inkMuted,
            }}
          >
            <span>Feature</span>
            <span style={{ textAlign: "center" }}>Basic</span>
            <span style={{ textAlign: "center" }}>Pro</span>
            <span style={{ textAlign: "center" }}>Portfolio</span>
          </div>
          {/* Rows */}
          {TIER_FEATURE_MATRIX.map((f, i) => (
            <div
              key={i}
              style={{
                display: "grid",
                gridTemplateColumns: "1.6fr 1fr 1fr 1fr",
                padding: "10px 14px",
                borderBottom: i < TIER_FEATURE_MATRIX.length - 1 ? `1px solid ${COLORS.borderSoft}` : "none",
                fontFamily: FONTS.body,
                fontSize: 12.5,
                color: COLORS.ink,
                alignItems: "center",
              }}
            >
              <span style={{ fontWeight: 500 }}>{f.label}</span>
              <FeatureCell value={f.basic} />
              <FeatureCell value={f.pro} />
              <FeatureCell value={f.portfolio} />
            </div>
          ))}
        </div>
      </div>

      <div
        style={{
          marginTop: 16,
          padding: "12px 14px",
          background: COLORS.surfaceAlt,
          border: `1px solid rgba(15,79,62,0.18)`,
          borderRadius: 10,
          fontFamily: FONTS.body,
          fontSize: 12.5,
          color: COLORS.ink,
          lineHeight: 1.55,
        }}
      >
        Personal page tiers are independent of agency / hub presence. You stay on every roster
        you're on now. The tier only affects your direct Tulala destination page.
      </div>
    </DrawerShell>
  );
}

function FeatureCell({ value }: { value: string | true }) {
  if (value === true) {
    return (
      <span style={{ textAlign: "center", color: COLORS.green, fontWeight: 600 }}>✓</span>
    );
  }
  if (value === "—") {
    return <span style={{ textAlign: "center", color: COLORS.inkDim }}>—</span>;
  }
  return (
    <span
      style={{
        textAlign: "center",
        fontSize: 11.5,
        color: COLORS.inkMuted,
      }}
    >
      {value}
    </span>
  );
}

// ─── Personal page (page-builder lite, Portfolio) ──────────────────

export function TalentPersonalPageDrawer() {
  const { state, closeDrawer, toast } = useProto();
  const open = state.drawer.drawerId === "talent-personal-page";
  const sub = MY_TALENT_PROFILE.subscription;
  const sections = [
    { id: "hero", label: "Hero", body: "Cover · headshot · name · pronouns · tagline.", removable: false },
    { id: "story", label: "About / story", body: "1-2 paragraphs in your own voice.", removable: true },
    { id: "embeds", label: "Media embeds", body: `${sub.embeds.length} embed${sub.embeds.length === 1 ? "" : "s"} live.`, removable: true },
    { id: "credits", label: "Credits & tearsheet", body: "Pulled from your profile credits.", removable: true },
    { id: "press", label: "Press band", body: `${sub.press.length} clip${sub.press.length === 1 ? "" : "s"}.`, removable: true },
    { id: "contact", label: "Contact CTA", body: "'Inquire' button → routes through your agency unless you're un-rep'd.", removable: false },
  ];

  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title="Personal page builder"
      description="Drag sections to re-order. Hero and Contact CTA are required — everything else is optional."
      width={620}
      footer={
        <>
          <SecondaryButton onClick={() => toast("Page preview — coming soon")}>Preview page</SecondaryButton>
          <PrimaryButton onClick={() => toast("Page saved · changes live in 30 sec")}>Publish</PrimaryButton>
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {sections.map((s) => (
          <div
            key={s.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "12px 14px",
              background: "#fff",
              border: `1px solid ${COLORS.borderSoft}`,
              borderRadius: 10,
            }}
          >
            <span style={{ color: COLORS.inkDim, fontSize: 14, cursor: "grab" }}>⋮⋮</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: FONTS.body, fontSize: 13.5, fontWeight: 500, color: COLORS.ink }}>
                {s.label}
                {!s.removable && (
                  <span style={{ marginLeft: 8, fontSize: 11, color: COLORS.inkMuted, fontWeight: 400 }}>
                    Required
                  </span>
                )}
              </div>
              <div style={{ fontFamily: FONTS.body, fontSize: 11.5, color: COLORS.inkMuted, marginTop: 2 }}>
                {s.body}
              </div>
            </div>
            <Toggle on={true} onChange={() => {}} />
          </div>
        ))}
      </div>
      <div style={{ marginTop: 12 }}>
        <button
          onClick={() => toast("Section catalog — coming soon")}
          style={{
            padding: "12px 14px",
            width: "100%",
            background: "rgba(11,11,13,0.02)",
            border: `1px dashed rgba(11,11,13,0.18)`,
            borderRadius: 10,
            fontFamily: FONTS.body,
            fontSize: 13,
            color: COLORS.inkMuted,
            cursor: "pointer",
          }}
        >
          + Add section · Tour dates · Show calendar · FAQ · Custom block
        </button>
      </div>
    </DrawerShell>
  );
}

// ─── Page template picker ───────────────────────────────────────────

export function TalentPageTemplateDrawer() {
  const { state, closeDrawer, toast } = useProto();
  const open = state.drawer.drawerId === "talent-page-template";
  const tier = MY_TALENT_PROFILE.subscription.tier;
  const active = MY_TALENT_PROFILE.subscription.template;

  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title="Choose a template"
      description="Templates set the layout, hero size, and section order of your personal page. Switch any time — content stays."
      width={680}
      footer={<StandardFooter onSave={() => { toast("Template saved · page rebuilt"); closeDrawer(); }} saveLabel="Use template" />}
    >
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10 }}>
        {TALENT_PAGE_TEMPLATES.map((t) => {
          const locked = !tierAllows(tier, "template-picker") && t.availableAt !== "basic";
          const tierLocked = !tierAllows(tier, "media-embeds") && t.availableAt === "pro";
          const sigLocked = !tierAllows(tier, "extra-sections") && t.availableAt === "portfolio";
          const isLocked = locked || tierLocked || sigLocked;
          const isActive = t.id === active;
          return (
            <button
              key={t.id}
              onClick={() => {
                if (isLocked) {
                  toast(`Unlock ${TALENT_TIER_META[t.availableAt].label} to use ${t.label}`);
                  return;
                }
                toast(`${t.label} selected`);
              }}
              style={{
                position: "relative",
                padding: 14,
                textAlign: "left",
                background: isActive ? COLORS.surfaceAlt : "#fff",
                border: `1.5px solid ${isActive ? COLORS.accentDeep : COLORS.borderSoft}`,
                borderRadius: 12,
                cursor: "pointer",
                opacity: isLocked ? 0.78 : 1,
              }}
            >
              <div
                style={{
                  aspectRatio: "16 / 9",
                  background: COLORS.surfaceAlt,
                  borderRadius: 8,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 48,
                  marginBottom: 10,
                  filter: isLocked ? "grayscale(0.4)" : "none",
                }}
              >
                {t.thumb}
              </div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <span style={{ fontFamily: FONTS.display, fontSize: 16, color: COLORS.ink }}>{t.label}</span>
                {isActive && (
                  <span style={{ fontFamily: FONTS.body, fontSize: 10, color: COLORS.accentDeep, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase" }}>
                    Active
                  </span>
                )}
                {isLocked && <LockedBadge requiredTier={t.availableAt} />}
              </div>
              <p style={{ margin: "4px 0 0", fontFamily: FONTS.body, fontSize: 12, color: COLORS.inkMuted, lineHeight: 1.5 }}>
                {t.blurb}
              </p>
            </button>
          );
        })}
      </div>
    </DrawerShell>
  );
}

// ─── Media embeds ──────────────────────────────────────────────────

export function TalentMediaEmbedsDrawer() {
  const { state, closeDrawer, toast } = useProto();
  const open = state.drawer.drawerId === "talent-media-embeds";
  const onSave = useSaveAndClose("Embeds saved");
  const embeds = MY_TALENT_PROFILE.subscription.embeds;

  const supported: Array<{ kind: TalentMediaEmbed["kind"]; label: string; thumb: string }> = [
    { kind: "instagram", label: "Instagram", thumb: "📷" },
    { kind: "tiktok", label: "TikTok", thumb: "🎵" },
    { kind: "youtube", label: "YouTube", thumb: "▶️" },
    { kind: "spotify", label: "Spotify", thumb: "🎧" },
    { kind: "soundcloud", label: "SoundCloud", thumb: "☁️" },
    { kind: "vimeo", label: "Vimeo", thumb: "🎬" },
  ];

  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title="Media embeds"
      description="Drop in a public URL and Tulala renders the live embed on your personal page. Update any time."
      width={580}
      footer={
        <>
          <SecondaryButton onClick={() => toast("Connect-account flow in production")}>+ Connect account</SecondaryButton>
          <StandardFooter onSave={onSave} />
        </>
      }
    >
      <CapsLabel>Live on your page</CapsLabel>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
        {embeds.map((e) => (
          <div
            key={e.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "12px 14px",
              background: "#fff",
              border: `1px solid ${COLORS.borderSoft}`,
              borderRadius: 10,
            }}
          >
            <span
              style={{
                width: 36,
                height: 36,
                background: COLORS.surfaceAlt,
                borderRadius: 8,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 18,
              }}
            >
              {e.thumb}
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: FONTS.body, fontSize: 13, fontWeight: 500, color: COLORS.ink, textTransform: "capitalize" }}>
                {e.kind} · {e.label}
              </div>
              <div style={{ fontFamily: FONTS.mono, fontSize: 11, color: COLORS.inkMuted, marginTop: 2 }}>
                {e.url}
              </div>
            </div>
            <button
              onClick={() => toast("Embed removed")}
              style={{
                background: "transparent",
                border: "none",
                color: COLORS.inkMuted,
                fontFamily: FONTS.body,
                fontSize: 11.5,
                cursor: "pointer",
              }}
            >
              Remove
            </button>
          </div>
        ))}
      </div>
      <Divider label="Supported sources" />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
        {supported.map((s) => (
          <div
            key={s.kind}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "10px 12px",
              background: COLORS.surfaceAlt,
              border: `1px solid rgba(15,79,62,0.18)`,
              borderRadius: 8,
              fontFamily: FONTS.body,
              fontSize: 12,
              color: COLORS.ink,
            }}
          >
            <span style={{ fontSize: 16 }}>{s.thumb}</span>
            {s.label}
          </div>
        ))}
      </div>
    </DrawerShell>
  );
}

// ─── Press / clippings ──────────────────────────────────────────────

export function TalentPressDrawer() {
  const { state, closeDrawer, toast } = useProto();
  const open = state.drawer.drawerId === "talent-press";
  const onSave = useSaveAndClose("Press band saved");
  const press = MY_TALENT_PROFILE.subscription.press;

  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title="Press & clippings"
      description="Magazine, blog, podcast, or TV mentions. Pulled from Google Alerts or pasted in manually."
      width={580}
      footer={
        <>
          <SecondaryButton onClick={() => toast("Add-clip form in production")}>+ Add clip</SecondaryButton>
          <StandardFooter onSave={onSave} />
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {press.map((c) => (
          <div
            key={c.id}
            style={{
              padding: "14px 16px",
              background: "#fff",
              border: `1px solid ${COLORS.borderSoft}`,
              borderRadius: 10,
            }}
          >
            <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
              <span style={{ fontFamily: FONTS.body, fontSize: 12, fontWeight: 600, color: COLORS.accentDeep, letterSpacing: 0.5, textTransform: "uppercase" }}>
                {c.outlet}
              </span>
              <span style={{ fontFamily: FONTS.body, fontSize: 11, color: COLORS.inkMuted, marginLeft: "auto" }}>
                {c.date}
              </span>
            </div>
            <div style={{ fontFamily: FONTS.display, fontSize: 16, color: COLORS.ink, marginTop: 4 }}>
              {c.headline}
            </div>
            {c.quote && (
              <p style={{ margin: "6px 0 0", fontFamily: FONTS.body, fontSize: 12.5, color: COLORS.ink, lineHeight: 1.55, fontStyle: "italic" }}>
                "{c.quote}"
              </p>
            )}
            <div style={{ marginTop: 6, fontFamily: FONTS.mono, fontSize: 11, color: COLORS.inkMuted }}>
              {c.url}
            </div>
          </div>
        ))}
      </div>
    </DrawerShell>
  );
}

// ─── Media kit / EPK ────────────────────────────────────────────────

export function TalentMediaKitDrawer() {
  const { state, closeDrawer, toast } = useProto();
  const open = state.drawer.drawerId === "talent-media-kit";
  const kit = MY_TALENT_PROFILE.subscription.mediaKit;

  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title="Media kit (EPK)"
      description="A single PDF with your bio, credits, comp card, press, and contact CTA. Auto-built from your profile data."
      width={560}
      footer={
        <>
          <SecondaryButton onClick={() => toast("Regenerated · ready to download in 30 sec")}>Re-generate</SecondaryButton>
          <PrimaryButton onClick={() => toast("Download starts in production")}>Download PDF</PrimaryButton>
        </>
      }
    >
      {kit ? (
        <div
          style={{
            padding: "14px 16px",
            background: "#fff",
            border: `1px solid ${COLORS.borderSoft}`,
            borderRadius: 12,
            display: "flex",
            alignItems: "center",
            gap: 14,
          }}
        >
          <div
            style={{
              width: 56,
              height: 70,
              background: COLORS.surfaceAlt,
              borderRadius: 6,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 28,
              border: `1px solid ${COLORS.borderSoft}`,
              flexShrink: 0,
            }}
          >
            {kit.thumb}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: FONTS.body, fontSize: 13.5, fontWeight: 500, color: COLORS.ink }}>
              {kit.filename}
            </div>
            <div style={{ fontFamily: FONTS.body, fontSize: 11.5, color: COLORS.inkMuted, marginTop: 2 }}>
              {kit.size} · updated {kit.updatedAt}
            </div>
          </div>
        </div>
      ) : (
        <div style={{ fontFamily: FONTS.body, fontSize: 13, color: COLORS.inkMuted }}>
          No kit generated yet. Click Re-generate to build one from your current profile.
        </div>
      )}
      <Divider label="What's in the kit" />
      <ul style={{ margin: 0, paddingLeft: 18, fontFamily: FONTS.body, fontSize: 13, color: COLORS.ink, lineHeight: 1.7 }}>
        <li>Cover page · headshot · name · contact CTA</li>
        <li>Comp card spread (measurements + 4 polaroids)</li>
        <li>Pinned credits + tear-sheets</li>
        <li>Press band (up to 6 clippings)</li>
        <li>Travel + work auth + agency info</li>
        <li>QR code → live Tulala personal page</li>
      </ul>
    </DrawerShell>
  );
}

// ─── Custom domain ──────────────────────────────────────────────────

export function TalentCustomDomainDrawer() {
  const { state, closeDrawer, toast } = useProto();
  const open = state.drawer.drawerId === "talent-custom-domain";
  const sub = MY_TALENT_PROFILE.subscription;
  const onSave = useSaveAndClose("Domain saved · DNS check started");

  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title="Custom domain"
      description="Point your own domain at your Tulala personal page. Visitors see yourname.com — Tulala handles SSL + redirects."
      width={580}
      footer={<StandardFooter onSave={onSave} saveLabel="Save & verify" />}
    >
      <FieldRow label="Domain" hint="Use the apex (yourname.com) or a subdomain (page.yourname.com).">
        <TextInput placeholder="marta-reyes.com" defaultValue={sub.customDomain ?? ""} />
      </FieldRow>
      <div style={{ marginTop: 14 }}>
        <CapsLabel>DNS configuration</CapsLabel>
        <div
          style={{
            marginTop: 8,
            padding: "12px 14px",
            background: COLORS.surfaceAlt,
            border: `1px solid rgba(15,79,62,0.18)`,
            borderRadius: 10,
            fontFamily: FONTS.mono,
            fontSize: 12,
            color: COLORS.ink,
            lineHeight: 1.7,
          }}
        >
          <div>A record &nbsp;@ &nbsp;→ &nbsp;76.76.21.21</div>
          <div>CNAME &nbsp;www &nbsp;→ &nbsp;cname.tulala.digital</div>
        </div>
      </div>
      <div
        style={{
          marginTop: 14,
          padding: "12px 14px",
          background: "#fff",
          border: `1px solid ${COLORS.borderSoft}`,
          borderRadius: 10,
          display: "flex",
          alignItems: "center",
          gap: 10,
        }}
      >
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: sub.customDomainStatus === "verified" ? COLORS.green : COLORS.amber,
          }}
        />
        <span style={{ fontFamily: FONTS.body, fontSize: 12.5, color: COLORS.ink }}>
          Status:{" "}
          <strong>
            {sub.customDomain
              ? sub.customDomainStatus === "verified"
                ? "Verified"
                : sub.customDomainStatus === "pending"
                  ? "Awaiting DNS propagation"
                  : "Failed verification"
              : "Not set"}
          </strong>
        </span>
        <button
          onClick={() => toast("Re-checking DNS")}
          style={{
            marginLeft: "auto",
            background: "transparent",
            border: `1px solid ${COLORS.borderSoft}`,
            color: COLORS.ink,
            padding: "5px 10px",
            borderRadius: 6,
            fontFamily: FONTS.body,
            fontSize: 11.5,
            cursor: "pointer",
          }}
        >
          Re-check
        </button>
      </div>
      <p style={{ marginTop: 14, fontFamily: FONTS.body, fontSize: 12.5, color: COLORS.inkMuted, lineHeight: 1.55 }}>
        Tulala issues + auto-renews a Let's Encrypt SSL certificate once your DNS is pointing
        correctly. No manual cert config needed.
      </p>
    </DrawerShell>
  );
}
// ─────────────────────────────────────────────────────────────────────────────
// WS-8.5  Talent career analytics — "You got X inquiries this Q" drawer
// ─────────────────────────────────────────────────────────────────────────────

const CAREER_STATS = {
  inquiriesQ:  14,
  inquiriesQPrev: 9,
  acceptRate:  68,
  avgRateYTD:  2_150,
  bookingsYTD: 11,
  topClients:  [
    { name: "Versace Studio", bookings: 3, spend: 6_450 },
    { name: "H&M Campaign",   bookings: 2, spend: 4_300 },
    { name: "Mango Editorial",bookings: 2, spend: 3_800 },
  ],
  rateHistory: [1_800, 1_900, 2_000, 2_050, 2_150, 2_200, 2_150],
};

export function TalentCareerAnalyticsDrawer() {
  const { state, closeDrawer } = useProto();
  const open = state.drawer.drawerId === "talent-career-analytics";
  const s = CAREER_STATS;
  const inquiryDelta = s.inquiriesQ - s.inquiriesQPrev;
  const deltaTxt = inquiryDelta > 0 ? `+${inquiryDelta}` : `${inquiryDelta}`;
  const deltaColor = inquiryDelta >= 0 ? COLORS.successDeep : "#9B2C2C";

  // Simple SVG sparkline
  const sparkW = 200, sparkH = 40;
  const maxRate = Math.max(...s.rateHistory);
  const minRate = Math.min(...s.rateHistory);
  const range = maxRate - minRate || 1;
  const pts = s.rateHistory.map((v, i) => {
    const x = (i / (s.rateHistory.length - 1)) * sparkW;
    const y = sparkH - ((v - minRate) / range) * (sparkH - 4) - 2;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");

  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title="Career analytics"
      description="Your performance at a glance — this quarter and year-to-date."
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 16, fontFamily: FONTS.body }}>

        {/* Stat tiles */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          {[
            { label: "Inquiries this Q", value: s.inquiriesQ, sub: `${deltaTxt} vs last Q`, subColor: deltaColor },
            { label: "Accept rate",       value: `${s.acceptRate}%`, sub: "of inquiries you accepted" },
            { label: "Bookings YTD",      value: s.bookingsYTD, sub: "confirmed bookings" },
            { label: "Avg day rate YTD",  value: `€${s.avgRateYTD.toLocaleString()}`, sub: "across all bookings" },
          ].map((tile) => (
            <div key={tile.label} style={{
              background: COLORS.surfaceAlt, borderRadius: RADIUS.lg,
              padding: "14px 16px", border: `1px solid ${COLORS.border}`,
            }}>
              <div style={{ fontSize: 10.5, color: COLORS.inkMuted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>
                {tile.label}
              </div>
              <div style={{ fontSize: 22, fontWeight: 800, color: COLORS.ink, marginBottom: 2 }}>
                {tile.value}
              </div>
              <div style={{ fontSize: 11, color: (tile as any).subColor ?? COLORS.inkMuted }}>
                {tile.sub}
              </div>
            </div>
          ))}
        </div>

        {/* Rate trend sparkline */}
        <div style={{ background: COLORS.surfaceAlt, borderRadius: RADIUS.lg, padding: "14px 16px", border: `1px solid ${COLORS.border}` }}>
          <div style={{ fontSize: 11, color: COLORS.inkMuted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>
            Day-rate trend (last 7 bookings)
          </div>
          <svg width={sparkW} height={sparkH} style={{ display: "block", overflow: "visible" }}>
            <polyline
              points={pts}
              fill="none"
              stroke={COLORS.accent}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4, fontSize: 10.5, color: COLORS.inkMuted }}>
            <span>€{minRate.toLocaleString()}</span>
            <span>€{maxRate.toLocaleString()}</span>
          </div>
        </div>

        {/* Top clients */}
        <div>
          <div style={{ fontSize: 11, color: COLORS.inkMuted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>
            Top clients YTD
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {s.topClients.map((c) => (
              <div key={c.name} style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                padding: "10px 14px", background: COLORS.surfaceAlt,
                borderRadius: RADIUS.md, border: `1px solid ${COLORS.borderSoft}`,
              }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.ink }}>{c.name}</div>
                  <div style={{ fontSize: 11, color: COLORS.inkMuted, marginTop: 1 }}>{c.bookings} bookings</div>
                </div>
                <div style={{ fontSize: 13, fontWeight: 700, color: COLORS.ink }}>
                  €{c.spend.toLocaleString()}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* WS-18.4 — AI talent-side insights */}
        <div
          style={{
            background: COLORS.royalSoft,
            borderRadius: RADIUS.lg,
            padding: "14px 16px",
            border: `1px solid rgba(95,75,139,0.15)`,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
            <Icon name="sparkle" size={13} color={COLORS.royal} stroke={1.7} />
            <span
              style={{
                fontFamily: FONTS.body,
                fontSize: 10.5,
                fontWeight: 700,
                letterSpacing: 0.5,
                textTransform: "uppercase",
                color: COLORS.royal,
              }}
            >
              AI Insights
            </span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {(
              [
                {
                  icon: "bolt" as const,
                  body: `7 of your last 10 inquiries were commercial. Your commercial booking rate (${s.acceptRate}%) is lower than editorial — you may be under-pricing that category.`,
                  tone: "amber" as const,
                },
                {
                  icon: "star" as const,
                  body: `Your day rate increased by €${(s.rateHistory[s.rateHistory.length - 1] - s.rateHistory[0]).toLocaleString()} over the last 7 bookings. You're trending up — consider raising your quote floor.`,
                  tone: "green" as const,
                },
                {
                  icon: "user" as const,
                  body: `${s.topClients[0].name} accounts for ${Math.round((s.topClients[0].spend / (s.topClients.reduce((a, c) => a + c.spend, 0))) * 100)}% of your YTD revenue. Diversifying reduces scheduling risk.`,
                  tone: "info" as const,
                },
              ] as { icon: "bolt" | "star" | "user"; body: string; tone: "amber" | "green" | "info" }[]
            ).map((item, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  gap: 8,
                  fontFamily: FONTS.body,
                  fontSize: 12.5,
                  color: COLORS.royalDeep,
                  lineHeight: 1.5,
                }}
              >
                <Icon
                  name={item.icon}
                  size={13}
                  color={item.tone === "green" ? COLORS.successDeep : item.tone === "amber" ? COLORS.amberDeep : COLORS.indigoDeep}
                  stroke={1.8}
                />
                <span>{item.body}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </DrawerShell>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// WS-8.13  Talent receive reviews UX — after-booking rating prompt
// ─────────────────────────────────────────────────────────────────────────────

const REVIEW_DIMENSIONS = [
  { key: "professionalism", label: "Professionalism",  hint: "Punctuality, communication, preparation" },
  { key: "creativity",      label: "Creativity",        hint: "Bringing something extra to the shoot" },
  { key: "reliability",     label: "Reliability",       hint: "Showed up prepared, did what was promised" },
];

export function TalentReceiveReviewDrawer() {
  const { state, closeDrawer, toast } = useProto();
  const open = state.drawer.drawerId === "talent-receive-review";
  const [ratings, setRatings] = useState<Record<string, number>>({});
  const [comment, setComment] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const allRated = REVIEW_DIMENSIONS.every((d) => ratings[d.key]);

  function Star({ dim, star }: { dim: string; star: number }) {
    const filled = (ratings[dim] ?? 0) >= star;
    return (
      <button
        type="button"
        onClick={() => setRatings((r) => ({ ...r, [dim]: star }))}
        aria-label={`${star} stars for ${dim}`}
        style={{
          background: "none", border: "none", cursor: "pointer",
          fontSize: 20, color: filled ? "#F59E0B" : COLORS.borderSoft,
          padding: "0 2px", lineHeight: 1,
        }}
      >
        ★
      </button>
    );
  }

  if (submitted) {
    return (
      <DrawerShell open={open} onClose={closeDrawer} title="Review submitted">
        <div style={{ textAlign: "center", padding: "32px 20px", fontFamily: FONTS.body }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🌟</div>
          <div style={{ fontSize: 17, fontWeight: 700, color: COLORS.ink, marginBottom: 8 }}>
            Thanks for the feedback!
          </div>
          <div style={{ fontSize: 13, color: COLORS.inkMuted }}>
            Your review helps other coordinators know what it&apos;s like working with you.
          </div>
          <div style={{ marginTop: 20 }}><PrimaryButton onClick={closeDrawer}>Done</PrimaryButton></div>
        </div>
      </DrawerShell>
    );
  }

  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title="Review from client"
      description="H&M Campaign · May 2026 shoot · 1 day"
      footer={
        <>
          <SecondaryButton onClick={closeDrawer}>Skip</SecondaryButton>
          <PrimaryButton
            disabled={!allRated}
            onClick={() => { setSubmitted(true); toast("Review published"); }}
          >
            Publish review
          </PrimaryButton>
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 16, fontFamily: FONTS.body }}>
        <div style={{ padding: "12px 14px", background: COLORS.surfaceAlt, borderRadius: RADIUS.lg, border: `1px solid ${COLORS.border}`, fontSize: 13, color: COLORS.inkMuted }}>
          A client has left a review of your performance. Once you publish it, it will appear on your public profile.
        </div>

        {/* Dimension ratings */}
        {REVIEW_DIMENSIONS.map((d) => (
          <div key={d.key} style={{ borderBottom: `1px solid ${COLORS.borderSoft}`, paddingBottom: 12 }}>
            <div style={{ fontWeight: 600, fontSize: 13, color: COLORS.ink, marginBottom: 2 }}>{d.label}</div>
            <div style={{ fontSize: 11.5, color: COLORS.inkMuted, marginBottom: 6 }}>{d.hint}</div>
            <div style={{ display: "flex", gap: 2 }}>
              {[1, 2, 3, 4, 5].map((s) => <Star key={s} dim={d.key} star={s} />)}
              {ratings[d.key] && (
                <span style={{ marginLeft: 6, fontSize: 12, color: COLORS.inkMuted, alignSelf: "center" }}>
                  {["", "Poor", "Fair", "Good", "Great", "Excellent"][ratings[d.key] ?? 0]}
                </span>
              )}
            </div>
          </div>
        ))}

        {/* Written comment */}
        <div>
          <div style={{ fontWeight: 600, fontSize: 13, color: COLORS.ink, marginBottom: 6 }}>Client&apos;s written feedback</div>
          <div style={{
            padding: "12px 14px", background: "#fff",
            borderRadius: RADIUS.md, border: `1px solid ${COLORS.border}`,
            fontSize: 13, color: COLORS.ink, lineHeight: 1.6,
            fontStyle: "italic",
          }}>
            &ldquo;Sofia was fantastic — arrived on time, full of ideas, and made the team feel comfortable immediately. Would book again without hesitation.&rdquo;
          </div>
        </div>
      </div>
    </DrawerShell>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// WS-8.14  Talent agency analytics — "Your top agencies by booking volume"
// ─────────────────────────────────────────────────────────────────────────────

const AGENCY_STATS = [
  { name: "Acme Models",   bookings: 7, revenue: 15_400, acceptRate: 72, avgDays: 1.4 },
  { name: "Elite Madrid",  bookings: 3, revenue:  6_600, acceptRate: 60, avgDays: 2.0 },
  { name: "Blue Talent",   bookings: 1, revenue:  2_200, acceptRate: 50, avgDays: 1.0 },
];

export function TalentAgencyAnalyticsDrawer() {
  const { state, closeDrawer, openDrawer } = useProto();
  const open = state.drawer.drawerId === "talent-agency-analytics";
  const totalRevenue = AGENCY_STATS.reduce((s, a) => s + a.revenue, 0);
  const totalBookings = AGENCY_STATS.reduce((s, a) => s + a.bookings, 0);

  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title="Agency analytics"
      description="Which agencies are driving the most bookings for you, year-to-date."
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 14, fontFamily: FONTS.body }}>

        {/* Summary row */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          {[
            { label: "Total bookings YTD",  value: totalBookings },
            { label: "Total revenue YTD",   value: `€${totalRevenue.toLocaleString()}` },
          ].map((t) => (
            <div key={t.label} style={{
              background: COLORS.surfaceAlt, borderRadius: RADIUS.lg,
              padding: "12px 14px", border: `1px solid ${COLORS.border}`,
            }}>
              <div style={{ fontSize: 10.5, color: COLORS.inkMuted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 3 }}>
                {t.label}
              </div>
              <div style={{ fontSize: 22, fontWeight: 800, color: COLORS.ink }}>{t.value}</div>
            </div>
          ))}
        </div>

        {/* Per-agency breakdown */}
        {AGENCY_STATS.map((a, i) => {
          const pct = Math.round((a.bookings / totalBookings) * 100);
          return (
            <div key={a.name} style={{
              background: "#fff", borderRadius: RADIUS.lg,
              border: `1px solid ${COLORS.borderSoft}`, overflow: "hidden",
            }}>
              {/* Header */}
              <div style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "12px 14px", borderBottom: `1px solid ${COLORS.borderSoft}`,
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{
                    width: 24, height: 24, borderRadius: "50%",
                    background: [COLORS.accent, "#3B82F6", "#8B5CF6"][i] ?? COLORS.ink,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 10, fontWeight: 700, color: "#fff",
                  }}>
                    {i + 1}
                  </div>
                  <span style={{ fontSize: 13, fontWeight: 700, color: COLORS.ink }}>{a.name}</span>
                </div>
                <button
                  type="button"
                  onClick={() => openDrawer("talent-agency-relationship")}
                  style={{
                    background: "none", border: "none", cursor: "pointer",
                    fontSize: 12, color: COLORS.accent, fontFamily: FONTS.body,
                  }}
                >
                  View →
                </button>
              </div>

              {/* Stats */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 0 }}>
                {[
                  { label: "Bookings",    value: `${a.bookings} (${pct}%)` },
                  { label: "Revenue",     value: `€${a.revenue.toLocaleString()}` },
                  { label: "Accept rate", value: `${a.acceptRate}%` },
                ].map((stat, j) => (
                  <div key={stat.label} style={{
                    padding: "10px 14px", textAlign: "center",
                    borderRight: j < 2 ? `1px solid ${COLORS.borderSoft}` : "none",
                  }}>
                    <div style={{ fontSize: 11, color: COLORS.inkMuted, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                      {stat.label}
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: COLORS.ink, marginTop: 2 }}>
                      {stat.value}
                    </div>
                  </div>
                ))}
              </div>

              {/* Booking share bar */}
              <div style={{ padding: "8px 14px 12px" }}>
                <div style={{ height: 4, background: COLORS.surfaceAlt, borderRadius: 999, overflow: "hidden" }}>
                  <div style={{
                    height: "100%", width: `${pct}%`,
                    background: [COLORS.accent, "#3B82F6", "#8B5CF6"][i] ?? COLORS.ink,
                    borderRadius: 999,
                  }} />
                </div>
                <div style={{ fontSize: 10.5, color: COLORS.inkMuted, marginTop: 3 }}>
                  {pct}% of total bookings
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </DrawerShell>
  );
}
