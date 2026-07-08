"use client";

// ════════════════════════════════════════════════════════════════════
// talent-drawers/today — Phase 1d body chunk.
// Owns: TalentTodayPulseDrawer, TalentOfferDetailDrawer,
// TalentBookingDetailDrawer.
// Private helpers: RequestKindBadge, statusLabel.
// Bodies copied byte-for-byte from talent-drawers.tsx; no behavior change.
// ════════════════════════════════════════════════════════════════════

import { useT } from "@/i18n/use-t";
import { interpolate } from "@/i18n/interpolate";
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

// ─── Discriminant → catalog-key maps (render label via t(), switch on raw union) ──
const REQUEST_KIND_KEYS: Record<TalentRequest["kind"], string> = {
  offer: "dashboard.talentDrawers.requestKinds.offer",
  hold: "dashboard.talentDrawers.requestKinds.hold",
  casting: "dashboard.talentDrawers.requestKinds.casting",
  request: "dashboard.talentDrawers.requestKinds.request",
};
const REQUEST_STATUS_KEYS: Record<TalentRequest["status"], string> = {
  "needs-answer": "dashboard.talentDrawers.requestStatus.needsAnswer",
  viewed: "dashboard.talentDrawers.requestStatus.viewed",
  accepted: "dashboard.talentDrawers.requestStatus.accepted",
  declined: "dashboard.talentDrawers.requestStatus.declined",
  expired: "dashboard.talentDrawers.requestStatus.expired",
};

// ─── RequestKindBadge (moved from _talent.tsx — only used by drawers) ────────
function RequestKindBadge({ kind, status }: { kind: TalentRequest["kind"]; status: TalentRequest["status"] }) {
  const t = useT();
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
      {t(REQUEST_KIND_KEYS[kind])}
    </span>
  );
}

// ─── Today pulse drawer ───────────────────────────────────────────

export function TalentTodayPulseDrawer() {
  const { state, closeDrawer, openDrawer } = useAdminShell();
  const t = useT();
  const open = state.drawer.drawerId === "talent-today-pulse";
  const items = TALENT_REQUESTS.filter((r) => r.status === "needs-answer" || r.status === "viewed");
  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title={t("dashboard.talentDrawers.today.pulseTitle")}
      description={t("dashboard.talentDrawers.today.pulseDesc")}
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
                {interpolate(t("dashboard.talentDrawers.today.via"), { agency: r.agency })}
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
  const { state, closeDrawer } = useAdminShell();
  const t = useT();
  const open = state.drawer.drawerId === "talent-offer-detail" || state.drawer.drawerId === "talent-request-detail";
  const id = (state.drawer.payload?.id as string) ?? "rq1";
  const r = TALENT_REQUESTS.find((x) => x.id === id) ?? TALENT_REQUESTS[0];

  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title={`${r.client} · ${r.brief}`}
      description={`${interpolate(t("dashboard.talentDrawers.today.via"), { agency: r.agency })}${r.date ? ` · ${r.date}` : ""}`}
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
              title={t("dashboard.talentDrawers.today.openInMessages")}
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
              {t("dashboard.talentDrawers.today.decline")}
            </button>
            <SecondaryButton onClick={closeDrawer}>{t("dashboard.talentDrawers.close")}</SecondaryButton>
            <PrimaryButton disabled>
              {t("dashboard.talentDrawers.today.accept")}
            </PrimaryButton>
          </>
        ) : (
          <SecondaryButton onClick={closeDrawer}>{t("dashboard.talentDrawers.close")}</SecondaryButton>
        )
      }
    >
      <div className="flex flex-col gap-4">
        <KvRow label={t("dashboard.talentDrawers.today.labelStatus")} value={t(REQUEST_STATUS_KEYS[r.status])} />
        <KvRow label={t("dashboard.talentDrawers.today.labelDate")} value={r.date ?? t("dashboard.talentDrawers.today.tbc")} />
        <KvRow label={t("dashboard.talentDrawers.today.labelFee")} value={r.amount ?? t("dashboard.talentDrawers.today.tbc")} />
        <KvRow label={t("dashboard.talentDrawers.today.labelClient")} value={r.client} />
        <KvRow label={t("dashboard.talentDrawers.today.labelAgency")} value={r.agency} />
        <Divider label={t("dashboard.talentDrawers.today.brief")} />
        <p style={{ fontFamily: FONTS.body, fontSize: 13.5, lineHeight: 1.6 }} className="text-admin-ink">
          {t("dashboard.talentDrawers.today.offerBriefIntro")} &quot;<em>{r.brief}</em>&quot;. {t("dashboard.talentDrawers.today.offerBriefOutro")}
        </p>
        <Divider label={t("dashboard.talentDrawers.today.termsPreview")} />
        <ul style={{ margin: 0, paddingLeft: 18, fontFamily: FONTS.body, fontSize: 13, lineHeight: 1.7 }} className="text-admin-ink-muted">
          <li>{t("dashboard.talentDrawers.today.term1")}</li>
          <li>{t("dashboard.talentDrawers.today.term2")}</li>
          <li>{t("dashboard.talentDrawers.today.term3")}</li>
          <li>{t("dashboard.talentDrawers.today.term4")}</li>
        </ul>
      </div>
    </DrawerShell>
  );
}

// ─── Booking detail (call sheet) ──────────────────────────────────

export function TalentBookingDetailDrawer() {
  const { state, closeDrawer } = useAdminShell();
  const t = useT();
  const open = state.drawer.drawerId === "talent-booking-detail";
  const id = (state.drawer.payload?.id as string) ?? "bk1";
  const b = TALENT_BOOKINGS.find((x) => x.id === id) ?? TALENT_BOOKINGS[0];

  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title={`${b.client} · ${b.brief}`}
      description={interpolate(t("dashboard.talentDrawers.today.bookingVia"), { agency: b.agency })}
      width={560}
      footer={<PrimaryButton onClick={closeDrawer}>{t("dashboard.talentDrawers.gotIt")}</PrimaryButton>}
    >
      <div className="flex flex-col gap-3.5">
        <KvRow label={t("dashboard.talentDrawers.today.labelDate")} value={b.endDate ? `${b.startDate} → ${b.endDate}` : b.startDate} />
        <KvRow label={t("dashboard.talentDrawers.today.labelCallTime")} value={b.call} />
        <KvRow label={t("dashboard.talentDrawers.today.labelLocation")} value={b.location} />
        <KvRow label={t("dashboard.talentDrawers.today.labelFee")} value={b.amount} />
        <KvRow label={t("dashboard.talentDrawers.today.labelStatus")} value={b.status} />
        <Divider label={t("dashboard.talentDrawers.today.whatToBring")} />
        <ul style={{ margin: 0, paddingLeft: 18, fontFamily: FONTS.body, fontSize: 13, lineHeight: 1.7 }} className="text-admin-ink">
          <li>{t("dashboard.talentDrawers.today.bring1")}</li>
          <li>{t("dashboard.talentDrawers.today.bring2")}</li>
          <li>{t("dashboard.talentDrawers.today.bring3")}</li>
        </ul>
        <Divider label={t("dashboard.talentDrawers.today.contactsOnDay")} />
        <KvRow label={t("dashboard.talentDrawers.today.labelProducer")} value="Inés López · +34 612 451" />
        <KvRow label={t("dashboard.talentDrawers.today.labelStylist")} value="Lia Roca" />
        <KvRow label={t("dashboard.talentDrawers.today.labelPhotographer")} value="Studio Roca" />
      </div>
    </DrawerShell>
  );
}
