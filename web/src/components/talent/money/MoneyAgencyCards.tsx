"use client";

import Link from "next/link";
import { MY_AGENCIES, useAdminShell } from "@/components/admin/shell/internal/state";
import { TalentSectionLabel } from "@/components/talent/talent-dashboard-primitives";
import { agencyRosterProfileUrl } from "@/lib/talent/agency-roster-profile-url";
import { formatEurCents } from "@/lib/talent/earnings-view";
import { Building2 } from "lucide-react";
import { useResolvedTalentEarnings } from "./use-resolved-talent-earnings";

function planLabel(plan: string): string {
  if (plan === "agency") return "Agency";
  if (plan === "studio") return "Studio";
  return "Free";
}

function exclusivityLabel(status: string): string {
  if (status === "exclusive") return "Exclusive";
  if (status === "non-exclusive" || status === "non_exclusive") return "Non-exclusive";
  if (status === "ended") return "Ended";
  if (status === "pending") return "Pending";
  return "Active";
}

export function MoneyAgencyCards() {
  const { openDrawer, bridgeTalentAgencies, bridgeTalentSelfProfile } = useAdminShell();
  const earnings = useResolvedTalentEarnings();

  const agencies =
    bridgeTalentAgencies !== null
      ? bridgeTalentAgencies.map((agency) => {
          const stats = earnings.perAgency.find(
            (row) => row.slug === agency.agencySlug || row.tenantId === agency.id,
          );
          return {
            id: agency.id,
            name: agency.agencyName,
            slug: agency.agencySlug,
            plan: agency.plan,
            rosterStatus: agency.rosterStatus,
            isPrimary: agency.isPrimary,
            ytdNetCents: stats?.ytdNetCents ?? 0,
            bookingsCount: stats?.bookingsCount ?? 0,
            commissionBps: stats?.commissionBps ?? 0,
          };
        })
      : MY_AGENCIES.map((agency) => ({
          id: agency.id,
          name: agency.name,
          slug: agency.slug,
          plan: agency.planTier,
          rosterStatus: agency.status,
          isPrimary: agency.isPrimary,
          ytdNetCents: 0,
          bookingsCount: agency.bookingsYTD,
          commissionBps: Math.round(agency.commissionRate * 10000),
        }));

  const profileCode = bridgeTalentSelfProfile?.profileCode ?? null;

  return (
    <section className="space-y-4">
      <TalentSectionLabel icon={Building2}>
        Your agencies ({agencies.length})
      </TalentSectionLabel>

      {agencies.length === 0 ? (
        <div className="rounded-admin-lg border border-dashed border-admin-border-soft bg-admin-surface-alt px-6 py-10 text-center">
          <p className="text-sm font-medium text-admin-ink">No agencies yet</p>
          <p className="mt-1 text-sm text-admin-ink-muted">
            Agencies invite talent — keep your profile up to date so the right ones find you.
          </p>
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {agencies.map((agency) => {
            const rosterUrl = agencyRosterProfileUrl(agency.slug, profileCode);
            const commissionPct =
              agency.commissionBps > 0
                ? `${(agency.commissionBps / 100).toFixed(1)}%`
                : "—";

            return (
              <article
                key={agency.id}
                className="flex flex-col gap-4 rounded-admin-lg border border-admin-border-soft bg-admin-card p-4 shadow-admin-rest"
              >
                <div className="flex items-start gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-lg ring-1 ring-emerald-100">
                    🏢
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="truncate text-sm font-semibold text-admin-ink">
                        {agency.name}
                      </h3>
                      {agency.isPrimary ? (
                        <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-800 ring-1 ring-emerald-100">
                          Primary
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-2">
                      <span className="rounded-full bg-admin-surface-alt px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-admin-ink-muted">
                        {planLabel(agency.plan)}
                      </span>
                      <span className="rounded-full bg-admin-surface-alt px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-admin-ink-muted">
                        {exclusivityLabel(agency.rosterStatus)}
                      </span>
                    </div>
                  </div>
                </div>

                <dl className="grid grid-cols-3 gap-3 text-center">
                  <div>
                    <dt className="text-[10px] font-bold uppercase tracking-wide text-admin-ink-muted">
                      YTD net
                    </dt>
                    <dd className="mt-1 text-sm font-semibold tabular-nums text-admin-ink">
                      {formatEurCents(agency.ytdNetCents)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[10px] font-bold uppercase tracking-wide text-admin-ink-muted">
                      Bookings
                    </dt>
                    <dd className="mt-1 text-sm font-semibold tabular-nums text-admin-ink">
                      {agency.bookingsCount}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[10px] font-bold uppercase tracking-wide text-admin-ink-muted">
                      Commission
                    </dt>
                    <dd className="mt-1 text-sm font-semibold tabular-nums text-admin-ink">
                      {commissionPct}
                    </dd>
                  </div>
                </dl>

                <div className="flex flex-wrap gap-2">
                  {rosterUrl ? (
                    <Link
                      href={rosterUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex flex-1 items-center justify-center rounded-lg border border-admin-border-soft px-3 py-2 text-xs font-semibold text-admin-ink hover:bg-admin-surface-alt"
                    >
                      View roster profile
                    </Link>
                  ) : (
                    <span className="inline-flex flex-1 items-center justify-center rounded-lg border border-dashed border-admin-border-soft px-3 py-2 text-xs text-admin-ink-muted">
                      Profile code pending
                    </span>
                  )}
                  <button
                    type="button"
                    className="inline-flex flex-1 items-center justify-center rounded-lg bg-admin-accent px-3 py-2 text-xs font-semibold text-white hover:bg-admin-accent-deep"
                    onClick={() => openDrawer("talent-agency-relationship", { agencyId: agency.id })}
                  >
                    Manage relationship
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <div className="rounded-admin-lg border border-admin-border-soft bg-admin-surface-alt p-4">
        <p className="text-sm text-admin-ink-muted">
          On Tulala, agencies invite talent — not the other way around. Share your public profile
          with an agency and they can request you onto their roster.
        </p>
        <button
          type="button"
          className="mt-3 inline-flex items-center rounded-lg bg-admin-accent px-4 py-2 text-sm font-semibold text-white hover:bg-admin-accent-deep"
          onClick={() => openDrawer("talent-agency-relationship", { mode: "add" })}
        >
          Share my profile →
        </button>
      </div>
    </section>
  );
}
