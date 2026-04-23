/**
 * Dev-only one-shot cache-tag buster.
 *
 * Used after `scripts/apply-nova-theme.mjs` (which writes theme_json via
 * service-role REST) to kick the `unstable_cache` tagged `tenant:<id>:branding`
 * so the next storefront render picks up the new palette.
 *
 * Locked down to non-production environments — the normal design publish
 * path (publishDesignAction) already calls updateTag and is the production
 * flow. This route exists only because the node script can't call
 * `revalidateTag` (Next runtime only).
 */
import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";

import { tagFor } from "@/lib/site-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ ok: false, error: "dev only" }, { status: 404 });
  }
  const url = new URL(req.url);

  // Raw-tag escape hatch — used by seed scripts to bust non-tenant-scoped
  // tags (e.g. the global "directory" tag) that tagFor() doesn't construct.
  const rawTag = url.searchParams.get("rawTag");
  if (rawTag) {
    revalidateTag(rawTag, "max");
    return NextResponse.json({ ok: true, tag: rawTag });
  }

  const tenantId = url.searchParams.get("tenantId");
  const kindRaw = url.searchParams.get("kind") ?? "branding";
  if (!tenantId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tenantId)) {
    return NextResponse.json({ ok: false, error: "tenantId required" }, { status: 400 });
  }
  const kind = kindRaw as Parameters<typeof tagFor>[1];
  const tag = tagFor(tenantId, kind);
  revalidateTag(tag, "max");
  return NextResponse.json({ ok: true, tag });
}
