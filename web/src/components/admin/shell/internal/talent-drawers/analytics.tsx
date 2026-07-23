"use client";

// ════════════════════════════════════════════════════════════════════
// talent-drawers/analytics — Phase 1d body chunk.
// Owns: TalentCareerAnalyticsDrawer, TalentReceiveReviewDrawer,
// TalentAgencyAnalyticsDrawer + CAREER_STATS / REVIEW_DIMENSIONS /
// AGENCY_STATS data fixtures.
// Bodies copied byte-for-byte from talent-drawers.tsx; no behavior change.
// ════════════════════════════════════════════════════════════════════

import { useState } from "react";
import { useT } from "@/i18n/use-t";
import { interpolate } from "@/i18n/interpolate";
import { COLORS, FONTS, RADIUS, useAdminShell } from "../state";
import {
  DrawerShell,
  EmptyState,
  Icon,
  PrimaryButton,
  SecondaryButton,
} from "../primitives";
import { useDashboardText } from "../dashboard-i18n";

/**
 * Analytics drawers below run on DEMO fixtures (CAREER_STATS / AGENCY_STATS).
 * For a REAL bridged talent those numbers would be fabricated (Versace,
 * €2,150/day, "Acme Models"), so the drawers now render an honest
 * not-yet-available state instead. The fixture path is kept for the
 * standalone prototype/demo session.
 */
function AnalyticsNotAvailableYet({ body }: { body: string }) {
  const copy = useDashboardText();
  return (
    <EmptyState
      icon="sparkle"
      title={copy.t("Analytics are on the way")}
      body={body}
    />
  );
}

// Review dimensions carry a stable enum key; labels/hints resolve through the
// catalog (additive i18n pattern, English fixture kept for non-localized use).
const REVIEW_DIMENSION_KEYS: Record<string, { label: string; hint: string }> = {
  professionalism: {
    label: "dashboard.talentDrawers.analytics.dimProfessionalism",
    hint: "dashboard.talentDrawers.analytics.dimProfessionalismHint",
  },
  creativity: {
    label: "dashboard.talentDrawers.analytics.dimCreativity",
    hint: "dashboard.talentDrawers.analytics.dimCreativityHint",
  },
  reliability: {
    label: "dashboard.talentDrawers.analytics.dimReliability",
    hint: "dashboard.talentDrawers.analytics.dimReliabilityHint",
  },
};

// Rating word per star value (index 1..5); index 0 is the unrated empty slot.
const RATING_WORD_KEYS = [
  "",
  "dashboard.talentDrawers.analytics.ratePoor",
  "dashboard.talentDrawers.analytics.rateFair",
  "dashboard.talentDrawers.analytics.rateGood",
  "dashboard.talentDrawers.analytics.rateGreat",
  "dashboard.talentDrawers.analytics.rateExcellent",
];

// ─────────────────────────────────────────────────────────────────────────────
// WS-8.12  Talent career analytics — "Where do my bookings actually come from?"
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
  const { state, closeDrawer, bridgeTalentSelfProfile } = useAdminShell();
  const t = useT();
  const copy = useDashboardText();
  const open = state.drawer.drawerId === "talent-career-analytics";
  const s = CAREER_STATS;
  // Real talent → honest empty state (the fixture below is demo-only data).
  if (bridgeTalentSelfProfile) {
    return (
      <DrawerShell
        open={open}
        onClose={closeDrawer}
        title={t("dashboard.talentDrawers.analytics.careerAnalyticsTitle")}
        description={t("dashboard.talentDrawers.analytics.careerAnalyticsDesc")}
      >
        <AnalyticsNotAvailableYet
          body={copy.t("Your career stats appear here once you have completed bookings. Your earnings and pipeline are live on the Money page today.")}
        />
      </DrawerShell>
    );
  }
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
      title={t("dashboard.talentDrawers.analytics.careerTitle")}
      description={t("dashboard.talentDrawers.analytics.careerDesc")}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 16, fontFamily: FONTS.body }}>

        {/* Stat tiles */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          {[
            { label: t("dashboard.talentDrawers.analytics.tileInquiriesThisQ"), value: s.inquiriesQ, sub: interpolate(t("dashboard.talentDrawers.analytics.tileInquiriesThisQSub"), { delta: deltaTxt }), subColor: deltaColor },
            { label: t("dashboard.talentDrawers.analytics.tileAcceptRate"),       value: `${s.acceptRate}%`, sub: t("dashboard.talentDrawers.analytics.tileAcceptRateSub") },
            { label: t("dashboard.talentDrawers.analytics.tileBookingsYtd"),      value: s.bookingsYTD, sub: t("dashboard.talentDrawers.analytics.tileBookingsYtdSub") },
            { label: t("dashboard.talentDrawers.analytics.tileAvgDayRateYtd"),  value: `€${s.avgRateYTD.toLocaleString()}`, sub: t("dashboard.talentDrawers.analytics.tileAvgDayRateYtdSub") },
          ].map((tile) => (
            <div key={tile.label} style={{
              background: COLORS.surfaceAlt, borderRadius: RADIUS.lg,
              padding: "14px 16px", border: `1px solid ${COLORS.border}`,
            }}>
              <div style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }} className="text-admin-ink-muted">
                {tile.label}
              </div>
              <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 2 }} className="text-admin-ink">
                {tile.value}
              </div>
              <div style={{ fontSize: 11, color: (tile as { label: string; value: string | number; sub: string; subColor?: string }).subColor ?? COLORS.inkMuted }}>
                {tile.sub}
              </div>
            </div>
          ))}
        </div>

        {/* Rate trend sparkline */}
        <div style={{ padding: "14px 16px", border: `1px solid ${COLORS.border}` }} className="bg-admin-surface-alt rounded-admin-lg">
          <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }} className="text-admin-ink-muted">
            {t("dashboard.talentDrawers.analytics.rateTrendTitle")}
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
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4, fontSize: 10.5 }} className="text-admin-ink-muted">
            <span>€{minRate.toLocaleString()}</span>
            <span>€{maxRate.toLocaleString()}</span>
          </div>
        </div>

        {/* Top clients */}
        <div>
          <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }} className="text-admin-ink-muted">
            {t("dashboard.talentDrawers.analytics.topClientsTitle")}
          </div>
          <div className="flex flex-col gap-1.5">
            {s.topClients.map((c) => (
              <div key={c.name} style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                padding: "10px 14px", background: COLORS.surfaceAlt,
                borderRadius: RADIUS.md, border: `1px solid ${COLORS.borderSoft}`,
              }}>
                <div>
                  <div className="text-admin-ink text-admin-13 font-semibold">{c.name}</div>
                  <div style={{ fontSize: 11, marginTop: 1 }} className="text-admin-ink-muted">{interpolate(t("dashboard.talentDrawers.analytics.clientBookings"), { count: c.bookings })}</div>
                </div>
                <div className="text-admin-ink text-admin-13 font-bold">
                  €{c.spend.toLocaleString()}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* WS-18.4 — AI talent-side insights */}
        <div style={{ padding: "14px 16px", border: `1px solid rgba(95,75,139,0.15)` }} className="bg-admin-royal-soft rounded-admin-lg">
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
            <Icon name="sparkle" size={13} color={COLORS.royal} stroke={1.7} />
            <span style={{ fontFamily: FONTS.body, fontSize: 10.5, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase" }} className="text-admin-royal">
              {t("dashboard.talentDrawers.analytics.aiInsights")}
            </span>
          </div>
          <div className="flex flex-col gap-2">
            {(
              [
                {
                  icon: "bolt" as const,
                  body: interpolate(t("dashboard.talentDrawers.analytics.aiInsightPricing"), { count: 7, rate: s.acceptRate }),
                  tone: "amber" as const,
                },
                {
                  icon: "star" as const,
                  body: interpolate(t("dashboard.talentDrawers.analytics.aiInsightTrend"), { amount: (s.rateHistory[s.rateHistory.length - 1] - s.rateHistory[0]).toLocaleString() }),
                  tone: "green" as const,
                },
                {
                  icon: "user" as const,
                  body: interpolate(t("dashboard.talentDrawers.analytics.aiInsightConcentration"), { client: s.topClients[0].name, pct: Math.round((s.topClients[0].spend / (s.topClients.reduce((a, c) => a + c.spend, 0))) * 100) }),
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
  const { state, closeDrawer } = useAdminShell();
  const t = useT();
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
        aria-label={interpolate(t("dashboard.talentDrawers.analytics.starsFor"), { count: star, dimension: dim })}
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
      <DrawerShell open={open} onClose={closeDrawer} title={t("dashboard.talentDrawers.analytics.reviewSubmittedTitle")}>
        <div style={{ textAlign: "center", padding: "32px 20px", fontFamily: FONTS.body }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🌟</div>
          <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 8 }} className="text-admin-ink">
            {t("dashboard.talentDrawers.analytics.reviewThanks")}
          </div>
          <div className="text-admin-ink-muted text-admin-13">
            {t("dashboard.talentDrawers.analytics.reviewThanksBody")}
          </div>
          <div className="mt-5"><PrimaryButton onClick={closeDrawer}>{t("dashboard.talentDrawers.done")}</PrimaryButton></div>
        </div>
      </DrawerShell>
    );
  }

  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title={t("dashboard.talentDrawers.analytics.reviewFromClientTitle")}
      description={t("dashboard.talentDrawers.analytics.reviewFromClientDesc")}
      footer={
        <>
          <SecondaryButton onClick={closeDrawer}>{t("dashboard.talentDrawers.analytics.skip")}</SecondaryButton>
          <PrimaryButton
            disabled={!allRated}
            onClick={() => { setSubmitted(true); }}
          >
            {t("dashboard.talentDrawers.analytics.publishReview")}
          </PrimaryButton>
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 16, fontFamily: FONTS.body }}>
        <div style={{ padding: "12px 14px", border: `1px solid ${COLORS.border}`, fontSize: 13 }} className="bg-admin-surface-alt rounded-admin-lg text-admin-ink-muted">
          {t("dashboard.talentDrawers.analytics.reviewIntro")}
        </div>

        {/* Dimension ratings */}
        {REVIEW_DIMENSIONS.map((d) => (
          <div key={d.key} style={{ borderBottom: `1px solid ${COLORS.borderSoft}`, paddingBottom: 12 }}>
            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 2 }} className="text-admin-ink">{t(REVIEW_DIMENSION_KEYS[d.key].label)}</div>
            <div style={{ fontSize: 11.5, marginBottom: 6 }} className="text-admin-ink-muted">{t(REVIEW_DIMENSION_KEYS[d.key].hint)}</div>
            <div className="flex gap-0.5">
              {[1, 2, 3, 4, 5].map((s) => <Star key={s} dim={d.key} star={s} />)}
              {ratings[d.key] && (
                <span style={{ marginLeft: 6, fontSize: 12, alignSelf: "center" }} className="text-admin-ink-muted">
                  {(() => { const key = RATING_WORD_KEYS[ratings[d.key] ?? 0]; return key ? t(key) : ""; })()}
                </span>
              )}
            </div>
          </div>
        ))}

        {/* Written comment */}
        <div>
          <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6 }} className="text-admin-ink">{t("dashboard.talentDrawers.analytics.writtenFeedback")}</div>
          <div style={{ padding: "12px 14px", background: "#fff", border: `1px solid ${COLORS.border}`, fontSize: 13, lineHeight: 1.6, fontStyle: "italic" }} className="rounded-admin-md text-admin-ink">
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
  const { state, closeDrawer, openDrawer, bridgeTalentSelfProfile } = useAdminShell();
  const t = useT();
  const copy = useDashboardText();
  const open = state.drawer.drawerId === "talent-agency-analytics";
  // Real talent → honest empty state; per-agency earnings already live on Money.
  if (bridgeTalentSelfProfile) {
    return (
      <DrawerShell
        open={open}
        onClose={closeDrawer}
        title={t("dashboard.talentDrawers.analytics.agencyAnalyticsTitle")}
        description={t("dashboard.talentDrawers.analytics.agencyAnalyticsDesc")}
      >
        <AnalyticsNotAvailableYet
          body={copy.t("Per-agency performance appears here as your bookings build up. Your earnings and commission per agency are live on the Money page today.")}
        />
      </DrawerShell>
    );
  }
  const totalRevenue = AGENCY_STATS.reduce((s, a) => s + a.revenue, 0);
  const totalBookings = AGENCY_STATS.reduce((s, a) => s + a.bookings, 0);

  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title={t("dashboard.talentDrawers.analytics.agencyAnalyticsTitle")}
      description={t("dashboard.talentDrawers.analytics.agencyAnalyticsDesc")}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 14, fontFamily: FONTS.body }}>

        {/* Summary row */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          {[
            { label: t("dashboard.talentDrawers.analytics.totalBookingsYtd"),  value: totalBookings },
            { label: t("dashboard.talentDrawers.analytics.totalRevenueYtd"),   value: `€${totalRevenue.toLocaleString()}` },
          ].map((tile) => (
            <div key={tile.label} style={{
              background: COLORS.surfaceAlt, borderRadius: RADIUS.lg,
              padding: "12px 14px", border: `1px solid ${COLORS.border}`,
            }}>
              <div style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 3 }} className="text-admin-ink-muted">
                {tile.label}
              </div>
              <div className="text-admin-ink text-admin-22 font-extrabold">{tile.value}</div>
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
                <div className="flex items-center gap-2">
                  <div style={{
                    width: 24, height: 24, borderRadius: "50%",
                    background: [COLORS.accent, "#3B82F6", "#8B5CF6"][i] ?? COLORS.ink,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 10, fontWeight: 700, color: "#fff",
                  }}>
                    {i + 1}
                  </div>
                  <span className="text-admin-ink text-admin-13 font-bold">{a.name}</span>
                </div>
                <button
                  type="button"
                  onClick={() => openDrawer("talent-agency-relationship")}
                  style={{
                    background: "none", border: "none", cursor: "pointer",
                    fontSize: 12, color: COLORS.accent, fontFamily: FONTS.body,
                  }}
                >
                  {t("dashboard.talentDrawers.analytics.viewAgency")} →
                </button>
              </div>

              {/* Stats */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 0 }}>
                {[
                  { label: t("dashboard.talentDrawers.analytics.statBookings"),    value: `${a.bookings} (${pct}%)` },
                  { label: t("dashboard.talentDrawers.analytics.statRevenue"),     value: `€${a.revenue.toLocaleString()}` },
                  { label: t("dashboard.talentDrawers.analytics.statAcceptRate"), value: `${a.acceptRate}%` },
                ].map((stat, j) => (
                  <div key={stat.label} style={{
                    padding: "10px 14px", textAlign: "center",
                    borderRight: j < 2 ? `1px solid ${COLORS.borderSoft}` : "none",
                  }}>
                    <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em" }} className="text-admin-ink-muted">
                      {stat.label}
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 700, marginTop: 2 }} className="text-admin-ink">
                      {stat.value}
                    </div>
                  </div>
                ))}
              </div>

              {/* Booking share bar */}
              <div style={{ padding: "8px 14px 12px" }}>
                <div style={{ height: 4, borderRadius: 999, overflow: "hidden" }} className="bg-admin-surface-alt">
                  <div style={{ '--progress-w': `${pct}%`, '--progress-bg': [COLORS.accent, "#3B82F6", "#8B5CF6"][i] ?? COLORS.ink }} className="w-[var(--progress-w)] h-full rounded-full bg-[var(--progress-bg)]" />
                </div>
                <div style={{ fontSize: 10.5, marginTop: 3 }} className="text-admin-ink-muted">
                  {interpolate(t("dashboard.talentDrawers.analytics.shareOfBookings"), { pct })}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </DrawerShell>
  );
}
