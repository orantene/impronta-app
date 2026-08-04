"use server";

/**
 * Invited-testimonial server actions (staff attest / import).
 *
 * Testimonials are WALLED OFF from verified booking reviews. A testimonial is a
 * quote agency staff vouch for or import (public.tenant_testimonials). Its
 * optional `rating` is DISPLAY-ONLY and is NEVER blended into a talent's star
 * average or any STANDING signal — that separation is enforced at the read +
 * render layers; this action just persists the attested quote.
 *
 * Policy (this wave):
 *   - Caller must be active agency staff of the target tenant.
 *   - Rows are inserted status='published' (public RLS then exposes them).
 *   - source defaults to 'manual'; 'requested' | 'imported' are also accepted.
 *
 * Per the "use server" rule this module exports ONLY async functions. Shared
 * types come from the plain ./review-types module. NEW tables/columns are
 * written/read with .returns<T>() (database.types.ts not regenerated this wave).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSession } from "@/lib/server/action-guards";
import { CLIENT_ERROR, logServerError } from "@/lib/server/safe-error";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import type { TestimonialSource } from "./review-types";

const VALID_SOURCES: readonly TestimonialSource[] = [
  "requested",
  "imported",
  "manual",
] as const;

function normalizeSource(raw: string | null | undefined): TestimonialSource {
  const v = (raw ?? "").trim() as TestimonialSource;
  return VALID_SOURCES.includes(v) ? v : "manual";
}

async function resolveTenantId(
  supabase: SupabaseClient,
  tenantSlug: string,
): Promise<string | null> {
  const slug = (tenantSlug ?? "").trim();
  if (!slug) return null;
  // agencies SELECT is staff-only under RLS; use the SECURITY DEFINER resolver
  // RPC (granted to authenticated) so a staff session can map slug → tenant id.
  const { data } = await supabase.rpc("resolve_public_tenant_by_slug", {
    p_slug: slug,
  });
  const rows = (data ?? []) as Array<{ tenant_id: string; tenant_slug: string }>;
  return rows[0]?.tenant_id ?? null;
}

/**
 * Create (attest / import) a testimonial for a talent, on behalf of a workspace.
 * The caller must be active staff of `tenantSlug`. Returns { ok:true, id } on
 * success; a safe { ok:false, error } otherwise.
 */
export async function createTestimonialAction(input: {
  tenantSlug: string;
  talentProfileId: string;
  authorName: string;
  authorRole?: string;
  body: string;
  rating?: number;
  source?: TestimonialSource;
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const auth = await requireSession();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, user } = auth;

  const cleanTalentId = (input.talentProfileId ?? "").trim();
  const cleanAuthor = (input.authorName ?? "").trim().slice(0, 200);
  const cleanRole = (input.authorRole ?? "").trim().slice(0, 200);
  const cleanBody = (input.body ?? "").trim().slice(0, 4000);

  if (!cleanTalentId) return { ok: false, error: "Missing talent." };
  if (!cleanAuthor) return { ok: false, error: "An author name is required." };
  if (!cleanBody) return { ok: false, error: "A testimonial body is required." };

  // Optional display-only rating. Coerced to 1..5 when present; anything else is
  // treated as absent (null) rather than rejected — it is never a STANDING input.
  let rating: number | null = null;
  if (input.rating != null) {
    const r = Math.round(Number(input.rating));
    if (Number.isFinite(r) && r >= 1 && r <= 5) rating = r;
  }

  const source = normalizeSource(input.source);

  const tenantId = await resolveTenantId(supabase, input.tenantSlug);
  if (!tenantId) return { ok: false, error: "Unknown workspace." };

  // Workspace-scoped authority: the caller must be an ACTIVE owner/admin
  // member of this tenant. This membership check IS the boundary — the guard
  // above only proves a session (the old requireStaff() global-app_role gate
  // added nothing here and wrongly rejected hybrid workspace owners).
  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "Service unavailable." };

  const { data: membership, error: memberErr } = await admin
    .from("agency_memberships")
    .select("role")
    .eq("tenant_id", tenantId)
    .eq("profile_id", user.id)
    .eq("status", "active")
    .maybeSingle();

  if (memberErr) {
    logServerError("testimonials/create/membership", memberErr);
    return { ok: false, error: CLIENT_ERROR.update };
  }
  const role = (membership as { role?: string } | null)?.role ?? null;
  if (!role || !["owner", "admin", "staff"].includes(role)) {
    return { ok: false, error: "Not authorized for this workspace." };
  }

  const { data: inserted, error: insertErr } = await admin
    .from("tenant_testimonials")
    .insert({
      tenant_id: tenantId,
      talent_profile_id: cleanTalentId,
      author_name: cleanAuthor,
      author_role: cleanRole || null,
      body: cleanBody,
      rating,
      source,
      status: "published",
      created_by_user_id: user.id,
    })
    .select("id")
    .maybeSingle()
    .returns<{ id: string }>();

  if (insertErr || !inserted) {
    logServerError("testimonials/create/insert", insertErr);
    return { ok: false, error: CLIENT_ERROR.update };
  }

  return { ok: true, id: (inserted as { id: string }).id };
}
