/**
 * GET /api/admin/media/library?tenantId=<uuid>            → one page of the library
 * GET /api/admin/media/library?tenantId=<uuid>&id=<uuid>  → single asset
 *
 * Returns approved media_assets for the tenant (newest first) so the shared
 * media library UI can render thumbnails without a server component
 * round-trip. Auth is requireSession + tenant-scope parity check — the
 * requested tenantId MUST match the caller's resolved tenant scope, so
 * no-one can enumerate another tenant's imagery.
 *
 * 2026-08-16 (library unification, seam 1) — the data now comes from
 * `queryTenantMediaLibrary`, the ONE read path shared with the workspace
 * Media page. The URL, the auth model and the `{ ok, items, folders }`
 * response shape are unchanged; what changed is that the hard 60-item cap
 * became a PAGE (`?cursor=` walks the rest) and the route accepts the
 * query layer's filters: `search`, `folderId`, `kind`, `ownership`, `limit`.
 * Filtering used to happen client-side inside the truncated 60, which is
 * why an album with real photos in it rendered as empty.
 *
 * QA 2026-05-13 — the `?id=` filter was added so surfaces that already
 * know the asset id they want (e.g. BrandTab's LogoField resolving a
 * stored `shell.brand-logo-media-asset-id` token to a publicUrl)
 * don't have to fetch a page of items + scan client-side. Single-asset
 * lookups are a server-side `.eq("id", id)` instead.
 */

import { NextResponse } from "next/server";

import {
  updateTenantMediaAssetAlt,
  updateTenantMediaAssetTags,
} from "@/lib/site-admin/media/assets";
import { queryTenantMediaLibrary } from "@/lib/media/library-query";
import {
  toMediaLibraryWireFolder,
  toMediaLibraryWireItem,
} from "@/lib/media/library-wire";
import {
  MEDIA_LIBRARY_MAX_PAGE_SIZE,
  MEDIA_LIBRARY_PAGE_SIZE,
  type MediaLibraryKindFilter,
  type MediaLibraryOwnershipFilter,
} from "@/lib/media/library-item";
import { requireSession } from "@/lib/server/action-guards";
import { requireTenantScope } from "@/lib/saas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const KIND_VALUES = new Set(["all", "image", "video", "document"]);
const OWNERSHIP_VALUES = new Set(["all", "workspace", "talent", "platform"]);

function readKind(value: string | null): MediaLibraryKindFilter {
  return value && KIND_VALUES.has(value)
    ? (value as MediaLibraryKindFilter)
    : "all";
}

function readOwnership(value: string | null): MediaLibraryOwnershipFilter {
  return value && OWNERSHIP_VALUES.has(value)
    ? (value as MediaLibraryOwnershipFilter)
    : "all";
}

function readLimit(value: string | null): number {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return MEDIA_LIBRARY_PAGE_SIZE;
  return Math.min(parsed, MEDIA_LIBRARY_MAX_PAGE_SIZE);
}

export async function GET(req: Request) {
  const auth = await requireSession();
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

  const url = new URL(req.url);
  const requestedTenant = url.searchParams.get("tenantId");
  if (!requestedTenant || requestedTenant !== scope.tenantId) {
    return NextResponse.json(
      { ok: false, error: "tenantId mismatch" },
      { status: 403 },
    );
  }

  const requestedId = url.searchParams.get("id");
  if (requestedId && !UUID_RE.test(requestedId)) {
    return NextResponse.json({ ok: false, error: "invalid id" }, { status: 400 });
  }

  const folderId = url.searchParams.get("folderId");
  if (folderId && !UUID_RE.test(folderId)) {
    return NextResponse.json(
      { ok: false, error: "invalid folderId" },
      { status: 400 },
    );
  }

  const result = await queryTenantMediaLibrary({
    supabase: auth.supabase,
    tenantId: scope.tenantId,
    scope: "tenant",
    // A by-id lookup is the same read with one more filter, so it returns the
    // same item shape a listing does. `items` is just always 0-or-1.
    assetIds: requestedId ? [requestedId] : null,
    search: url.searchParams.get("q"),
    folderId,
    kind: readKind(url.searchParams.get("kind")),
    ownership: readOwnership(url.searchParams.get("ownership")),
    cursor: url.searchParams.get("cursor"),
    limit: requestedId ? 1 : readLimit(url.searchParams.get("limit")),
    // Staff surface: private folders are theirs to browse (library-query.ts
    // documents the reading of `media_folders.is_private`).
    includePrivateFolders: true,
  });

  if (result.errored) {
    return NextResponse.json(
      { ok: false, error: "Could not load the media library." },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    items: result.items.map((photo) =>
      toMediaLibraryWireItem(photo, scope.tenantId),
    ),
    folders: result.folders.map(toMediaLibraryWireFolder),
    nextCursor: result.nextCursor,
    totalCount: result.totalCount,
    pendingCount: result.pendingCount,
  });
}

export async function PATCH(req: Request) {
  const auth = await requireSession();
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

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "Malformed JSON." }, { status: 400 });
  }

  const requestedTenant = typeof body.tenantId === "string" ? body.tenantId : null;
  if (!requestedTenant || requestedTenant !== scope.tenantId) {
    return NextResponse.json(
      { ok: false, error: "tenantId mismatch" },
      { status: 403 },
    );
  }

  const assetId = typeof body.id === "string" ? body.id : "";
  if (!UUID_RE.test(assetId)) {
    return NextResponse.json({ ok: false, error: "invalid id" }, { status: 400 });
  }

  // MEDIA-1 — the central alt + tag manager patches either field. `tags` (an
  // array) takes precedence when present so the picker can edit them in one PATCH
  // shape; otherwise we fall back to the alt-text update (back-compat).
  const item = Array.isArray(body.tags)
    ? await updateTenantMediaAssetTags({
        supabase: auth.supabase,
        tenantId: scope.tenantId,
        assetId,
        tags: body.tags.filter((tag): tag is string => typeof tag === "string"),
      })
    : await updateTenantMediaAssetAlt({
        supabase: auth.supabase,
        tenantId: scope.tenantId,
        assetId,
        alt: typeof body.alt === "string" ? body.alt : null,
      });
  if (!item) {
    return NextResponse.json(
      { ok: false, error: "Asset not found for this workspace." },
      { status: 404 },
    );
  }

  return NextResponse.json({ ok: true, item });
}
