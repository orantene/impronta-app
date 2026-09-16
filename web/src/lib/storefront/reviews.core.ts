/**
 * reviews — the engine seam (read only). `tenant_testimonials` with
 * `status = 'published'`, the same table `loadPublishedTestimonials` reads
 * per talent, here for the whole workspace. Never a hidden or pending row.
 */

import type { StorefrontAdmin } from "./admin";
import type { ReviewCard, ReviewsData, ReviewsProps } from "./reviews.types";

export type ReviewsDeps = { admin: StorefrontAdmin };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function readReviewsCore(
  deps: ReviewsDeps,
  tenantId: string,
  props: ReviewsProps,
): Promise<{ ok: true; data: ReviewsData } | { ok: false; reason: string }> {
  if (!UUID.test(tenantId)) return { ok: false, reason: "invalid_request" };
  const count = Math.min(50, Math.max(1, Math.trunc(props.count ?? 6) || 6));
  try {
    const { data, error } = await deps.admin
      .from("tenant_testimonials")
      .select("id, author_name, author_role, body, rating, status, created_at")
      .eq("tenant_id", tenantId)
      .eq("status", "published")
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) return { ok: false, reason: "unavailable" };
    const rows = (data ?? []) as Array<{ id: string; author_name: string | null; author_role: string | null; body: string | null; rating: number | null; created_at: string }>;
    const all: ReviewCard[] = rows
      .filter((r) => (r.body ?? "").trim().length > 0)
      .map((r) => ({
        id: r.id,
        authorName: (r.author_name ?? "").trim(),
        authorRole: r.author_role?.trim() || null,
        body: (r.body ?? "").trim(),
        rating: typeof r.rating === "number" && r.rating >= 1 && r.rating <= 5 ? r.rating : null,
        createdAtIso: new Date(r.created_at).toISOString(),
      }));
    const rated = all.filter((r) => r.rating != null);
    const average = rated.length ? Math.round((rated.reduce((s, r) => s + (r.rating as number), 0) / rated.length) * 10) / 10 : null;
    return { ok: true, data: { reviews: all.slice(0, count), summary: { count: all.length, average }, layout: props.layout ?? "carousel" } };
  } catch {
    return { ok: false, reason: "unavailable" };
  }
}
