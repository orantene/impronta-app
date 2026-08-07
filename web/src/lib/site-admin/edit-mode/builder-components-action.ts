"use server";

/**
 * Living components — Phase 1 server actions (saved blocks).
 *
 *   1. saveBuilderComponent   — store a reusable builder-node subtree the
 *      operator selected on the canvas, tenant-owned.
 *   2. listBuilderComponents  — list this tenant's blocks (+ platform-promoted)
 *      for the "My blocks" gallery, returning the full subtree so the client
 *      can insert copies without a round-trip.
 *   3. deleteBuilderComponent — soft-delete (visibility = archived).
 *
 * Backed by `cms_builder_components` (RLS-scoped to staff of the tenant).
 * Reads/writes go through the service-role client + app-level tenant scoping,
 * matching the workspace-templates action.
 */

import { requireSession } from "@/lib/server/action-guards";
import { requireEditSurfaceTenantScope } from "@/lib/saas";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import type { BuilderNode } from "@/lib/site-admin/builder-node/types";
import {
  buildBuilderComponentRow,
  countSubtreeNodes,
  looksLikeBuilderNode,
  type BuilderComponentRow,
} from "@/lib/site-admin/edit-mode/builder-component-rows";

export type { BuilderComponentRow } from "@/lib/site-admin/edit-mode/builder-component-rows";

export type SaveComponentResult =
  | { ok: true; componentId: string }
  | { ok: false; error: string };

export type ListComponentsResult =
  | { ok: true; components: ReadonlyArray<BuilderComponentRow> }
  | { ok: false; error: string };

export type SimpleComponentResult = { ok: true } | { ok: false; error: string };

const MAX_NODES = 400;

// ── 1. saveBuilderComponent ──────────────────────────────────────────────

export async function saveBuilderComponent(input: {
  name: string;
  description?: string;
  subtree: BuilderNode;
}): Promise<SaveComponentResult> {
  const auth = await requireSession();
  if (!auth.ok) return { ok: false, error: auth.error };
  const scope = await requireEditSurfaceTenantScope().catch(() => null);
  if (!scope) return { ok: false, error: "Pick an agency workspace first." };

  const name = input.name?.trim();
  if (!name) return { ok: false, error: "Name the block before saving." };
  if (name.length > 120) {
    return { ok: false, error: "Name must be 120 characters or less." };
  }
  if (!looksLikeBuilderNode(input.subtree)) {
    return { ok: false, error: "Select a block on the canvas first." };
  }
  if (input.subtree.kind === "section") {
    return {
      ok: false,
      error: "Whole sections can't be saved as a block — pick a block inside it.",
    };
  }
  const nodeCount = countSubtreeNodes(input.subtree);
  if (nodeCount > MAX_NODES) {
    return { ok: false, error: "That block is too large to save." };
  }

  const admin = createServiceRoleClient();
  if (!admin) {
    return { ok: false, error: "Server is missing service-role credentials." };
  }

  const { data: inserted, error: insErr } = await admin
    .from("cms_builder_components")
    .insert({
      tenant_id: scope.tenantId,
      name,
      description: input.description?.trim().slice(0, 500) || null,
      root_kind: input.subtree.kind,
      subtree_jsonb: input.subtree,
      visibility: "private",
      created_by: auth.user.id,
    })
    .select("id")
    .single();
  if (insErr || !inserted) {
    return { ok: false, error: "Couldn't save the block." };
  }
  return { ok: true, componentId: inserted.id as string };
}

// ── 1b. updateBuilderComponent (Phase 3 — edit master) ───────────────────

/**
 * Overwrite an existing saved component's master subtree from a freshly-selected
 * block. This is the practical "edit master" flow: edit any copy on the canvas,
 * then push it back over the master — every PUBLISHED linked instance then
 * reflects the change live (Phase 3 resolution), minus its own overrides.
 * Tenant-scoped; never crosses tenants.
 */
export async function updateBuilderComponent(input: {
  componentId: string;
  subtree: BuilderNode;
}): Promise<SaveComponentResult> {
  const auth = await requireSession();
  if (!auth.ok) return { ok: false, error: auth.error };
  const scope = await requireEditSurfaceTenantScope().catch(() => null);
  if (!scope) return { ok: false, error: "Pick an agency workspace first." };

  if (!looksLikeBuilderNode(input.subtree)) {
    return { ok: false, error: "Select a block on the canvas first." };
  }
  if (input.subtree.kind === "section") {
    return { ok: false, error: "Whole sections can't be a component master." };
  }
  if (countSubtreeNodes(input.subtree) > MAX_NODES) {
    return { ok: false, error: "That block is too large to save." };
  }

  const admin = createServiceRoleClient();
  if (!admin) {
    return { ok: false, error: "Server is missing service-role credentials." };
  }

  const { data: updated, error } = await admin
    .from("cms_builder_components")
    .update({
      root_kind: input.subtree.kind,
      subtree_jsonb: input.subtree,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.componentId)
    .eq("tenant_id", scope.tenantId)
    .neq("visibility", "archived")
    .select("id")
    .single();
  if (error || !updated) {
    return { ok: false, error: "Couldn't update the master component." };
  }
  return { ok: true, componentId: updated.id as string };
}

// ── 2. listBuilderComponents ─────────────────────────────────────────────

export async function listBuilderComponents(): Promise<ListComponentsResult> {
  const auth = await requireSession();
  if (!auth.ok) return { ok: false, error: auth.error };
  const scope = await requireEditSurfaceTenantScope().catch(() => null);
  if (!scope) return { ok: false, error: "Pick an agency workspace first." };

  const admin = createServiceRoleClient();
  if (!admin) {
    return { ok: false, error: "Server is missing service-role credentials." };
  }

  const { data, error } = await admin
    .from("cms_builder_components")
    .select(
      "id, tenant_id, name, description, root_kind, subtree_jsonb, visibility, created_at",
    )
    .neq("visibility", "archived")
    .or(`tenant_id.eq.${scope.tenantId},visibility.eq.platform`)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) return { ok: false, error: "Couldn't load saved blocks." };

  const components = (data ?? [])
    .map((r) => buildBuilderComponentRow(r, scope.tenantId))
    .filter((row): row is BuilderComponentRow => row !== null);
  return { ok: true, components };
}

// ── 3. deleteBuilderComponent ────────────────────────────────────────────

export async function deleteBuilderComponent(input: {
  componentId: string;
}): Promise<SimpleComponentResult> {
  const auth = await requireSession();
  if (!auth.ok) return { ok: false, error: auth.error };
  const scope = await requireEditSurfaceTenantScope().catch(() => null);
  if (!scope) return { ok: false, error: "Pick an agency workspace first." };

  const admin = createServiceRoleClient();
  if (!admin) {
    return { ok: false, error: "Server is missing service-role credentials." };
  }

  const { error } = await admin
    .from("cms_builder_components")
    .update({ visibility: "archived", updated_at: new Date().toISOString() })
    .eq("id", input.componentId)
    .eq("tenant_id", scope.tenantId);
  if (error) return { ok: false, error: "Couldn't delete the block." };
  return { ok: true };
}
