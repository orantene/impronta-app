"use server";

/**
 * apply-shell-variant-action.ts — the TENANT-side apply for a shell header /
 * footer variant picked from the "+" gallery's Shell tab.
 *
 * WHY THIS EXISTS ALONGSIDE `applyShellTemplateToTenant`
 * --------------------------------------------------------------------------
 * That action is the PLATFORM path: a super-admin stamps a template onto a
 * chosen tenant, gated by `isPlatformAdmin` and passing the tenant id in as an
 * argument. An operator applying a variant to their OWN shell from inside the
 * editor is a different actor with a different gate and no tenant argument to
 * trust. Reusing it would have meant loosening a super-admin check to also
 * accept tenant staff — turning one clear boundary into a branchy one, on the
 * action that can write any tenant's shell.
 *
 * So: separate entry point, tenant scope resolved from the session (never from
 * the client), and the SAME pure merge underneath —
 * `applyShellTemplateToTree`, which owns the replace-landmark semantics
 * (slim to [header, footer], replace only the target landmark's children,
 * re-mint every id, preserve the other landmark verbatim).
 *
 * WHY A GALLERY "INSERT" CANNOT DO THIS
 * --------------------------------------------------------------------------
 * The gallery's normal `dbTemplate` path INSERTS a subtree at an anchor. A shell
 * variant must REPLACE a landmark's children. Routing a shell card through the
 * insert path appends a second header inside the existing one — which is why
 * the panel special-cases the shell tab to call this action instead.
 *
 * WRITE TARGET: `cms_pages.blocks` — the freeform DRAFT. Never the published
 * snapshot. Applying a variant is not publishing it; the operator publishes the
 * shell explicitly, which is also what makes the two-click confirm in the panel
 * a recoverable decision rather than a live-site change.
 */

import { revalidateTag } from "next/cache";

import { requireSession } from "@/lib/server/action-guards";
import { requireTenantScope } from "@/lib/saas";
import { userHasCapability } from "@/lib/access/has-capability";
import { logServerError, CLIENT_ERROR } from "@/lib/server/safe-error";
import { tagFor } from "@/lib/site-admin/cache-tags";
import { isShellVariantApplyAllowedForPlan } from "@/lib/site-admin/edit-mode/shell-plan-guard";
import { loadBuilderWorkspacePlan } from "@/lib/site-admin/builder-capabilities";
import { resolveSnapshotBuilderTree } from "@/lib/site-admin/builder-node/snapshot-tree";
import type { HomepageSnapshot } from "@/lib/site-admin/server/homepage";
import type { BuilderNodeTree } from "@/lib/site-admin/builder-node/types";

import {
  applyShellTemplateToTree,
  asShellTemplateKind,
} from "./apply-shell-template-core";
import type { BuilderTemplateRow } from "./registry-rows";

export type ApplyShellVariantResult =
  | { ok: true; slot: "header" | "footer"; replacedChildCount: number }
  | { ok: false; error: string; code?: string };

const CAPABILITY = "agency.site_admin.pages.edit";

/**
 * Apply a published `shell_header` / `shell_footer` template to the ACTIVE
 * tenant's shell draft.
 *
 * @param templateId a published `builder_templates` row of a shell kind.
 */
export async function applyShellVariantToWorkspaceAction(
  templateId: string,
): Promise<ApplyShellVariantResult> {
  const auth = await requireSession();
  if (!auth.ok) return { ok: false, error: auth.error };

  const scope = await requireTenantScope().catch(() => null);
  if (!scope) return { ok: false, error: "No tenant in scope." };

  if (!(await userHasCapability(CAPABILITY, scope.tenantId))) {
    return { ok: false, error: "You don't have permission to edit this site." };
  }

  // Plan gate. Replacing a landmark wholesale is a STRUCTURAL move, so it needs
  // `full` rather than merely "shell editing is not locked" — the distinction
  // the owner's decision draws between form controls and freeform editing.
  const plan = await loadBuilderWorkspacePlan(auth.supabase, scope.tenantId, {
    logTag: "shell_variant.apply",
  });
  if (!isShellVariantApplyAllowedForPlan(plan)) {
    return {
      ok: false,
      error: "Header and footer templates are available on the Agency plan.",
      code: "PLAN_LOCKED",
    };
  }

  try {
    // ── 1. Load + validate the template ──────────────────────────────────
    // Read with the CALLER's client so the `status = 'published'` RLS policy is
    // the boundary, not an app-side filter over a service-role read.
    const { data: tmpl, error: tmplErr } = await auth.supabase
      .from("builder_templates")
      .select("kind, status, title, builder_tree")
      .eq("id", templateId)
      .maybeSingle();
    if (tmplErr) return { ok: false, error: tmplErr.message };
    if (!tmpl) return { ok: false, error: "Template not found." };

    const row = tmpl as Pick<
      BuilderTemplateRow,
      "kind" | "status" | "title" | "builder_tree"
    >;
    const shellKind = asShellTemplateKind(row.kind);
    if (!shellKind) {
      return {
        ok: false,
        error: "That template isn't a header or footer template.",
      };
    }
    if (row.status !== "published") {
      return { ok: false, error: "Only a published template can be applied." };
    }
    const templateTree: BuilderNodeTree = Array.isArray(row.builder_tree)
      ? row.builder_tree
      : [];

    // ── 2. Resolve the tenant's shell row ────────────────────────────────
    const { data: shell, error: shellErr } = await auth.supabase
      .from("cms_pages")
      .select("id, blocks, published_page_snapshot")
      .eq("tenant_id", scope.tenantId)
      .eq("system_template_key", "site_shell")
      .neq("status", "archived")
      .maybeSingle();
    if (shellErr) return { ok: false, error: shellErr.message };
    if (!shell) {
      return {
        ok: false,
        error: "This workspace has no site shell yet.",
        code: "NOT_FOUND",
      };
    }
    const shellRow = shell as {
      id: string;
      blocks: unknown;
      published_page_snapshot: HomepageSnapshot | null;
    };

    // ── 3. Current tree: freeform draft, else the published snapshot ─────
    // The snapshot fallback matters on a freshly-backfilled shell: without it
    // the apply would merge onto a blank canvas and DROP the other landmark's
    // real content, which is the opposite of "preserve the other landmark".
    let currentTree: BuilderNodeTree = Array.isArray(shellRow.blocks)
      ? (shellRow.blocks as BuilderNodeTree)
      : [];
    if (currentTree.length === 0 && shellRow.published_page_snapshot) {
      const snapshot = shellRow.published_page_snapshot;
      if (Array.isArray(snapshot.slots)) {
        currentTree = resolveSnapshotBuilderTree(snapshot).tree;
      }
    }

    const targetSlot = shellKind === "shell_header" ? "header" : "footer";
    // Reported back so the panel's toast can be honest about what was replaced
    // ("Replaced 4 blocks") rather than a vague success.
    const replacedChildCount = countLandmarkChildren(currentTree, targetSlot);

    // ── 4. Merge (PURE) ───────────────────────────────────────────────────
    const nextTree = applyShellTemplateToTree({
      currentTree,
      templateTree,
      kind: shellKind,
    });

    // ── 5. Persist to the DRAFT ───────────────────────────────────────────
    const { error: updErr } = await auth.supabase
      .from("cms_pages")
      .update({ blocks: nextTree, updated_at: new Date().toISOString() })
      .eq("id", shellRow.id)
      .eq("tenant_id", scope.tenantId)
      .eq("system_template_key", "site_shell");
    if (updErr) {
      return { ok: false, error: `Couldn't save the shell: ${updErr.message}` };
    }

    revalidateTag(tagFor(scope.tenantId, "pages-all"), "default");
    revalidateTag(tagFor(scope.tenantId, "storefront"), "default");

    return { ok: true, slot: targetSlot, replacedChildCount };
  } catch (err) {
    logServerError("applyShellVariantToWorkspaceAction", err);
    return { ok: false, error: CLIENT_ERROR.generic };
  }
}

/** How many freeform children the target landmark currently holds. */
function countLandmarkChildren(
  tree: BuilderNodeTree,
  slot: "header" | "footer",
): number {
  const sectionTypeKey = slot === "header" ? "site_header" : "site_footer";
  for (const node of tree) {
    if (node.kind !== "section") continue;
    const props = node.props as { slotKey?: unknown; sectionTypeKey?: unknown };
    if (props.slotKey === slot || props.sectionTypeKey === sectionTypeKey) {
      return Array.isArray(node.children) ? node.children.length : 0;
    }
  }
  return 0;
}
