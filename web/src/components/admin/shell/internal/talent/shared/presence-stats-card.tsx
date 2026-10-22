"use client";

/**
 * TalentPresenceStatsCard (TUL-582): last 30 days of profile visits (Free sees a locked note naming Pro and Max), top 3
 * sources, booking requests and confirmed bookings, with a delta vs the
 * previous 30 days. Reads the layout-bridged `presence` model (collected data
 * only). Renders nothing when the talent has no analytics entitlement.
 */

import Link from "next/link";

import type {
  PresenceSource,
  PresenceSourceKey,
  TalentPresenceStats,
} from "@/lib/analytics/talent-presence-stats";
import { useDashboardText } from "../../dashboard-i18n";
import { useAdminShell } from "../../state";

const SOURCE_LABELS: Record<Exclude<PresenceSourceKey, "other">, { en: string; es: string }> = {
  direct: { en: "Direct", es: "Directo" },
  google: { en: "Google", es: "Google" },
  instagram: { en: "Instagram", es: "Instagram" },
  whatsapp: { en: "WhatsApp", es: "WhatsApp" },
  facebook: { en: "Facebook", es: "Facebook" },
  tiktok: { en: "TikTok", es: "TikTok" },
  linkedin: { en: "LinkedIn", es: "LinkedIn" },
  youtube: { en: "YouTube", es: "YouTube" },
  x: { en: "X", es: "X" },
  tulala: { en: "Tulala", es: "Tulala" },
};

export function presenceSourceLabel(s: PresenceSource, isSpanish: boolean): string {
  if (s.key === "other") return s.host ?? (isSpanish ? "Otros" : "Other");
  return SOURCE_LABELS[s.key][isSpanish ? "es" : "en"];
}

function Delta({ pct, isSpanish }: { pct: number | null; isSpanish: boolean }) {
  if (pct === null) return <span className="text-xs text-admin-ink-muted">{isSpanish ? "Sin base previa" : "No prior data"}</span>;
  const up = pct >= 0;
  return (
    <span className={`text-xs ${up ? "text-admin-ink" : "text-admin-ink-muted"}`}>
      {up ? "+" : "-"}
      {Math.abs(pct)}% {isSpanish ? "vs 30 dias previos" : "vs previous 30 days"}
    </span>
  );
}

function Metric({
  label,
  value,
  pct,
  isSpanish,
}: {
  label: string;
  value: number;
  pct: number | null;
  isSpanish: boolean;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <span className="text-xs text-admin-ink-muted">{label}</span>
      <span className="text-2xl font-semibold tabular-nums text-admin-ink">{value}</span>
      <Delta pct={pct} isSpanish={isSpanish} />
    </div>
  );
}

export function TalentPresenceStatsCard() {
  const copy = useDashboardText();
  const { bridgeTalentPageAnalytics, talentTier } = useAdminShell();
  const stats: TalentPresenceStats | undefined = bridgeTalentPageAnalytics?.presence;
  const es = copy.isSpanish;
  if (!stats) {
    // Plan gate: visits, sources and bookings are Pro and Max. Say so instead of showing nothing.
    if (talentTier !== "free") return null;
    return (
      <section
        aria-label={es ? "Mi presencia, ultimos 30 dias" : "My presence, last 30 days"}
        className="rounded-admin-lg border border-admin-border bg-admin-card p-4"
      >
        <h2 className="text-sm font-semibold text-admin-ink">{es ? "Mi presencia" : "My presence"}</h2>
        <p className="mt-1 text-sm text-admin-ink-muted">
          {es
            ? "Visitas, de dónde llegan y solicitudes de tu perfil están en los planes Pro y Max."
            : "Visits, where they come from and requests for your profile are on the Pro and Max plans."}
        </p>
        <Link href="/talent/plan" className="mt-2 inline-block text-xs text-admin-ink-muted underline-offset-2 hover:underline">
          {es ? "Ver planes" : "See plans"}
        </Link>
      </section>
    );
  }

  return (
    <section
      aria-label={es ? "Mi presencia, ultimos 30 dias" : "My presence, last 30 days"}
      className="rounded-admin-lg border border-admin-border bg-admin-card p-4"
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-admin-ink">
          {es ? "Mi presencia" : "My presence"}
          <span className="ml-2 font-normal text-admin-ink-muted">{es ? "ultimos 30 dias" : "last 30 days"}</span>
        </h2>
        <Link href="/talent/site" className="text-xs text-admin-ink-muted underline-offset-2 hover:underline">
          {es ? "Ver sitio" : "View site"}
        </Link>
      </div>

      {stats.isEmpty ? (
        <p className="text-sm text-admin-ink-muted">
          {es
            ? "Aun no hay visitas ni solicitudes. Comparte el enlace de tu perfil y aqui veras de donde llegan."
            : "No visits or requests yet. Share your profile link and you will see where people come from here."}
        </p>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-4">
            <Metric label={es ? "Visitas" : "Visits"} value={stats.last30d.visits} pct={stats.deltaPct.visits} isSpanish={es} />
            <Metric label={es ? "Solicitudes" : "Requests"} value={stats.last30d.requests} pct={stats.deltaPct.requests} isSpanish={es} />
            <Metric label={es ? "Confirmadas" : "Confirmed"} value={stats.last30d.confirmed} pct={stats.deltaPct.confirmed} isSpanish={es} />
          </div>
          {stats.topSources.length > 0 && (
            <ul className="mt-4 flex flex-col gap-1.5 border-t border-admin-border pt-3">
              {stats.topSources.map((s) => (
                <li key={`${s.key}:${s.host ?? ""}`} className="flex items-center gap-3 text-sm">
                  <span className="flex-1 truncate text-admin-ink">{presenceSourceLabel(s, es)}</span>
                  <span className="shrink-0 text-right tabular-nums text-admin-ink-muted">{s.sharePct}%</span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
