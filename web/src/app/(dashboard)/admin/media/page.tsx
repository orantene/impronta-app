import { Images, ShieldCheck, Users } from "lucide-react";
import { ADMIN_PAGE_STACK, ADMIN_SECTION_TITLE_CLASS } from "@/lib/dashboard-shell-classes";
import { AdminApprovedMediaLibrary } from "@/app/(dashboard)/admin/media/admin-approved-media-library";
import { AdminMediaTabNav } from "@/app/(dashboard)/admin/media/admin-media-tab-nav";
import { AdminPendingMediaQueue } from "@/app/(dashboard)/admin/media/admin-pending-media-queue";
import { DashboardPageHeader } from "@/components/dashboard/dashboard-page-header";
import { DashboardSectionCard } from "@/components/dashboard/dashboard-section-card";
import { HelpTip } from "@/components/ui/help-tip";
import {
  loadAdminApprovedMediaLibraryData,
  loadAdminPendingMediaData,
} from "@/lib/dashboard/admin-dashboard-data";

export default async function AdminMediaPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  const isLibrary = tab === "library";

  const [pendingRows, libraryRows] = await Promise.all([
    loadAdminPendingMediaData(),
    isLibrary ? loadAdminApprovedMediaLibraryData() : Promise.resolve([]),
  ]);

  const talentCount = new Set(pendingRows.map((row) => row.owner_talent_profile_id)).size;

  if (isLibrary) {
    return (
      <div className={ADMIN_PAGE_STACK}>
        <DashboardPageHeader
          eyebrow="Admin · Media"
          title="Media Library"
          description="Browse recently approved assets. Editing, ordering, and primary selection stay on each talent’s media workspace."
          right={
            <HelpTip content="This is a read-only agency-wide snapshot. Use Pending Approvals for the review queue, or open a profile’s media tab for full gallery control." />
          }
        />

        <AdminMediaTabNav mode="library" />

        <DashboardSectionCard
          title="Approved assets"
          description="Latest staff-approved uploads (newest first). Open a talent to manage their full gallery."
          titleClassName={ADMIN_SECTION_TITLE_CLASS}
        >
          <AdminApprovedMediaLibrary rows={libraryRows} />
        </DashboardSectionCard>
      </div>
    );
  }

  return (
    <div className={ADMIN_PAGE_STACK}>
      <DashboardPageHeader
        eyebrow="Admin · Media"
        title="Pending Approvals"
        description="Review pending uploads before they become part of the approved talent portfolio."
        right={
          <HelpTip content="Only staff-approved media appears on public talent profiles. Approve to publish into the portfolio, reject to send back for replacement, or open the full talent media workspace for context." />
        }
      />

      <AdminMediaTabNav mode="pending" />

      <section
        className="overflow-hidden rounded-3xl border border-border/50 bg-gradient-to-br from-[var(--impronta-gold)]/[0.07] via-card to-card shadow-sm"
        aria-label="Moderation summary"
      >
        <div className="flex flex-col gap-6 p-6 sm:flex-row sm:items-center sm:justify-between sm:gap-8 lg:p-8">
          <div className="flex min-w-0 gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[var(--impronta-gold)]/15 text-[var(--impronta-gold)] ring-1 ring-[var(--impronta-gold)]/20 sm:h-14 sm:w-14 sm:rounded-3xl">
              <ShieldCheck className="size-6 sm:size-7" aria-hidden />
            </div>
            <div className="min-w-0 space-y-1">
              <p className="font-display text-base font-medium tracking-wide text-foreground sm:text-lg">
                Publication gate
              </p>
              <p className="max-w-xl text-sm leading-relaxed text-muted-foreground">
                Treat this queue as triage: clear pending items daily so talent see timely feedback and the
                directory stays trustworthy.
              </p>
            </div>
          </div>
          <div className="grid w-full grid-cols-2 gap-3 sm:max-w-md sm:grid-cols-2">
            <div className="rounded-2xl border border-border/60 bg-background/60 px-4 py-3 backdrop-blur-sm">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Pending
              </p>
              <p className="mt-1 font-display text-3xl font-medium tabular-nums tracking-tight text-[var(--impronta-gold)]">
                {pendingRows.length}
              </p>
            </div>
            <div className="rounded-2xl border border-border/60 bg-background/60 px-4 py-3 backdrop-blur-sm">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Profiles
              </p>
              <p className="mt-1 font-display text-3xl font-medium tabular-nums tracking-tight text-foreground">
                {talentCount}
              </p>
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-3">
        <DashboardSectionCard
          title="Pending assets"
          description="Awaiting moderation"
          titleClassName={ADMIN_SECTION_TITLE_CLASS}
        >
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--impronta-gold)]/12 text-[var(--impronta-gold)] ring-1 ring-[var(--impronta-gold)]/20">
              <Images className="size-5" aria-hidden />
            </div>
            <p className="font-display text-3xl font-medium tabular-nums tracking-tight text-[var(--impronta-gold)]">
              {pendingRows.length}
            </p>
          </div>
        </DashboardSectionCard>
        <DashboardSectionCard
          title="Talent affected"
          description="Profiles with pending uploads"
          titleClassName={ADMIN_SECTION_TITLE_CLASS}
        >
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted/40 text-muted-foreground ring-1 ring-border/60">
              <Users className="size-5" aria-hidden />
            </div>
            <p className="font-display text-3xl font-medium tabular-nums tracking-tight text-foreground">
              {talentCount}
            </p>
          </div>
        </DashboardSectionCard>
        <DashboardSectionCard
          title="Moderation flow"
          description="Staff-owned publication gate"
          titleClassName={ADMIN_SECTION_TITLE_CLASS}
        >
          <p className="text-sm leading-relaxed text-muted-foreground">
            Review the preview, approve or reject from each card, then open the full talent media workspace when
            you need crops, ordering, or more context.
          </p>
        </DashboardSectionCard>
      </div>

      <DashboardSectionCard
        title="Pending uploads"
        description="Approve or reject from the queue, then open the full talent media workspace when needed."
        titleClassName={ADMIN_SECTION_TITLE_CLASS}
      >
        <AdminPendingMediaQueue initialRows={pendingRows} />
      </DashboardSectionCard>
    </div>
  );
}
