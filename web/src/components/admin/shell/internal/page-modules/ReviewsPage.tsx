"use client";

// WP1 (dashboard-rails, 2026-09-02) — Reviews page-module.
// Promotes the real review-moderation surface (reported reviews + rating
// integrity, with real hide/unhide actions) out of the deleted Operations
// page into a first-class "Sell and grow" rail destination, and links to the
// review-photo moderation grid (a canonical route rendered in-shell).
//
// The moderation queue is an existing component that carries its own
// (drawer-era) inline styling, so we WRAP it rather than copy its markup —
// keeping this file clean under ratchet/no-new-inline-style.

import { useT } from "@/i18n/use-t";
import { useAdminShell } from "../state";
import { PageHeader } from "./pages-shared";
import { ReviewModerationQueue } from "../drawers/profile-shell/profile-shell-modules/review-moderation-queue";

export function ReviewsPage() {
  const t = useT();
  const { bridgeTenantIdentity, adminBasePath } = useAdminShell();
  const tenantId = bridgeTenantIdentity?.tenantId ?? "";

  return (
    <>
      <PageHeader
        eyebrow={t("dashboard.adminReviews.eyebrow")}
        title={t("dashboard.adminReviews.title")}
        subtitle={t("dashboard.adminReviews.subtitle")}
        actions={
          <a
            href={`${adminBasePath}/reviews/media`}
            className="inline-flex items-center gap-[6px] rounded-[8px] border border-admin-border-soft bg-admin-card px-[12px] py-[7px] text-admin-11h font-semibold text-admin-ink no-underline hover:border-admin-border-strong"
          >
            {t("dashboard.adminReviews.reviewPhotos")}
          </a>
        }
      />
      {tenantId ? (
        <ReviewModerationQueue tenantId={tenantId} />
      ) : (
        <div className="rounded-[12px] border border-admin-border-soft bg-admin-card p-[24px] text-admin-13 text-admin-ink-muted">
          {t("dashboard.adminReviews.noTenant")}
        </div>
      )}
    </>
  );
}
