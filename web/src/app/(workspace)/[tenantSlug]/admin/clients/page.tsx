// Phase 3 — canonical workspace Clients page.
// Server Component — no "use client".
//
// Renders the client list for the tenant identified by `tenantSlug`.
// Data via `loadWorkspaceClients()` — explicit tenantId, no mock data.
// Capability gate: view_client_list (viewer+).

import { notFound } from "next/navigation";
import Link from "next/link";
import { getTenantScopeBySlug } from "@/lib/saas/scope";
import { userHasCapability } from "@/lib/access";
import { loadWorkspaceClients } from "../../_data-bridge";
import {
  ADMIN_PAGE_STACK,
  ADMIN_TEXT_DISPLAY_LG,
  ADMIN_TEXT_EYEBROW,
  ADMIN_HOME_SECTION_GAP,
} from "@/lib/dashboard-shell-classes";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

type PageParams = Promise<{ tenantSlug: string }>;

// ─── Account status chip ─────────────────────────────────────────────────────

const ACCOUNT_STATUS_META: Record<string, { label: string; className: string }> = {
  registered: {
    label: "Registered",
    className: "bg-neutral-500/10 text-neutral-600 dark:text-neutral-400",
  },
  active: {
    label: "Active",
    className: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  },
  onboarding: {
    label: "Onboarding",
    className: "bg-sky-500/15 text-sky-700 dark:text-sky-400",
  },
  suspended: {
    label: "Suspended",
    className: "bg-red-500/15 text-red-700 dark:text-red-400",
  },
};

function AccountStatusChip({ status }: { status: string | null }) {
  const key = status ?? "registered";
  const meta = ACCOUNT_STATUS_META[key] ?? {
    label: key,
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

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function WorkspaceClientsPage({
  params,
}: {
  params: PageParams;
}) {
  const { tenantSlug } = await params;

  const scope = await getTenantScopeBySlug(tenantSlug);
  if (!scope) notFound();

  const canView = await userHasCapability("view_client_list", scope.tenantId);
  if (!canView) notFound();

  const clients = await loadWorkspaceClients(scope.tenantId);

  return (
    <div className={ADMIN_PAGE_STACK}>
      <div className={ADMIN_HOME_SECTION_GAP}>
        {/* Header */}
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className={ADMIN_TEXT_EYEBROW}>{scope.membership.display_name}</p>
            <h1 className={ADMIN_TEXT_DISPLAY_LG}>
              Clients
              <span className="ml-2 text-[var(--admin-nav-idle)] text-base font-normal">
                {clients.length}
              </span>
            </h1>
          </div>
          <Link
            href="/admin/clients"
            className="rounded-lg border border-[var(--admin-border)] bg-[var(--admin-card-bg)] px-3.5 py-1.5 text-sm font-medium text-[var(--admin-workspace-fg)] hover:bg-[var(--admin-nav-idle)]/10 transition-colors"
          >
            Full view
          </Link>
        </div>

        {/* Client list */}
        {clients.length === 0 ? (
          <div className="rounded-xl border border-[var(--admin-border)] bg-[var(--admin-card-bg)] px-6 py-12 text-center">
            <p className="text-sm text-[var(--admin-nav-idle)]">
              No clients on record yet.
            </p>
          </div>
        ) : (
          <div className="rounded-xl border border-[var(--admin-border)] bg-[var(--admin-card-bg)] divide-y divide-[var(--admin-border)]">
            {clients.map((client) => (
              <Link
                key={client.id}
                href={`/admin/clients`}
                className="flex items-center gap-3 px-4 py-3 hover:bg-[var(--admin-nav-idle)]/5 transition-colors group"
              >
                {/* Avatar initial */}
                <div
                  className="h-9 w-9 flex-none rounded-full bg-[var(--admin-nav-idle)]/20 flex items-center justify-center text-xs font-semibold text-[var(--admin-nav-idle)] uppercase select-none"
                  aria-hidden
                >
                  {client.name.charAt(0)}
                </div>

                {/* Name + company */}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-[var(--admin-workspace-fg)] group-hover:text-[var(--admin-accent)] transition-colors">
                    {client.name}
                  </p>
                  {client.company && (
                    <p className="truncate text-xs text-[var(--admin-nav-idle)]">
                      {client.company}
                    </p>
                  )}
                </div>

                {/* Inquiry count */}
                {client.inquiryCount > 0 && (
                  <span className="text-xs text-[var(--admin-nav-idle)] tabular-nums">
                    {client.inquiryCount} {client.inquiryCount === 1 ? "request" : "requests"}
                  </span>
                )}

                {/* Status chip */}
                <AccountStatusChip status={client.accountStatus} />
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
