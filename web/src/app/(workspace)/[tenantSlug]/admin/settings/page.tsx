// Phase 3 — canonical workspace Settings hub page.
// Server Component — no "use client".
//
// Shows team members, current plan, and links to advanced settings.
// Tenant identified by `tenantSlug`.
// Data via `loadWorkspaceTeamMembers()` — explicit tenantId, no mock data.
// Capability gate: agency.workspace.view (viewer+).
// Manage-team CTA gated on manage_memberships (admin+).

import { notFound } from "next/navigation";
import Link from "next/link";
import { getTenantScopeBySlug } from "@/lib/saas/scope";
import { userHasCapability } from "@/lib/access";
import { loadWorkspaceTeamMembers } from "../../_data-bridge";
import {
  ADMIN_PAGE_STACK,
  ADMIN_TEXT_DISPLAY_LG,
  ADMIN_TEXT_EYEBROW,
  ADMIN_HOME_SECTION_GAP,
} from "@/lib/dashboard-shell-classes";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

type PageParams = Promise<{ tenantSlug: string }>;

// ─── Role display ─────────────────────────────────────────────────────────────

const ROLE_META: Record<string, { label: string; className: string }> = {
  owner: {
    label: "Owner",
    className: "bg-violet-500/15 text-violet-700 dark:text-violet-400",
  },
  admin: {
    label: "Admin",
    className: "bg-sky-500/15 text-sky-700 dark:text-sky-400",
  },
  coordinator: {
    label: "Coordinator",
    className: "bg-amber-500/15 text-amber-700 dark:text-amber-500",
  },
  editor: {
    label: "Editor",
    className: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  },
  viewer: {
    label: "Viewer",
    className: "bg-neutral-500/10 text-neutral-600 dark:text-neutral-400",
  },
};

function RoleChip({ role }: { role: string }) {
  const meta = ROLE_META[role] ?? {
    label: role,
    className: "bg-neutral-500/10 text-neutral-600 dark:text-neutral-400",
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

function PendingChip() {
  return (
    <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium bg-neutral-500/10 text-neutral-500 dark:text-neutral-500">
      Pending
    </span>
  );
}

// ─── Settings quick-link ──────────────────────────────────────────────────────

function SettingsLink({
  href,
  label,
  description,
}: {
  href: string;
  label: string;
  description: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-[var(--admin-nav-idle)]/5 transition-colors group"
    >
      <div>
        <p className="text-sm font-medium text-[var(--admin-workspace-fg)] group-hover:text-[var(--admin-accent)] transition-colors">
          {label}
        </p>
        <p className="text-xs text-[var(--admin-nav-idle)]">{description}</p>
      </div>
      <svg
        className="flex-none h-4 w-4 text-[var(--admin-nav-idle)]"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
        aria-hidden
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
      </svg>
    </Link>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function WorkspaceSettingsPage({
  params,
}: {
  params: PageParams;
}) {
  const { tenantSlug } = await params;

  const scope = await getTenantScopeBySlug(tenantSlug);
  if (!scope) notFound();

  // Settings hub is visible to all workspace members
  const canView = await userHasCapability("agency.workspace.view", scope.tenantId);
  if (!canView) notFound();

  const canManageTeam = await userHasCapability("manage_memberships", scope.tenantId);

  const teamMembers = await loadWorkspaceTeamMembers(scope.tenantId);

  return (
    <div className={ADMIN_PAGE_STACK}>
      <div className={ADMIN_HOME_SECTION_GAP}>
        {/* Header */}
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className={ADMIN_TEXT_EYEBROW}>{scope.membership.display_name}</p>
            <h1 className={ADMIN_TEXT_DISPLAY_LG}>Settings</h1>
          </div>
        </div>

        {/* Team section */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-[var(--admin-workspace-fg)]">
              Team
              <span className="ml-2 text-xs font-normal text-[var(--admin-nav-idle)]">
                {teamMembers.length}
              </span>
            </h2>
            {canManageTeam && (
              <Link
                href="/admin/settings"
                className="text-xs text-[var(--admin-accent)] hover:opacity-80 transition-opacity"
              >
                Manage
              </Link>
            )}
          </div>

          <div className="rounded-xl border border-[var(--admin-border)] bg-[var(--admin-card-bg)] divide-y divide-[var(--admin-border)]">
            {teamMembers.length === 0 ? (
              <div className="px-6 py-8 text-center">
                <p className="text-sm text-[var(--admin-nav-idle)]">No team members found.</p>
              </div>
            ) : (
              teamMembers.map((member) => (
                <div key={member.id} className="flex items-center gap-3 px-4 py-3">
                  {/* Avatar initial */}
                  <div
                    className="h-9 w-9 flex-none rounded-full bg-[var(--admin-nav-idle)]/20 flex items-center justify-center text-xs font-semibold text-[var(--admin-nav-idle)] uppercase select-none"
                    aria-hidden
                  >
                    {member.name.charAt(0)}
                  </div>

                  {/* Name */}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-[var(--admin-workspace-fg)]">
                      {member.name}
                    </p>
                  </div>

                  {/* Pending indicator */}
                  {member.status === "pending_acceptance" && <PendingChip />}

                  {/* Role chip */}
                  <RoleChip role={member.role} />
                </div>
              ))
            )}
          </div>
        </section>

        {/* Advanced settings links */}
        <section>
          <h2 className="text-sm font-semibold text-[var(--admin-workspace-fg)] mb-3">
            Workspace
          </h2>
          <div className="rounded-xl border border-[var(--admin-border)] bg-[var(--admin-card-bg)] divide-y divide-[var(--admin-border)]">
            <SettingsLink
              href="/admin/settings"
              label="Agency settings"
              description="Name, contact info, and workspace configuration"
            />
            <SettingsLink
              href="/admin/fields"
              label="Field catalog"
              description="Talent profile fields and visibility settings"
            />
            <SettingsLink
              href="/admin/taxonomy"
              label="Talent types"
              description="Manage categories, specialties, and skills"
            />
            <SettingsLink
              href="/admin/site-settings"
              label="Site & branding"
              description="Storefront design, CMS pages, and navigation"
            />
          </div>
        </section>
      </div>
    </div>
  );
}
