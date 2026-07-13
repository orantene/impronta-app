// Staff-facing per-photo moderation for client→talent review images
// (STANDING v3 item 5). Photos default to approval_state='approved' (auto-live
// — see load-reviews.ts), so this surface exists to let staff REJECT (hide) an
// individual bad photo and RESTORE it later, WITHOUT hiding the whole review.
//
// Mirrors the standalone admin-page pattern (admin/policy/auto-ack): resolve the
// tenant scope by slug, notFound() on any auth failure, load the rows via the
// staff-gated service-role loader, and hand them to a "use client" grid that
// calls setReviewMediaApprovalState with explicit pending/done/error state.
//
// Reachable at /{tenantSlug}/admin/reviews/media. Not yet in the admin nav —
// URL-addressable for now (renders inside the workspace shell via the canonical
// route host). Promote to nav when the reviews-moderation surface is wired.

import { notFound } from "next/navigation";
import { getTenantScopeBySlug } from "@/lib/saas/scope";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { loadReviewMediaForTenant } from "@/lib/reviews/review-moderation-loaders";
import { ReviewMediaModerationGrid } from "./moderation-grid";

export const dynamic = "force-dynamic";

type PageParams = Promise<{ tenantSlug: string }>;

const FONT = '"Inter", system-ui, sans-serif';

export default async function AdminReviewMediaPage({ params }: { params: PageParams }) {
  const { tenantSlug } = await params;

  const session = await getCachedActorSession();
  if (!session.user) notFound();

  // getTenantScopeBySlug returns non-null ONLY for an agency_memberships row on
  // this tenant, so a resolved scope already proves the caller is tenant staff.
  const scope = await getTenantScopeBySlug(tenantSlug);
  if (!scope) notFound();

  const items = await loadReviewMediaForTenant(scope.tenantId);

  return (
    <div style={{ fontFamily: FONT, padding: "24px 28px", maxWidth: 1080 }}>
      <div style={{ marginBottom: 20 }}>
        <div
          style={{
            fontSize: 10.5,
            fontWeight: 700,
            letterSpacing: 0.5,
            textTransform: "uppercase",
            color: "rgba(11,11,13,0.55)",
            marginBottom: 6,
          }}
        >
          Admin · Reviews
        </div>
        <h1
          style={{
            fontSize: 26,
            fontWeight: 700,
            color: "#0B0B0D",
            margin: 0,
            marginBottom: 6,
            letterSpacing: -0.4,
          }}
        >
          Review photos
        </h1>
        <p
          style={{
            fontSize: 13,
            color: "rgba(11,11,13,0.55)",
            margin: 0,
            lineHeight: 1.55,
            maxWidth: 620,
          }}
        >
          Photos clients attach to their reviews go live automatically. Hide an
          individual photo that shouldn&apos;t be public. The review itself
          stays up, and you can restore the photo any time.
        </p>
      </div>

      <ReviewMediaModerationGrid items={items} />
    </div>
  );
}
