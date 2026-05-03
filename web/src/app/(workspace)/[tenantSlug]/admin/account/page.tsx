// Phase 3 — canonical workspace Account & Billing page.
// Server Component — no "use client".
//
// Shows plan tier, roster usage, and agency identity for the tenant
// identified by `tenantSlug`. Manage-billing CTA gated on manage_billing
// (admin+).
//
// Data via `loadWorkspaceAgencySummary()` — explicit tenantId.
// Capability gate: agency.workspace.view (viewer+).

import { notFound } from "next/navigation";
import Link from "next/link";
import { getTenantScopeBySlug } from "@/lib/saas/scope";
import { userHasCapability } from "@/lib/access";
import { loadWorkspaceAgencySummary, type WorkspacePlan } from "../../_data-bridge";
import {
  ADMIN_PAGE_STACK,
  ADMIN_TEXT_DISPLAY_LG,
  ADMIN_TEXT_EYEBROW,
  ADMIN_HOME_SECTION_GAP,
} from "@/lib/dashboard-shell-classes";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

type PageParams = Promise<{ tenantSlug: string }>;

// ─── Plan chip ────────────────────────────────────────────────────────────────

const PLAN_META: Record<
  WorkspacePlan,
  { label: string; className: string; tagline: string }
> = {
  free: {
    label: "Free",
    className: "bg-neutral-500/10 text-neutral-600 dark:text-neutral-400",
    tagline: "Friend-link access only. No commission.",
  },
  studio: {
    label: "Studio",
    className: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
    tagline: "Auto-exclusive roster, ~10–12% commission.",
  },
  agency: {
    label: "Agency",
    className: "bg-sky-500/15 text-sky-700 dark:text-sky-400",
    tagline: "Auto-exclusive roster, ~15–20% commission.",
  },
  network: {
    label: "Network",
    className: "bg-violet-500/15 text-violet-700 dark:text-violet-400",
    tagline: "Unlimited roster. Platform-wide placement.",
  },
};

function PlanChip({ plan }: { plan: WorkspacePlan }) {
  const meta = PLAN_META[plan];
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold",
        meta.className,
      )}
    >
      {meta.label}
    </span>
  );
}

// ─── Detail row ───────────────────────────────────────────────────────────────

function DetailRow({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <p className="flex-none w-32 text-xs text-[var(--admin-workspace-fg)]/50">{label}</p>
      <p className="flex-1 min-w-0 text-sm text-[var(--admin-workspace-fg)] truncate">
        {value}
      </p>
    </div>
  );
}

// ─── Roster usage bar ─────────────────────────────────────────────────────────

function RosterUsageBar({
  count,
  limit,
}: {
  count: number;
  limit: number | null;
}) {
  if (limit === null) {
    // Unlimited
    return (
      <div className="flex items-center gap-2 px-4 py-3">
        <p className="flex-none w-32 text-xs text-[var(--admin-workspace-fg)]/50">
          Roster
        </p>
        <div className="flex-1 flex items-center gap-3">
          <span className="text-sm text-[var(--admin-workspace-fg)] tabular-nums font-medium">
            {count}
          </span>
          <span className="text-xs text-[var(--admin-nav-idle)]">
            of unlimited
          </span>
        </div>
      </div>
    );
  }

  const pct = limit > 0 ? Math.min((count / limit) * 100, 100) : 0;
  const nearLimit = pct >= 80;

  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <p className="flex-none w-32 text-xs text-[var(--admin-workspace-fg)]/50">
        Roster
      </p>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span
            className={cn(
              "text-sm font-medium tabular-nums",
              nearLimit
                ? "text-amber-600 dark:text-amber-400"
                : "text-[var(--admin-workspace-fg)]",
            )}
          >
            {count}
          </span>
          <span className="text-xs text-[var(--admin-nav-idle)]">
            of {limit}
          </span>
        </div>
        <div className="h-1 w-full rounded-full bg-[var(--admin-nav-idle)]/15">
          <div
            className={cn(
              "h-1 rounded-full transition-all",
              nearLimit ? "bg-amber-500" : "bg-[var(--admin-accent)]",
            )}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function WorkspaceAccountPage({
  params,
}: {
  params: PageParams;
}) {
  const { tenantSlug } = await params;

  const scope = await getTenantScopeBySlug(tenantSlug);
  if (!scope) notFound();

  const canView = await userHasCapability("agency.workspace.view", scope.tenantId);
  if (!canView) notFound();

  const canManageBilling = await userHasCapability("manage_billing", scope.tenantId);

  const summary = await loadWorkspaceAgencySummary(scope.tenantId);

  return (
    <div className={ADMIN_PAGE_STACK}>
      <div className={ADMIN_HOME_SECTION_GAP}>
        {/* Header */}
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className={ADMIN_TEXT_EYEBROW}>{scope.membership.display_name}</p>
            <h1 className={ADMIN_TEXT_DISPLAY_LG}>Account & billing</h1>
          </div>
          {canManageBilling && (
            <Link
              href="/admin/settings"
              className="rounded-lg border border-[var(--admin-border)] bg-[var(--admin-card-bg)] px-3.5 py-1.5 text-sm font-medium text-[var(--admin-workspace-fg)] hover:bg-[var(--admin-nav-idle)]/10 transition-colors"
            >
              Manage
            </Link>
          )}
        </div>

        {summary ? (
          <>
            {/* Plan */}
            <section>
              <h2 className="text-sm font-semibold text-[var(--admin-workspace-fg)] mb-3">
                Plan
              </h2>
              <div className="rounded-xl border border-[var(--admin-border)] bg-[var(--admin-card-bg)] divide-y divide-[var(--admin-border)]">
                <div className="flex items-center gap-3 px-4 py-3">
                  <p className="flex-none w-32 text-xs text-[var(--admin-workspace-fg)]/50">
                    Current plan
                  </p>
                  <div className="flex items-center gap-2">
                    <PlanChip plan={summary.plan} />
                    <span className="text-xs text-[var(--admin-nav-idle)]">
                      {PLAN_META[summary.plan].tagline}
                    </span>
                  </div>
                </div>
                <RosterUsageBar
                  count={summary.talentCount}
                  limit={summary.talentLimit}
                />
                <DetailRow
                  label="Workspace slug"
                  value={
                    <span className="font-mono text-[13px]">
                      {summary.slug}
                    </span>
                  }
                />
              </div>
            </section>

            {/* Identity */}
            <section>
              <h2 className="text-sm font-semibold text-[var(--admin-workspace-fg)] mb-3">
                Agency identity
              </h2>
              <div className="rounded-xl border border-[var(--admin-border)] bg-[var(--admin-card-bg)] divide-y divide-[var(--admin-border)]">
                <DetailRow label="Display name" value={summary.displayName} />
                {summary.contactEmail && (
                  <DetailRow label="Contact email" value={summary.contactEmail} />
                )}
                {summary.contactPhone && (
                  <DetailRow label="Phone" value={summary.contactPhone} />
                )}
                {summary.addressCity && (
                  <DetailRow
                    label="Location"
                    value={
                      [summary.addressCity, summary.addressCountry]
                        .filter(Boolean)
                        .join(", ") || summary.addressCity
                    }
                  />
                )}
              </div>
              {canManageBilling && (
                <p className="mt-2 px-1 text-xs text-[var(--admin-nav-idle)]">
                  Update identity at{" "}
                  <Link
                    href="/admin/site-settings/identity"
                    className="text-[var(--admin-accent)] hover:opacity-80 transition-opacity"
                  >
                    Site → Identity
                  </Link>
                </p>
              )}
            </section>
          </>
        ) : (
          <div className="rounded-xl border border-[var(--admin-border)] bg-[var(--admin-card-bg)] px-6 py-12 text-center">
            <p className="text-sm text-[var(--admin-nav-idle)]">
              Account details unavailable.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
