import { Flame } from "lucide-react";
import { notFound } from "next/navigation";

import { getTenantScopeBySlug } from "@/lib/saas/scope";
import { userHasCapability } from "@/lib/access";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { getRequestLocale } from "@/i18n/request-locale";
import { createTranslator } from "@/i18n/messages";
import { listBoard } from "@/lib/preparation/tickets";
import { tenantTimezone } from "@/lib/spaces/venues";
import { venueHhmm, venueZoneLabel } from "@/lib/spaces/venue-clock";
import { interpolate } from "@/i18n/interpolate";

import { PreparationClient } from "./prep-client";
import { preparationCopy } from "./prep-copy";

export const dynamic = "force-dynamic";

type PageParams = Promise<{ tenantSlug: string }>;

/** `Fri 11 Sep` in the venue's zone; the date part of the station's subtitle. */
function venueDay(now: Date, timeZone: string, locale: string): string {
  try {
    return new Intl.DateTimeFormat(locale, { timeZone, weekday: "short", day: "numeric", month: "short" }).format(now);
  } catch {
    return "";
  }
}

/**
 * The kitchen station (T26): the destination the workspace rail calls
 * Preparation, drawn as the station's own screen. The header names the
 * station and the moment; the client draws the tabs and the cards.
 */
export default async function PreparationPage({ params }: { params: PageParams }) {
  const { tenantSlug } = await params;
  const scope = await getTenantScopeBySlug(tenantSlug);
  if (!scope) notFound();
  const allowed = await userHasCapability("view_dashboard", scope.tenantId);
  if (!allowed) notFound();

  const locale = await getRequestLocale();
  const tr = await createTranslator(locale);
  const admin = createServiceRoleClient();
  if (!admin) notFound();

  const now = new Date();
  const board = await listBoard(admin, scope.tenantId);
  // A promise time is the KITCHEN's clock. Same read path and same reasoning
  // as the floor: see `lib/spaces/venue-clock.ts`.
  const timeZone = await tenantTimezone(scope.tenantId);
  const zoneNote = interpolate(tr("dashboard.preparation.timesInZone"), {
    zone: venueZoneLabel(timeZone, locale, now),
  });
  const copy = preparationCopy(tr);

  const tickets = board.ok ? board.tickets.filter((t) => t.status !== "cancelled") : [];
  const preparing = tickets.filter((t) => t.status === "acknowledged").length;
  const queued = tickets.filter((t) => t.status === "queued").length;
  const ready = tickets.filter((t) => t.status === "ready" && !t.handedOffAt).length;
  // The station's name: the tickets' own `station` when it is not the
  // default, else the screen's word alone ("Kitchen", never "Kitchen · kitchen").
  const stations = [...new Set(tickets.map((t) => t.station).filter((s) => s && s !== "kitchen"))];
  const title = stations.length > 0 ? `${tr("dashboard.preparation.pageTitle")} · ${stations.join(" · ")}` : tr("dashboard.preparation.pageTitle");

  return (
    <main className="flex min-h-[calc(100vh-56px)] flex-col bg-admin-surface">
      <header className="flex h-16 shrink-0 items-center gap-3 border-b border-admin-border bg-admin-card px-6">
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-admin-brand-soft text-admin-brand">
          <Flame aria-hidden size={20} strokeWidth={1.75} />
        </span>
        <div className="min-w-0">
          <h1 className="m-0 truncate text-[19px] font-semibold leading-[1.2] tracking-[-0.01em] text-admin-ink">{title}</h1>
          <p className="m-0 truncate text-[13px] text-admin-ink-muted">
            {interpolate(tr("dashboard.preparation.subtitle"), {
              date: venueDay(now, timeZone, locale),
              time: venueHhmm(now.toISOString(), timeZone, locale),
              preparing,
              queued,
              ready,
            })}
          </p>
        </div>
      </header>
      <div className="flex min-h-0 flex-1 flex-col py-5">
        {!board.ok ? (
          <p className="m-0 px-6 text-[15px] text-admin-red">{tr("dashboard.preparation.unavailable")}</p>
        ) : (
          <PreparationClient locale={locale} timeZone={timeZone} zoneNote={zoneNote} nowIso={now.toISOString()} tickets={board.tickets} copy={copy} />
        )}
      </div>
    </main>
  );
}
