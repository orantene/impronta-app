import { NextResponse } from "next/server";
import { z } from "zod";
import { requireStaffApi } from "@/lib/server/staff-api-route";
import { getTenantScope } from "@/lib/saas/scope";
import { CLIENT_ERROR, logServerError } from "@/lib/server/safe-error";

const querySchema = z.object({
  kind: z.enum(["page", "post"]),
  id: z.string().uuid(),
});

/**
 * Staff-only CMS snapshot for SEO / revision hints in the inspector.
 */
export async function GET(request: Request) {
  const auth = await requireStaffApi();
  if ("error" in auth) return auth.error;

  const raw = Object.fromEntries(new URL(request.url).searchParams);
  const parsed = querySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid query" }, { status: 400 });
  }

  const { kind, id } = parsed.data;
  const { supabase } = auth;

  const scope = await getTenantScope();
  if (!scope) {
    return NextResponse.json({ error: "No active tenant" }, { status: 403 });
  }
  const tenantId = scope.tenantId;

  if (kind === "page") {
    const { data, error } = await supabase
      .from("cms_pages")
      .select(
        "id, slug, locale, status, title, meta_title, meta_description, noindex, include_in_sitemap, canonical_url",
      )
      .eq("id", id)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (error) {
      logServerError("api/admin/inspector/cms/page", error);
      return NextResponse.json({ error: CLIENT_ERROR.generic }, { status: 500 });
    }
    if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const { count, error: cErr } = await supabase
      .from("cms_page_revisions")
      .select("id", { count: "exact", head: true })
      .eq("page_id", id)
      .eq("tenant_id", tenantId);
    if (cErr) logServerError("api/admin/inspector/cms/page-rev-count", cErr);

    return NextResponse.json({
      kind: "page" as const,
      ...data,
      revision_count: count ?? 0,
    });
  }

  const { data, error } = await supabase
    .from("cms_posts")
    .select("id, slug, locale, status, title, meta_title, meta_description, noindex")
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error) {
    logServerError("api/admin/inspector/cms/post", error);
    return NextResponse.json({ error: CLIENT_ERROR.generic }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { count, error: cErr } = await supabase
    .from("cms_post_revisions")
    .select("id", { count: "exact", head: true })
    .eq("post_id", id)
    .eq("tenant_id", tenantId);
  if (cErr) logServerError("api/admin/inspector/cms/post-rev-count", cErr);

  return NextResponse.json({
    kind: "post" as const,
    ...data,
    revision_count: count ?? 0,
  });
}
