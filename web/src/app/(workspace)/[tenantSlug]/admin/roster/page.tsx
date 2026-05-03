// Phase 3 — canonical workspace roster page.
// Server Component — no "use client".
//
// Renders the full talent roster for the tenant identified by `tenantSlug`.
// Data via `loadWorkspaceRosterForTenant()` — explicit tenantId, no mock data.
// Capability gate: agency.roster.view.

import { notFound } from "next/navigation";
import Link from "next/link";
import { getTenantScopeBySlug } from "@/lib/saas/scope";
import { userHasCapability } from "@/lib/access";
import { loadWorkspaceRosterForTenant } from "../../_data-bridge";
import {
  ADMIN_PAGE_STACK,
  ADMIN_TEXT_DISPLAY_LG,
  ADMIN_TEXT_EYEBROW,
  ADMIN_HOME_SECTION_GAP,
} from "@/lib/dashboard-shell-classes";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

type PageParams = Promise<{ tenantSlug: string }>;

// State → display label + colour
const STATE_META: Record<
  string,
  { label: string; className: string }
> = {
  published: {
    label: "Published",
    className: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  },
  draft: {
    label: "Draft",
    className: "bg-neutral-500/10 text-neutral-600 dark:text-neutral-400",
  },
  invited: {
    label: "Invited",
    className: "bg-sky-500/15 text-sky-700 dark:text-sky-400",
  },
  "awaiting-approval": {
    label: "Pending",
    className: "bg-amber-500/15 text-amber-700 dark:text-amber-500",
  },
  claimed: {
    label: "Claimed",
    className: "bg-violet-500/15 text-violet-700 dark:text-violet-400",
  },
};

function StateChip({ state }: { state: string }) {
  const meta = STATE_META[state] ?? {
    label: state,
    className: "bg-neutral-500/10 text-neutral-600",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium",
        meta.className,
      )}
    >
      {meta.label}
    </span>
  );
}

export default async function WorkspaceRosterPage({
  params,
}: {
  params: PageParams;
}) {
  const { tenantSlug } = await params;

  const scope = await getTenantScopeBySlug(tenantSlug);
  if (!scope) notFound();

  const canView = await userHasCapability("agency.roster.view", scope.tenantId);
  if (!canView) notFound();

  const canEdit = await userHasCapability("agency.roster.edit", scope.tenantId);

  const roster = await loadWorkspaceRosterForTenant(scope.tenantId);

  return (
    <div className={ADMIN_PAGE_STACK}>
      <div className={ADMIN_HOME_SECTION_GAP}>
        {/* Header */}
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className={ADMIN_TEXT_EYEBROW}>{scope.membership.display_name}</p>
            <h1 className={ADMIN_TEXT_DISPLAY_LG}>
              Roster
              <span className="ml-2 text-[var(--admin-nav-idle)] text-base font-normal">
                {roster.length}
              </span>
            </h1>
          </div>
          {canEdit && (
            <Link
              href={`/${tenantSlug}/admin/roster/new`}
              className="rounded-lg bg-[var(--admin-accent)] px-3.5 py-1.5 text-sm font-medium text-white hover:opacity-90 transition-opacity"
            >
              Add talent
            </Link>
          )}
        </div>

        {/* Roster list */}
        {roster.length === 0 ? (
          <div className="rounded-xl border border-[var(--admin-border)] bg-[var(--admin-card-bg)] px-6 py-12 text-center">
            <p className="text-sm text-[var(--admin-nav-idle)]">
              No talent on this roster yet.
            </p>
          </div>
        ) : (
          <div className="rounded-xl border border-[var(--admin-border)] bg-[var(--admin-card-bg)] divide-y divide-[var(--admin-border)]">
            {roster.map((talent) => (
              <div
                key={talent.id}
                className="flex items-center gap-3 px-4 py-3"
              >
                {/* Avatar placeholder — thumb wired in Phase 3.3+ */}
                <div
                  className="h-9 w-9 flex-none rounded-full bg-[var(--admin-nav-idle)]/20 flex items-center justify-center text-xs font-semibold text-[var(--admin-nav-idle)] uppercase select-none"
                  aria-hidden
                >
                  {talent.name.charAt(0)}
                </div>

                {/* Name + meta */}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-[var(--admin-workspace-fg)]">
                    {talent.name}
                  </p>
                  <p className="truncate text-xs text-[var(--admin-nav-idle)]">
                    {[talent.primaryType, talent.city]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>

                {/* State chip */}
                <StateChip state={talent.state} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
