import "server-only";

/**
 * page-image-swap.server.ts — replace one image URL with another across a
 * tenant's pages (draft `blocks` and, when present, the published
 * snapshot's `builderTree`). Used by the per-site image job's swap and by the
 * per-tenant retirement swap (03 §5). Exact-match on `props.src`; nothing
 * else in the tree is touched; the page's updated_at moves so caches drop.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { logServerError } from "@/lib/server/safe-error";

type Node = { props?: Record<string, unknown>; children?: unknown[] } & Record<string, unknown>;

/** Pure: returns a new tree and how many nodes changed. */
export function swapImageSrcInTree(
  tree: unknown,
  fromSrc: string,
  toSrc: string,
  toAlt?: { es?: string; en?: string } | null,
  /** Stop after this many nodes (a slot is ONE node; a seed image reused in two slots must not swap both). */
  maxNodes = Number.POSITIVE_INFINITY,
): { tree: unknown; changed: number } {
  let changed = 0;
  const walk = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(walk);
    if (!value || typeof value !== "object") return value;
    const node = value as Node;
    let next: Node = node;
    if (changed < maxNodes && node.props && typeof node.props === "object" && node.props.src === fromSrc) {
      changed += 1;
      const props: Record<string, unknown> = { ...node.props, src: toSrc };
      if (toAlt?.es || toAlt?.en) {
        if (typeof props.alt === "string") props.alt = toAlt.es ?? toAlt.en ?? props.alt;
        const i18n = props.i18n && typeof props.i18n === "object" ? { ...(props.i18n as Record<string, Record<string, string>>) } : null;
        if (i18n) {
          for (const loc of Object.keys(i18n)) {
            const alt = loc === "en" ? toAlt.en : toAlt.es;
            if (alt && i18n[loc] && typeof i18n[loc] === "object" && "alt" in i18n[loc]) i18n[loc] = { ...i18n[loc], alt };
          }
          props.i18n = i18n;
        }
      }
      next = { ...node, props };
    }
    if (Array.isArray(next.children)) {
      const children = next.children.map(walk);
      next = next === node ? { ...node, children } : { ...next, children };
    }
    return next;
  };
  return { tree: walk(tree), changed };
}

export async function swapImageSrcInTenantPages(
  admin: SupabaseClient,
  input: {
    tenantId: string;
    fromSrc: string;
    toSrc: string;
    toAlt?: { es?: string; en?: string } | null;
    /** Restrict to one page (the slot's page from the compose stamp); default every page. */
    pageId?: string | null;
    /** Nodes to change at most across the pages touched; default all. */
    maxNodes?: number;
  },
): Promise<{ pagesChanged: number; nodesChanged: number }> {
  const out = { pagesChanged: 0, nodesChanged: 0 };
  // Not filtered on `is_freeform`: the composed home row keeps `system_template_key = homepage`.
  // Three stores carry a tree: freeform `blocks` (+ `published_page_snapshot`), the homepage's
  // `published_homepage_snapshot`, and the homepage DRAFT, which is the latest revision at the
  // page's version (page-reads.ts). All three are patched so draft and live agree.
  let q = admin.from("cms_pages").select("id, version, blocks, published_page_snapshot, published_homepage_snapshot").eq("tenant_id", input.tenantId).neq("status", "archived").limit(200);
  if (input.pageId) q = q.eq("id", input.pageId);
  const { data, error } = await q;
  if (error) {
    logServerError("page-image-swap.read", error);
    return out;
  }
  const budget = input.maxNodes ?? Number.POSITIVE_INFINITY;
  type Row = { id: string; version: number | null; blocks: unknown; published_page_snapshot: { builderTree?: unknown } | null; published_homepage_snapshot: { builderTree?: unknown } | null };
  for (const row of (data ?? []) as Row[]) {
    if (out.nodesChanged >= budget) break;
    const left = budget - out.nodesChanged;
    const draft = swapImageSrcInTree(row.blocks, input.fromSrc, input.toSrc, input.toAlt, left);
    // Mirrors of the draft swap the same node count so a slot stays one node everywhere.
    const mirror = (tree: unknown) => swapImageSrcInTree(tree, input.fromSrc, input.toSrc, input.toAlt, draft.changed || left);
    const snap = row.published_page_snapshot?.builderTree !== undefined ? mirror(row.published_page_snapshot.builderTree) : null;
    const homeLive = row.published_homepage_snapshot?.builderTree !== undefined ? mirror(row.published_homepage_snapshot.builderTree) : null;
    const homeDraft = await swapHomepageDraftRevision(admin, input.tenantId, row, input.fromSrc, input.toSrc, input.toAlt, draft.changed || left);
    const changed = Math.max(draft.changed, snap?.changed ?? 0, homeLive?.changed ?? 0, homeDraft);
    if (changed === 0) continue;
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (draft.changed > 0) patch.blocks = draft.tree;
    if (snap && snap.changed > 0) patch.published_page_snapshot = { ...row.published_page_snapshot, builderTree: snap.tree };
    if (homeLive && homeLive.changed > 0) patch.published_homepage_snapshot = { ...row.published_homepage_snapshot, builderTree: homeLive.tree };
    if (Object.keys(patch).length > 1) {
      const { error: upError } = await admin.from("cms_pages").update(patch).eq("id", row.id).eq("tenant_id", input.tenantId);
      if (upError) {
        logServerError("page-image-swap.write", upError);
        continue;
      }
    }
    out.pagesChanged += 1;
    out.nodesChanged += changed;
  }
  return out;
}

/** The homepage draft lives in the latest `cms_page_revisions` row at the page's version; patch it in place. */
async function swapHomepageDraftRevision(
  admin: SupabaseClient,
  tenantId: string,
  row: { id: string; version: number | null; published_homepage_snapshot: unknown },
  fromSrc: string,
  toSrc: string,
  toAlt: { es?: string; en?: string } | null | undefined,
  maxNodes: number,
): Promise<number> {
  if (row.published_homepage_snapshot === undefined || row.version === null) return 0;
  const { data, error } = await admin
    .from("cms_page_revisions")
    .select("id, snapshot")
    .eq("tenant_id", tenantId)
    .eq("page_id", row.id)
    .eq("version", row.version)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ id: string; snapshot: { builderTree?: unknown } | null }>();
  if (error || !data?.snapshot || data.snapshot.builderTree === undefined) return 0;
  const swapped = swapImageSrcInTree(data.snapshot.builderTree, fromSrc, toSrc, toAlt, maxNodes);
  if (swapped.changed === 0) return 0;
  const { error: upError } = await admin.from("cms_page_revisions").update({ snapshot: { ...data.snapshot, builderTree: swapped.tree } }).eq("id", data.id).eq("tenant_id", tenantId);
  if (upError) {
    logServerError("page-image-swap.revision", upError);
    return 0;
  }
  return swapped.changed;
}
