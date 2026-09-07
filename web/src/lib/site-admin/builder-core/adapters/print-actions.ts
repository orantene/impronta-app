"use server";

/**
 * Server actions for the print surface — load/save a `print_designs` row.
 * "use server" (not import "server-only") because the CLIENT mount's bound
 * adapter (`createBoundPrintAdapter`) calls these across the RSC boundary,
 * exactly as site-shell-actions.ts is called by createBoundSiteShellAdapter.
 *
 * Gated by `requireWorkspaceStaffAction` — tenant resolved from the workspace
 * SURFACE, no id in the signature — so a caller can only touch their own
 * tenant's designs. Version is optimistic-concurrency: the save writes only when
 * the row's `version` still equals the caller's expected value, then advances
 * it, so a second tab gets an honest "changed elsewhere" instead of a clobber.
 */

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { requireWorkspaceStaffAction } from "@/lib/saas/admin-scope";
import { logServerError } from "@/lib/server/safe-error";
import type { BuilderNodeTree } from "@/lib/site-admin/builder-node/types";

import type {
  PrintDesignRow,
  PrintDesignSaveOutcome,
} from "./print-adapter-core";

const EDIT_PRINT_CAPABILITY = "agency.site_admin.pages.edit" as const;

const PRINT_SIZE_KEYS = ["table_tent", "a5", "a4", "sticker", "card"] as const;
type PrintSizeKeyLite = (typeof PRINT_SIZE_KEYS)[number];

export type CreatePrintDesignOutcome =
  | { ok: true; id: string }
  | { ok: false; error: string };

/**
 * Create a blank print design for the current tenant (slice 1b's "Design a
 * print card" door), returning its id so the caller can open it in the builder
 * at /[tenantSlug]/admin/print/<id>. Tenant + capability resolved from the
 * session, never a client-passed id.
 */
export async function createPrintDesignAction(input?: {
  name?: string;
  size?: PrintSizeKeyLite;
}): Promise<CreatePrintDesignOutcome> {
  const guard = await requireWorkspaceStaffAction({
    capability: EDIT_PRINT_CAPABILITY,
  });
  if (!guard.ok) return { ok: false, error: guard.error };
  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "Could not reach the store." };

  const size: PrintSizeKeyLite =
    input?.size && PRINT_SIZE_KEYS.includes(input.size)
      ? input.size
      : "table_tent";
  const name = (input?.name ?? "").trim() || "Untitled print design";

  const { data, error } = await admin
    .from("print_designs")
    .insert({ tenant_id: guard.tenantId, name, size })
    .select("id")
    .maybeSingle();

  if (error) {
    logServerError("print-actions:createPrintDesignAction", error);
    return { ok: false, error: "Could not create a print design." };
  }
  if (!data) return { ok: false, error: "Could not create a print design." };
  return { ok: true, id: data.id as string };
}

/** A tenant's print designs, newest first, for the admin/print list. */
export async function listTenantPrintDesignsAction(): Promise<
  ReadonlyArray<{ id: string; name: string; size: string; updatedAt: string }>
> {
  const guard = await requireWorkspaceStaffAction({
    capability: EDIT_PRINT_CAPABILITY,
  });
  if (!guard.ok) return [];
  const admin = createServiceRoleClient();
  if (!admin) return [];

  const { data, error } = await admin
    .from("print_designs")
    .select("id, name, size, updated_at")
    .eq("tenant_id", guard.tenantId)
    .order("updated_at", { ascending: false })
    .limit(200);

  if (error) {
    logServerError("print-actions:listTenantPrintDesignsAction", error);
    return [];
  }
  return (data ?? []).map((r) => ({
    id: r.id as string,
    name: (r.name as string) ?? "",
    size: (r.size as string) ?? "table_tent",
    updatedAt: (r.updated_at as string) ?? "",
  }));
}

export async function loadPrintDesignAction(input: {
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
    logServerError("print-actions:loadPrintDesignAction", error);
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

export async function savePrintDesignAction(input: {
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
    logServerError("print-actions:savePrintDesignAction", error);
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
