// Phase 3 — canonical workspace Work (inquiries queue) page.
// Server Component — no "use client".
//
// Renders the open inquiry queue for the tenant identified by `tenantSlug`.
// Data via `loadWorkspaceInquiries()` — explicit tenantId, no mock data.
// Capability gate: create_inquiry (coordinator+).

import { notFound } from "next/navigation";
import Link from "next/link";
import { getTenantScopeBySlug } from "@/lib/saas/scope";
import { userHasCapability } from "@/lib/access";
import { loadWorkspaceInquiries } from "../../_data-bridge";
import {
  ADMIN_PAGE_STACK,
  ADMIN_TEXT_DISPLAY_LG,
  ADMIN_TEXT_EYEBROW,
  ADMIN_HOME_SECTION_GAP,
} from "@/lib/dashboard-shell-classes";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

type PageParams = Promise<{ tenantSlug: string }>;

// ─── Status display metadata ─────────────────────────────────────────────────

const INQUIRY_STATUS_META: Record<string, { label: string; className: string }> = {
  new: {
    label: "New",
    className: "bg-sky-500/15 text-sky-700 dark:text-sky-400",
  },
  submitted: {
    label: "Submitted",
    className: "bg-sky-500/15 text-sky-700 dark:text-sky-400",
  },
  draft: {
    label: "Draft",
    className: "bg-neutral-500/10 text-neutral-600 dark:text-neutral-400",
  },
  coordination: {
    label: "In progress",
    className: "bg-amber-500/15 text-amber-700 dark:text-amber-500",
  },
  reviewing: {
    label: "In progress",
    className: "bg-amber-500/15 text-amber-700 dark:text-amber-500",
  },
  in_progress: {
    label: "In progress",
    className: "bg-amber-500/15 text-amber-700 dark:text-amber-500",
  },
  waiting_for_client: {
    label: "Waiting on client",
    className: "bg-amber-500/15 text-amber-700 dark:text-amber-500",
  },
  talent_suggested: {
    label: "Talent suggested",
    className: "bg-amber-500/15 text-amber-700 dark:text-amber-500",
  },
  qualified: {
    label: "Qualified",
    className: "bg-amber-500/15 text-amber-700 dark:text-amber-500",
  },
  offer_pending: {
    label: "Offer sent",
    className: "bg-violet-500/15 text-violet-700 dark:text-violet-400",
  },
  offer_sent: {
    label: "Offer sent",
    className: "bg-violet-500/15 text-violet-700 dark:text-violet-400",
  },
  offer_countered: {
    label: "Counter received",
    className: "bg-violet-500/15 text-violet-700 dark:text-violet-400",
  },
  approved: {
    label: "Approved",
    className: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  },
};

function InquiryStatusChip({ status }: { status: string }) {
  const meta = INQUIRY_STATUS_META[status] ?? {
    label: status,
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

// ─── Next-action-by indicator ─────────────────────────────────────────────────

const NEXT_ACTION_META: Record<
  string,
  { label: string; dotClass: string }
> = {
  admin: { label: "Agency", dotClass: "bg-[var(--admin-accent)]" },
  coordinator: { label: "Coordinator", dotClass: "bg-[var(--admin-accent)]" },
  client: { label: "Client", dotClass: "bg-amber-400" },
  talent: { label: "Talent", dotClass: "bg-sky-400" },
  system: { label: "System", dotClass: "bg-neutral-400" },
};

function NextActionDot({ nextActionBy }: { nextActionBy: string | null }) {
  if (!nextActionBy) return null;
  const meta = NEXT_ACTION_META[nextActionBy];
  if (!meta) return null;
  return (
    <span
      title={`Waiting on: ${meta.label}`}
      className={cn("inline-block size-2 rounded-full flex-none", meta.dotClass)}
      aria-label={`Waiting on ${meta.label}`}
    />
  );
}

// ─── Date formatting ──────────────────────────────────────────────────────────

function formatShortDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function WorkspaceWorkPage({
  params,
}: {
  params: PageParams;
}) {
  const { tenantSlug } = await params;

  const scope = await getTenantScopeBySlug(tenantSlug);
  if (!scope) notFound();

  // Work queue is coordinator+ (create_inquiry lives in COORDINATOR_CAPS)
  const canView = await userHasCapability("create_inquiry", scope.tenantId);
  if (!canView) notFound();

  const canCreate = await userHasCapability("create_inquiry", scope.tenantId);

  const inquiries = await loadWorkspaceInquiries(scope.tenantId);

  return (
    <div className={ADMIN_PAGE_STACK}>
      <div className={ADMIN_HOME_SECTION_GAP}>
        {/* Header */}
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className={ADMIN_TEXT_EYEBROW}>{scope.membership.display_name}</p>
            <h1 className={ADMIN_TEXT_DISPLAY_LG}>
              Work
              <span className="ml-2 text-[var(--admin-nav-idle)] text-base font-normal">
                {inquiries.length}
              </span>
            </h1>
          </div>
          {canCreate && (
            <Link
              href={`/admin/inquiries`}
              className="rounded-lg bg-[var(--admin-accent)] px-3.5 py-1.5 text-sm font-medium text-white hover:opacity-90 transition-opacity"
            >
              All requests
            </Link>
          )}
        </div>

        {/* Queue */}
        {inquiries.length === 0 ? (
          <div className="rounded-xl border border-[var(--admin-border)] bg-[var(--admin-card-bg)] px-6 py-12 text-center">
            <p className="text-sm text-[var(--admin-nav-idle)]">
              No open requests right now.
            </p>
          </div>
        ) : (
          <div className="rounded-xl border border-[var(--admin-border)] bg-[var(--admin-card-bg)] divide-y divide-[var(--admin-border)]">
            {inquiries.map((inquiry) => {
              const clientDisplay = [inquiry.contact_name, inquiry.company]
                .filter(Boolean)
                .join(" · ");
              const eventDisplay = [
                formatShortDate(inquiry.event_date),
                inquiry.event_location,
              ]
                .filter(Boolean)
                .join(" · ");

              return (
                <Link
                  key={inquiry.id}
                  href={`/admin/inquiries/${inquiry.id}`}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-[var(--admin-nav-idle)]/5 transition-colors group"
                >
                  {/* Next-action dot */}
                  <div className="flex-none flex items-center justify-center w-4">
                    <NextActionDot nextActionBy={inquiry.next_action_by} />
                  </div>

                  {/* Client + event meta */}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-[var(--admin-workspace-fg)] group-hover:text-[var(--admin-accent)] transition-colors">
                      {clientDisplay || "Unnamed contact"}
                    </p>
                    {eventDisplay && (
                      <p className="truncate text-xs text-[var(--admin-nav-idle)]">
                        {eventDisplay}
                        {inquiry.quantity != null && inquiry.quantity > 0 && (
                          <> · {inquiry.quantity} talent</>
                        )}
                      </p>
                    )}
                  </div>

                  {/* Status chip */}
                  <InquiryStatusChip status={inquiry.status} />
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
