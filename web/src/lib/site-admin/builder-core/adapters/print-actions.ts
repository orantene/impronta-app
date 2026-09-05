import "server-only";

/**
 * The DB seam for the print surface adapter — load/save a `print_designs` row.
 * Injected into `createPrintAdapter` so the adapter itself stays testable with a
 * spy. Server-only: uses the service-role client, gated by
 * `requireWorkspaceStaffAction` (tenant resolved from the workspace SURFACE, no
 * id in the signature) so a caller can only touch their own tenant's designs.
 *
 * Version is optimistic-concurrency: `savePrintDesign` writes only when the
 * row's `version` still equals the caller's `expectedVersion`, then advances it,
 * so a second tab gets an honest "changed elsewhere" instead of a silent clobber.
 */

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { requireWorkspaceStaffAction } from "@/lib/saas/admin-scope";
import { logServerError } from "@/lib/server/safe-error";
import type { BuilderNodeTree } from "@/lib/site-admin/builder-node/types";

import type {
  PrintAdapterActions,
  PrintDesignRow,
  PrintDesignSaveOutcome,
} from "./print-adapter-core";

const EDIT_PRINT_CAPABILITY = "agency.site_admin.pages.edit" as const;

async function loadPrintDesign(input: {
  pageId: string;
}): Promise<PrintDesignRow | null> {
  const guard = await requireWorkspaceStaffAction({
    capability: EDIT_PRINT_CAPABILITY,
  });
  if (!guard.ok) return null;
  const admin = createServiceRoleClient();
  if (!admin) return null;

  const { data, error } = await admin
    .from("print_designs")
    .select("id, name, size, builder_tree, version")
    .eq("id", input.pageId)
    .eq("tenant_id", guard.tenantId)
    .maybeSingle();

  if (error) {
    logServerError("print-actions:loadPrintDesign", error);
    return null;
  }
  if (!data) return null;
  return {
    id: data.id as string,
    name: (data.name as string) ?? "",
    size: (data.size as string) ?? "table_tent",
    builder_tree: (data.builder_tree as BuilderNodeTree | null) ?? [],
    version: (data.version as number) ?? 0,
  };
}

async function savePrintDesign(input: {
  pageId: string;
  builderTree: BuilderNodeTree;
  expectedVersion: number;
}): Promise<PrintDesignSaveOutcome> {
  const guard = await requireWorkspaceStaffAction({
    capability: EDIT_PRINT_CAPABILITY,
  });
  if (!guard.ok) return { ok: false, error: guard.error };
  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "Could not reach the store." };

  const nextVersion = input.expectedVersion + 1;
  const { data, error } = await admin
    .from("print_designs")
    .update({
      builder_tree: input.builderTree,
      version: nextVersion,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.pageId)
    .eq("tenant_id", guard.tenantId)
    .eq("version", input.expectedVersion)
    .select("id")
    .maybeSingle();

  if (error) {
    logServerError("print-actions:savePrintDesign", error);
    return { ok: false, error: "Could not save this print design." };
  }
  // No row updated ⇒ the version moved (another tab) or the design is gone.
  if (!data) {
    return {
      ok: false,
      error: "This print design changed in another tab. Reload before saving.",
    };
  }
  return { ok: true, version: nextVersion };
}

/** The production action surface bound into the print adapter. */
export const printAdapterActions: PrintAdapterActions = {
  loadPrintDesign,
  savePrintDesign,
};
