"use server";

/**
 * apply-shell-template-action.ts — WS-A A7 super-admin action that applies a
 * published `shell_header` / `shell_footer` Builder Lab template to a tenant's
 * `site_shell` row.
 *
 * This is the shell analogue of the page_templates apply: a super-admin authors
 * a header/footer template in the Lab, then stamps it onto a chosen tenant's
 * shared shell. It writes the template's (re-minted) `builder_tree` onto the
 * targeted landmark of the tenant's `site_shell` `blocks` tree via the PURE
 * `applyShellTemplateToTree`, then bumps the catalog version + revalidates.
 *
 * WRITE TARGET: `cms_pages.blocks` (the freeform draft holding spot the A1
 * adapter uses) — NEVER `cms_page_sections`. The dormant slot/snapshot system is
 * untouched; an operator still has to Publish the shell surface (or run the
 * republish path) to bake the applied tree into `published_page_snapshot`.
 *
 * GUARDRAIL: super-admin-gated, and the applied tree only EVER renders once the
 * tenant is opted into the shell flags (both OFF by default). With the flags off,
 * the live header/footer keep rendering through the legacy `PublicHeader` path.
 *
 * "use server" file: the only export is the async action. Pure logic lives in
 * `apply-shell-template-core.ts` (node-testable, no I/O).
 */

import { getCachedActorSession } from "@/lib/server/request-cache";
import { isPlatformAdmin } from "@/lib/access/platform-role";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError, CLIENT_ERROR } from "@/lib/server/safe-error";
import { revalidatePath, revalidateTag } from "next/cache";
import { tagFor } from "@/lib/site-admin/cache-tags";
import { DEFAULT_PLATFORM_LOCALE } from "@/lib/site-admin";
import { isLocale, type Locale } from "@/i18n/config";
import { resolveSnapshotBuilderTree } from "@/lib/site-admin/builder-node/snapshot-tree";
import type { HomepageSnapshot } from "@/lib/site-admin/server/homepage";
import type {
  BuilderNodeTree,
} from "@/lib/site-admin/builder-node/types";
import type { BuilderTemplateRow } from "./registry-rows";
import { bumpCatalogVersion } from "./catalog-version";
import {
  applyShellTemplateToTree,
  asShellTemplateKind,
} from "./apply-shell-template-core";

export type ApplyShellTemplateResult =
  | { ok: true; pageId: string; slot: "header" | "footer" }
  | { ok: false; error: string };

const TEMPLATE_CACHE_PATH = "/platform/admin";

function asLocale(raw?: string): Locale {
  return raw && isLocale(raw) ? raw : DEFAULT_PLATFORM_LOCALE;
}

/**
 * Apply a published shell template to a tenant's `site_shell` row.
 *
 * @param templateId  a `builder_templates` row whose kind is `shell_header` or
 *                    `shell_footer` and whose status is `published`.
 * @param tenantId    the tenant whose shared shell to write.
 * @param locale      which locale's shell row (every tenant has one per locale).
 */
export async function applyShellTemplateToTenant(
  templateId: string,
  tenantId: string,
  locale?: string,
): Promise<ApplyShellTemplateResult> {
  // ── Gate: super-admin only (mirrors registry-actions.ts) ─────────────────
  const session = await getCachedActorSession();
  if (!session.user) return { ok: false, error: "Not signed in." };
  if (!isPlatformAdmin(session.profile)) {
    return { ok: false, error: "Super admin access required." };
  }

  const admin = createServiceRoleClient();
  if (!admin) {
    return { ok: false, error: "Server is missing service-role credentials." };
  }

  const loc = asLocale(locale);

  try {
    // ── 1. Load + validate the template ──────────────────────────────────
    const { data: tmpl, error: tmplErr } = await admin
      .from("builder_templates")
      .select("kind, status, builder_tree")
      .eq("id", templateId)
      .maybeSingle();
    if (tmplErr) return { ok: false, error: tmplErr.message };
    if (!tmpl) return { ok: false, error: "Template not found." };

    const shellKind = asShellTemplateKind(
      (tmpl as { kind: BuilderTemplateRow["kind"] }).kind,
    );
    if (!shellKind) {
      return {
        ok: false,
        error: "Template is not a shell template (kind must be shell_header or shell_footer).",
      };
    }
    if ((tmpl as { status: string }).status !== "published") {
      return { ok: false, error: "Only a published template can be applied." };
    }
    const templateTree = Array.isArray((tmpl as { builder_tree: unknown }).builder_tree)
      ? ((tmpl as { builder_tree: BuilderNodeTree }).builder_tree)
      : [];

    // ── 2. Resolve the tenant's site_shell row ───────────────────────────
    const { data: shell, error: shellErr } = await admin
      .from("cms_pages")
      .select("id, blocks, published_page_snapshot, updated_at")
      .eq("tenant_id", tenantId)
      .eq("locale", loc)
      .eq("system_template_key", "site_shell")
      .neq("status", "archived")
      .maybeSingle();
    if (shellErr) return { ok: false, error: shellErr.message };
    if (!shell) {
      return {
        ok: false,
        error: "This tenant has no site shell yet — run the shell backfill first.",
      };
    }
    const shellRow = shell as {
      id: string;
      blocks: unknown;
      published_page_snapshot: HomepageSnapshot | null;
    };

    // ── 3. Resolve the current shell tree (draft blocks → snapshot fallback) ─
    // Prefer the freeform draft; fall back to the published snapshot's tree so
    // applying to a freshly-backfilled shell merges onto its real header/footer
    // rather than a blank canvas.
    const draftTree: BuilderNodeTree = Array.isArray(shellRow.blocks)
      ? (shellRow.blocks as BuilderNodeTree)
      : [];
    let currentTree = draftTree;
    if (currentTree.length === 0 && shellRow.published_page_snapshot) {
      const snap = shellRow.published_page_snapshot;
      if (Array.isArray(snap.slots)) {
        currentTree = resolveSnapshotBuilderTree(snap).tree;
      }
    }

    // ── 4. Merge the template onto the targeted landmark (PURE) ───────────
    const nextTree = applyShellTemplateToTree({
      currentTree,
      templateTree,
      kind: shellKind,
    });

    // ── 5. Persist to the freeform draft (`blocks`) — NOT slot composition ─
    const nowIso = new Date().toISOString();
    const { error: updErr } = await admin
      .from("cms_pages")
      .update({ blocks: nextTree, updated_at: nowIso })
      .eq("id", shellRow.id)
      .eq("tenant_id", tenantId)
      .eq("system_template_key", "site_shell");
    if (updErr) {
      return { ok: false, error: `Couldn't write the shell draft: ${updErr.message}` };
    }

    // ── 6. Bump catalog version + revalidate ─────────────────────────────
    await bumpCatalogVersion(admin);
    try {
      revalidateTag(tagFor(tenantId, "pages-all"), "default");
      revalidateTag(tagFor(tenantId, "storefront"), "default");
      revalidatePath(TEMPLATE_CACHE_PATH);
    } catch {
      // tag system may not be initialised in test contexts.
    }

    return {
      ok: true,
      pageId: shellRow.id,
      slot: shellKind === "shell_header" ? "header" : "footer",
    };
  } catch (err) {
    logServerError("applyShellTemplateToTenant", err);
    return { ok: false, error: CLIENT_ERROR.generic };
  }
}
