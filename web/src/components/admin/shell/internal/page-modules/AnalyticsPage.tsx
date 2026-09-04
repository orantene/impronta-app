"use client";

// WP1 (dashboard-rails, 2026-09-02) — Analytics page-module.
// Consolidates the honest, real-data analytics that were scattered across the
// deleted Operations page and the Website sub-nav. Four tabs:
//   Funnel  — inquiry-stage funnel derived live from the shell's inquiries.
//   Money   — links to the canonical Financials route (manage_billing-gated).
//   Website — the existing WebsiteAnalyticsPage (visits/inquiries/bookings).
//   Reviews — tenant rating rollup from the real moderation-integrity signals.
// Every number is real. Where there is no data the tab shows an honest empty
// state; nothing is invented.

import { useEffect, useState } from "react";
import { useT } from "@/i18n/use-t";
import { useAdminShell } from "../state";
import { PageHeader } from "./pages-shared";
import { WebsiteAnalyticsPage } from "./WebsiteAnalyticsPage";
import type { ModerationIntegritySignal } from "@/lib/reviews/review-moderation-loaders";

type Tab = "funnel" | "money" | "website" | "reviews";

export function AnalyticsPage() {
  const t = useT();
  const [tab, setTab] = useState<Tab>("funnel");

  const tabs: { id: Tab; label: string }[] = [
    { id: "funnel", label: t("dashboard.adminAnalytics.tabFunnel") },
    { id: "money", label: t("dashboard.adminAnalytics.tabMoney") },
    { id: "website", label: t("dashboard.adminAnalytics.tabWebsite") },
    { id: "reviews", label: t("dashboard.adminAnalytics.tabReviews") },
  ];

  return (
    <>
      <PageHeader
        eyebrow={t("dashboard.adminAnalytics.eyebrow")}
        title={t("dashboard.adminAnalytics.title")}
        subtitle={t("dashboard.adminAnalytics.subtitle")}
      />
      <div role="tablist" className="mb-[18px] inline-flex rounded-full border border-admin-border-soft bg-admin-surface-alt p-[3px]">
        {tabs.map((tb) => {
          const active = tab === tb.id;
          return (
            <button
              key={tb.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setTab(tb.id)}
              className={`cursor-pointer rounded-full border-none px-[14px] py-[6px] text-admin-11h font-semibold [transition:background_120ms,color_120ms] ${
                active ? "bg-admin-card text-admin-ink shadow-admin-rest" : "bg-transparent text-admin-ink-muted"
              }`}
            >
              {tb.label}
            </button>
          );
        })}
      </div>

      {tab === "funnel" && <FunnelTab />}
      {tab === "money" && <MoneyTab />}
      {tab === "website" && <WebsiteAnalyticsPage />}
      {tab === "reviews" && <ReviewsTab />}
    </>
  );
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-[12px] border border-admin-border-soft bg-admin-card px-[16px] py-[14px]">
      <div className="mb-[4px] text-[10.5px] font-bold uppercase tracking-[0.6px] text-admin-ink-muted">{label}</div>
      <div className="text-[26px] font-semibold leading-none text-admin-ink [font-variant-numeric:tabular-nums]">{value}</div>
      {sub && <div className="mt-[4px] text-[11px] text-admin-ink-muted">{sub}</div>}
    </div>
  );
}

function FunnelTab() {
  const t = useT();
  const { effectiveMessagesInquiries } = useAdminShell();
  const inqs = effectiveMessagesInquiries;
  const received = inqs.filter((i) => i.stage !== "draft").length;
  const active = inqs.filter((i) => ["submitted", "coordination", "offer_pending", "approved"].includes(i.stage)).length;
  const offerSent = inqs.filter((i) => ["offer_pending", "approved", "booked"].includes(i.stage)).length;
  const approved = inqs.filter((i) => ["approved", "booked"].includes(i.stage)).length;
  const booked = inqs.filter((i) => i.stage === "booked").length;
  const lost = inqs.filter((i) => ["rejected", "expired"].includes(i.stage)).length;
  const pct = (n: number) => (received > 0 ? `${Math.round((n / received) * 100)}%` : "—");

  if (received === 0) {
    return <EmptyState body={t("dashboard.adminAnalytics.funnelEmpty")} />;
  }
  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-[12px]">
      <StatCard label={t("dashboard.adminAnalytics.received")} value={String(received)} sub={t("dashboard.adminAnalytics.receivedSub")} />
      <StatCard label={t("dashboard.adminAnalytics.active")} value={String(active)} sub={pct(active)} />
      <StatCard label={t("dashboard.adminAnalytics.offerSent")} value={String(offerSent)} sub={pct(offerSent)} />
      <StatCard label={t("dashboard.adminAnalytics.approved")} value={String(approved)} sub={pct(approved)} />
      <StatCard label={t("dashboard.adminAnalytics.booked")} value={String(booked)} sub={pct(booked)} />
      <StatCard label={t("dashboard.adminAnalytics.lost")} value={String(lost)} sub={pct(lost)} />
    </div>
  );
}

function MoneyTab() {
  const t = useT();
  const { adminBasePath } = useAdminShell();
  return (
    <div className="rounded-[12px] border border-admin-border-soft bg-admin-card p-[24px]">
      <div className="mb-[6px] text-admin-15 font-semibold text-admin-ink">{t("dashboard.adminAnalytics.moneyTitle")}</div>
      <p className="m-0 mb-[16px] max-w-[520px] text-admin-13 leading-[1.6] text-admin-ink-muted">
        {t("dashboard.adminAnalytics.moneyBody")}
      </p>
      <a
        href={`${adminBasePath}/financials`}
        className="inline-flex items-center gap-[6px] rounded-[9px] bg-admin-ink px-[16px] py-[9px] text-admin-13 font-semibold text-white no-underline"
      >
        {t("dashboard.adminAnalytics.moneyCta")}
      </a>
      {/*
        The Orders desk sits beside Financials because both are canonical
        server routes, and a plain <a> is deliberate: `setPage` flips the SPA's
        page state BEFORE the route commits, and a canonical route has no
        page-module to render in that frame, so a rail entry would flash an
        empty surface. Financials is off the rail for the same reason. Where
        Orders finally belongs in the rail is a product decision, not this PR's.
      */}
      <p className="m-0 mb-[16px] mt-[20px] max-w-[520px] text-admin-13 leading-[1.6] text-admin-ink-muted">
        {t("dashboard.adminAnalytics.ordersBody")}
      </p>
      <a
        href={`${adminBasePath}/orders`}
        className="inline-flex items-center gap-[6px] rounded-[9px] border border-admin-border-soft px-[16px] py-[9px] text-admin-13 font-semibold text-admin-ink no-underline"
      >
        {t("dashboard.adminAnalytics.ordersCta")}
      </a>
    </div>
  );
}

function ReviewsTab() {
  const t = useT();
  const { bridgeTenantIdentity } = useAdminShell();
  const tenantId = bridgeTenantIdentity?.tenantId ?? "";
  const [signals, setSignals] = useState<ModerationIntegritySignal[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!tenantId) {
      setSignals([]);
      return;
    }
    import("@/lib/reviews/review-moderation-queue-actions")
      .then(({ loadModerationIntegritySignalsAction }) => loadModerationIntegritySignalsAction(tenantId))
      .then((rows) => {
        if (!cancelled) setSignals(rows);
      })
      .catch(() => {
        if (!cancelled) setSignals([]);
      });
    return () => {
      cancelled = true;
    };
  }, [tenantId]);

  if (signals === null) {
    return <EmptyState body={t("dashboard.adminAnalytics.loading")} />;
  }
  const publishedCount = signals.reduce((sum, s) => sum + s.publicCount, 0);
  const hiddenCount = signals.reduce((sum, s) => sum + s.hiddenCount, 0);
  const weightedAvg =
    publishedCount > 0
      ? signals.reduce((sum, s) => sum + s.publicAvg * s.publicCount, 0) / publishedCount
      : 0;

  if (publishedCount === 0) {
    return <EmptyState body={t("dashboard.adminAnalytics.reviewsEmpty")} />;
  }
  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-[12px]">
      <StatCard label={t("dashboard.adminAnalytics.avgRating")} value={weightedAvg.toFixed(2)} />
      <StatCard label={t("dashboard.adminAnalytics.publishedReviews")} value={String(publishedCount)} />
      <StatCard
        label={t("dashboard.adminAnalytics.talentRated")}
        value={String(signals.filter((s) => s.publicCount > 0).length)}
      />
      {hiddenCount > 0 && (
        <StatCard label={t("dashboard.adminAnalytics.hidden")} value={String(hiddenCount)} />
      )}
    </div>
  );
}

function EmptyState({ body }: { body: string }) {
  return (
    <div className="rounded-[12px] border border-admin-border-soft bg-admin-card p-[28px] text-center text-admin-13 text-admin-ink-muted">
      {body}
    </div>
  );
}
