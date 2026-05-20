"use client";

// ════════════════════════════════════════════════════════════════════
// talent-drawers/today — Phase 1d body chunk.
// Owns: TalentTodayPulseDrawer, TalentOfferDetailDrawer,
// TalentBookingDetailDrawer.
// Private helpers: RequestKindBadge, statusLabel.
// Bodies copied byte-for-byte from talent-drawers.tsx; no behavior change.
// ════════════════════════════════════════════════════════════════════

import { COLORS, FONTS, TALENT_BOOKINGS, TALENT_REQUESTS, useAdminShell, type TalentRequest } from "../state";
import {
  ClientTrustChip,
  Divider,
  DrawerShell,
  Icon,
  PrimaryButton,
  SecondaryButton,
} from "../primitives";
import { KvRow } from "./shared";

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

// ─── Today pulse drawer ───────────────────────────────────────────

export function TalentTodayPulseDrawer() {
  const { state, closeDrawer, openDrawer } = useAdminShell();
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
      <div className="flex flex-col gap-2">
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
            <div className="flex-1 min-w-0">
              <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5, fontWeight: 500 }} className="text-admin-ink">
                <span style={{ flex: "0 1 auto", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {r.client} · {r.brief}
                </span>
                <ClientTrustChip level={r.clientTrust} compact />
              </div>
              <div style={{ fontSize: 11.5, marginTop: 2 }} className="text-admin-ink-muted">
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
  const { state, closeDrawer, openDrawer } = useAdminShell();
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
            {/* Decline/Accept are disabled here — this drawer uses prototype mock IDs (no real inquiryId).
                The real accept/decline flow routes through the Messages shell, which has the live inquiry context.
                TODO Phase 3+: when offer-detail is rewritten against bridge inquiry data, wire acceptInquiryInvitation /
                declineInquiryInvitation from talent-pipeline.ts. */}
            <button
              disabled
              title="Open in Messages to respond"
              style={{
                background: "transparent",
                border: `1px solid ${COLORS.borderSoft}`,
                color: COLORS.inkDim,
                padding: "8px 12px",
                borderRadius: 8,
                fontFamily: FONTS.body,
                fontSize: 12.5,
                fontWeight: 500,
                cursor: "not-allowed",
                marginRight: "auto",
                opacity: 0.5,
              }}
            >
              Decline
            </button>
            <SecondaryButton onClick={closeDrawer}>Close</SecondaryButton>
            <PrimaryButton disabled>
              Accept
            </PrimaryButton>
          </>
        ) : (
          <SecondaryButton onClick={closeDrawer}>Close</SecondaryButton>
        )
      }
    >
      <div className="flex flex-col gap-4">
        <KvRow label="Status" value={statusLabel(r.status)} />
        <KvRow label="Date" value={r.date ?? "TBC"} />
        <KvRow label="Fee" value={r.amount ?? "TBC"} />
        <KvRow label="Client" value={r.client} />
        <KvRow label="Agency" value={r.agency} />
        <Divider label="Brief" />
        <p style={{ fontFamily: FONTS.body, fontSize: 13.5, lineHeight: 1.6 }} className="text-admin-ink">
          The agency briefed this as: &quot;<em>{r.brief}</em>&quot;. Tap accept to confirm — your agency
          will turn this into a confirmed booking with full call sheet and contract once the
          client locks in. You can also hold open if you want more time.
        </p>
        <Divider label="Terms (preview)" />
        <ul style={{ margin: 0, paddingLeft: 18, fontFamily: FONTS.body, fontSize: 13, lineHeight: 1.7 }} className="text-admin-ink-muted">
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

// ─── Booking detail (call sheet) ──────────────────────────────────

export function TalentBookingDetailDrawer() {
  const { state, closeDrawer } = useAdminShell();
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
      footer={<PrimaryButton onClick={closeDrawer}>Got it</PrimaryButton>}
    >
      <div className="flex flex-col gap-3.5">
        <KvRow label="Date" value={b.endDate ? `${b.startDate} → ${b.endDate}` : b.startDate} />
        <KvRow label="Call time" value={b.call} />
        <KvRow label="Location" value={b.location} />
        <KvRow label="Fee" value={b.amount} />
        <KvRow label="Status" value={b.status} />
        <Divider label="What to bring" />
        <ul style={{ margin: 0, paddingLeft: 18, fontFamily: FONTS.body, fontSize: 13, lineHeight: 1.7 }} className="text-admin-ink">
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
