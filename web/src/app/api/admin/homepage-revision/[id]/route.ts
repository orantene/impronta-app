/**
 * GET /api/admin/homepage-revision/:id
 *
 * Returns the snapshot JSONB of a single cms_page_revisions row + a
 * trimmed `summary` computed server-side for the admin preview modal.
 * Auth: requireStaff + tenant-scope parity check against the revision's
 * tenant_id. No cross-tenant exposure.
 *
 * The modal uses this to render a non-destructive "what's in this
 * revision?" view before the admin clicks Restore as draft.
 */

import { NextResponse } from "next/server";

import { requireStaff } from "@/lib/server/action-guards";
import { requireTenantScope } from "@/lib/saas";
import { createServiceRoleClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface SnapshotSection {
  slotKey?: string;
  sectionTypeKey?: string;
  name?: string;
  sortOrder?: number;
}

interface SnapshotFields {
  title?: string;
  metaDescription?: string | null;
  introTagline?: string | null;
}

interface RevisionSnapshotShape {
  composition?: SnapshotSection[];
  fields?: SnapshotFields;
  [key: string]: unknown;
}

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const auth = await requireStaff();
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: 401 });
  }
  const scope = await requireTenantScope().catch(() => null);
  if (!scope) {
    return NextResponse.json(
      { ok: false, error: "Select an agency workspace first." },
      { status: 400 },
    );
  }

  const { id } = await ctx.params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return NextResponse.json(
      { ok: false, error: "Invalid revision id." },
      { status: 400 },
    );
  }

  const admin = createServiceRoleClient();
  if (!admin) {
    return NextResponse.json(
      { ok: false, error: "Server is missing service-role credentials." },
      { status: 500 },
    );
  }

  const { data, error } = await admin
    .from("cms_page_revisions")
    .select(
      "id, tenant_id, page_id, kind, version, snapshot, created_at, created_by",
    )
    .eq("id", id)
    .maybeSingle();
  if (error || !data) {
    return NextResponse.json(
      { ok: false, error: "Revision not found." },
      { status: 404 },
    );
  }
  if ((data as { tenant_id: string }).tenant_id !== scope.tenantId) {
    return NextResponse.json(
      { ok: false, error: "tenantId mismatch" },
      { status: 403 },
    );
  }

  const snapshot = ((data as { snapshot: unknown }).snapshot ?? {}) as
    | RevisionSnapshotShape
    | Record<string, unknown>;

  const composition = Array.isArray(
    (snapshot as RevisionSnapshotShape).composition,
  )
    ? ((snapshot as RevisionSnapshotShape).composition as SnapshotSection[])
    : [];

  const slotSummary = new Map<
    string,
    Array<{ name: string; sectionTypeKey: string; sortOrder: number }>
  >();
  for (const s of composition) {
    const slotKey = typeof s.slotKey === "string" ? s.slotKey : "(unknown)";
    const arr = slotSummary.get(slotKey) ?? [];
    arr.push({
      name: typeof s.name === "string" ? s.name : "(unnamed section)",
      sectionTypeKey:
        typeof s.sectionTypeKey === "string" ? s.sectionTypeKey : "unknown",
      sortOrder: typeof s.sortOrder === "number" ? s.sortOrder : 0,
    });
    slotSummary.set(slotKey, arr);
  }
  const slots = [...slotSummary.entries()]
    .map(([slotKey, items]) => ({
      slotKey,
      items: items.slice().sort((a, b) => a.sortOrder - b.sortOrder),
    }))
    .sort((a, b) => a.slotKey.localeCompare(b.slotKey));

  const fields = ((snapshot as RevisionSnapshotShape).fields ?? {}) as SnapshotFields;

  return NextResponse.json({
    ok: true,
    revision: {
      id: (data as { id: string }).id,
      kind: (data as { kind: string }).kind,
      version: (data as { version: number }).version,
      createdAt: (data as { created_at: string }).created_at,
      pageId: (data as { page_id: string }).page_id,
    },
    summary: {
      slots,
      totalSections: composition.length,
      title: fields.title ?? null,
      metaDescription: fields.metaDescription ?? null,
      introTagline: fields.introTagline ?? null,
    },
  });
}
