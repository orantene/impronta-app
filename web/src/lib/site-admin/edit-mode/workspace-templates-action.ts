"use server";

/**
 * Phase 11 — workspace template gallery server actions.
 *
 * Three operations against `cms_workspace_templates`:
 *
 *   1. saveCurrentHomepageAsTemplate  — snapshot the current draft
 *      composition (slot/sortOrder + sectionTypeKey + props) into a
 *      tenant-owned template row.
 *   2. listWorkspaceTemplates         — list private (this tenant's) and
 *      platform-promoted templates the gallery can render.
 *   3. applyWorkspaceTemplate         — clone the template's snapshot back
 *      into fresh draft sections + a new homepage draft composition.
 *   4. deleteWorkspaceTemplate        — soft-delete (visibility=archived).
 *   5. promoteWorkspaceTemplate       — super_admin lifts visibility from
 *      private → platform so other tenants can see it (template
 *      marketplace, see Item 12).
 *
 * The DB row stores a JSONB snapshot mirroring `published_homepage_snapshot`
 * but tenant-agnostic — no section IDs, just type + props — so the same
 * snapshot can re-hydrate into any tenant.
 */

import { randomBytes } from "node:crypto";

import { requireStaff } from "@/lib/server/action-guards";
import { requireTenantScope } from "@/lib/saas";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { DEFAULT_PLATFORM_LOCALE } from "@/lib/site-admin";
import { sectionUpsertSchema } from "@/lib/site-admin/forms/sections";
import {
  getSectionType,
  type SectionTypeKey,
} from "@/lib/site-admin/sections/registry";
import { upsertSection } from "@/lib/site-admin/server/sections";
import {
  ensureHomepageRow,
  loadHomepageForStaff,
  saveHomepageDraftComposition,
} from "@/lib/site-admin/server/homepage";

export interface WorkspaceTemplateSnapshotEntry {
  slotKey: string;
  sortOrder: number;
  sectionTypeKey: string;
  schemaVersion: number;
  name: string;
  props: Record<string, unknown>;
}

export interface WorkspaceTemplateSnapshot {
  version: 1;
  /** Tenant-agnostic — slot composition for the homepage at save-time. */
  slots: WorkspaceTemplateSnapshotEntry[];
  capturedAt: string;
}

export interface WorkspaceTemplateRow {
  id: string;
  name: string;
  description: string | null;
  visibility: "private" | "platform" | "archived";
  sectionCount: number;
  createdAt: string;
  ownTenant: boolean;
}

export type SaveTemplateResult =
  | { ok: true; templateId: string }
  | { ok: false; error: string };

export type ListTemplatesResult =
  | { ok: true; templates: ReadonlyArray<WorkspaceTemplateRow> }
  | { ok: false; error: string };

export type ApplyTemplateResult =
  | { ok: true; createdSections: number; skipped: number }
  | { ok: false; error: string };

export type SimpleResult = { ok: true } | { ok: false; error: string };

function shortToken(): string {
  return randomBytes(3).toString("hex");
}

// ── 1. saveCurrentHomepageAsTemplate ─────────────────────────────────────

export async function saveCurrentHomepageAsTemplate(input: {
  name: string;
  description?: string;
  /** When true, snapshot the live composition; otherwise the draft. */
  fromLive?: boolean;
}): Promise<SaveTemplateResult> {
  const auth = await requireStaff();
  if (!auth.ok) return { ok: false, error: auth.error };
  const scope = await requireTenantScope().catch(() => null);
  if (!scope) return { ok: false, error: "Pick an agency workspace first." };

  const name = input.name?.trim();
  if (!name) return { ok: false, error: "Name the template before saving." };
  if (name.length > 120) {
    return { ok: false, error: "Name must be 120 characters or less." };
  }

  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "Server is missing service-role credentials." };

  const state = await loadHomepageForStaff(
    admin,
    scope.tenantId,
    DEFAULT_PLATFORM_LOCALE,
  );
  if (!state) {
    return {
      ok: false,
      error: "Homepage not initialised yet — open the composer once first.",
    };
  }
  const slots = input.fromLive ? state.liveSlots : state.draftSlots;
  if (slots.length === 0) {
    return {
      ok: false,
      error: input.fromLive
        ? "Nothing published yet — publish first or save the draft."
        : "Draft is empty — add at least one section before saving.",
    };
  }

  // Pull section facts for every referenced section.
  const ids = Array.from(new Set(slots.map((s) => s.section_id)));
  const { data: sectionRows, error: sErr } = await admin
    .from("cms_sections")
    .select("id, section_type_key, schema_version, name, props_jsonb")
    .eq("tenant_id", scope.tenantId)
    .in("id", ids);
  if (sErr) {
    return { ok: false, error: "Couldn't read sections." };
  }
  const factsById = new Map<string, {
    section_type_key: string;
    schema_version: number;
    name: string;
    props_jsonb: Record<string, unknown>;
  }>();
  for (const r of sectionRows ?? []) {
    factsById.set(r.id as string, {
      section_type_key: r.section_type_key as string,
      schema_version: r.schema_version as number,
      name: r.name as string,
      props_jsonb: (r.props_jsonb ?? {}) as Record<string, unknown>,
    });
  }

  const entries: WorkspaceTemplateSnapshotEntry[] = [];
  for (const s of slots) {
    const facts = factsById.get(s.section_id);
    if (!facts) continue;
    entries.push({
      slotKey: s.slot_key,
      sortOrder: s.sort_order,
      sectionTypeKey: facts.section_type_key,
      schemaVersion: facts.schema_version,
      name: facts.name,
      props: facts.props_jsonb,
    });
  }

  if (entries.length === 0) {
    return { ok: false, error: "Could not snapshot any sections." };
  }

  const snapshot: WorkspaceTemplateSnapshot = {
    version: 1,
    slots: entries,
    capturedAt: new Date().toISOString(),
  };

  const { data: inserted, error: insErr } = await admin
    .from("cms_workspace_templates")
    .insert({
      tenant_id: scope.tenantId,
      name,
      description: input.description?.trim().slice(0, 500) || null,
      snapshot_jsonb: snapshot,
      visibility: "private",
      created_by: auth.user.id,
    })
    .select("id")
    .single();
  if (insErr || !inserted) {
    return { ok: false, error: "Couldn't save the template." };
  }
  return { ok: true, templateId: inserted.id as string };
}

// ── 2. listWorkspaceTemplates ────────────────────────────────────────────

export async function listWorkspaceTemplates(input?: {
  /** "all" includes platform-promoted from other tenants; "private" only this tenant. */
  scope?: "all" | "private";
}): Promise<ListTemplatesResult> {
  const auth = await requireStaff();
  if (!auth.ok) return { ok: false, error: auth.error };
  const scope = await requireTenantScope().catch(() => null);
  if (!scope) return { ok: false, error: "Pick an agency workspace first." };

  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "Server is missing service-role credentials." };

  const wantAll = input?.scope === "all";
  let query = admin
    .from("cms_workspace_templates")
    .select("id, tenant_id, name, description, visibility, snapshot_jsonb, created_at")
    .neq("visibility", "archived")
    .order("created_at", { ascending: false })
    .limit(100);
  if (!wantAll) {
    query = query.eq("tenant_id", scope.tenantId);
  } else {
    query = query.or(
      `tenant_id.eq.${scope.tenantId},visibility.eq.platform`,
    );
  }
  const { data, error } = await query;
  if (error) return { ok: false, error: "Couldn't load templates." };

  const rows: WorkspaceTemplateRow[] = (data ?? []).map((r) => {
    const snap = (r.snapshot_jsonb ?? {}) as Partial<WorkspaceTemplateSnapshot>;
    const slots = Array.isArray(snap.slots) ? snap.slots : [];
    return {
      id: r.id as string,
      name: r.name as string,
      description: (r.description ?? null) as string | null,
      visibility: r.visibility as "private" | "platform" | "archived",
      sectionCount: slots.length,
      createdAt: r.created_at as string,
      ownTenant: r.tenant_id === scope.tenantId,
    };
  });
  return { ok: true, templates: rows };
}

// ── 3. applyWorkspaceTemplate ────────────────────────────────────────────

export async function applyWorkspaceTemplate(input: {
  templateId: string;
}): Promise<ApplyTemplateResult> {
  const auth = await requireStaff();
  if (!auth.ok) return { ok: false, error: auth.error };
  const scope = await requireTenantScope().catch(() => null);
  if (!scope) return { ok: false, error: "Pick an agency workspace first." };

  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "Server is missing service-role credentials." };

  const { data: tmpl, error: tErr } = await admin
    .from("cms_workspace_templates")
    .select("id, tenant_id, name, snapshot_jsonb, visibility")
    .eq("id", input.templateId)
    .maybeSingle();
  if (tErr || !tmpl) return { ok: false, error: "Template not found." };
  // Authorise: must be own tenant or platform-promoted.
  if (tmpl.tenant_id !== scope.tenantId && tmpl.visibility !== "platform") {
    return { ok: false, error: "You don't have access to that template." };
  }
  const snap = (tmpl.snapshot_jsonb ?? {}) as Partial<WorkspaceTemplateSnapshot>;
  const entries = Array.isArray(snap.slots) ? snap.slots : [];
  if (entries.length === 0) {
    return { ok: false, error: "Template has no sections to apply." };
  }

  // Ensure homepage row exists.
  const ensure = await ensureHomepageRow(admin, {
    tenantId: scope.tenantId,
    locale: DEFAULT_PLATFORM_LOCALE,
    actorProfileId: auth.user.id,
  });
  if (!ensure.ok) {
    return { ok: false, error: ensure.message ?? "Couldn't initialise homepage." };
  }

  // Clone each entry as a new section row owned by this tenant.
  const created: Array<{ slotKey: string; sectionId: string; sortOrder: number }> = [];
  let skipped = 0;
  for (const entry of entries) {
    const reg = getSectionType(entry.sectionTypeKey);
    if (!reg) {
      skipped += 1;
      continue;
    }
    const name = `${entry.name ?? entry.sectionTypeKey} (from ${tmpl.name}) ${shortToken()}`;
    const values = {
      tenantId: scope.tenantId,
      sectionTypeKey: entry.sectionTypeKey as SectionTypeKey,
      schemaVersion: reg.currentVersion,
      props: entry.props ?? {},
      expectedVersion: 0 as const,
      name,
    };
    const parsed = sectionUpsertSchema.safeParse(values);
    if (!parsed.success) {
      skipped += 1;
      continue;
    }
    const result = await upsertSection(admin, {
      tenantId: scope.tenantId,
      values: parsed.data,
      actorProfileId: auth.user.id,
    });
    if (!result.ok) {
      skipped += 1;
      continue;
    }
    created.push({
      slotKey: entry.slotKey,
      sectionId: result.data.id,
      sortOrder: entry.sortOrder,
    });
  }

  if (created.length === 0) {
    return {
      ok: false,
      error:
        "Could not create any sections from the template — registry mismatch?",
    };
  }

  // Save fresh draft composition pointing at the new sections.
  const state = await loadHomepageForStaff(
    admin,
    scope.tenantId,
    DEFAULT_PLATFORM_LOCALE,
  );
  if (!state) {
    return { ok: false, error: "Homepage row missing after ensure — try again." };
  }
  const slotsMap: Record<string, Array<{ sectionId: string; sortOrder: number }>> = {};
  for (const c of created) {
    (slotsMap[c.slotKey] ?? (slotsMap[c.slotKey] = [])).push({
      sectionId: c.sectionId,
      sortOrder: c.sortOrder,
    });
  }
  const composition = await saveHomepageDraftComposition(admin, {
    tenantId: scope.tenantId,
    values: {
      tenantId: scope.tenantId,
      locale: DEFAULT_PLATFORM_LOCALE,
      expectedVersion: state.page.version,
      metadata: {
        title: state.page.title ?? "Homepage",
        metaDescription: state.page.meta_description ?? undefined,
        introTagline: undefined,
      },
      slots: slotsMap,
    },
    actorProfileId: auth.user.id,
  });
  if (!composition.ok) {
    return {
      ok: false,
      error:
        composition.message ??
        "Sections created but the composition save failed — reload and re-arrange manually.",
    };
  }
  return { ok: true, createdSections: created.length, skipped };
}

// ── 4. deleteWorkspaceTemplate ───────────────────────────────────────────

export async function deleteWorkspaceTemplate(input: {
  templateId: string;
}): Promise<SimpleResult> {
  const auth = await requireStaff();
  if (!auth.ok) return { ok: false, error: auth.error };
  const scope = await requireTenantScope().catch(() => null);
  if (!scope) return { ok: false, error: "Pick an agency workspace first." };

  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "Server is missing service-role credentials." };

  // Soft-delete via visibility=archived; preserves audit history.
  const { error } = await admin
    .from("cms_workspace_templates")
    .update({ visibility: "archived", updated_at: new Date().toISOString() })
    .eq("id", input.templateId)
    .eq("tenant_id", scope.tenantId);
  if (error) return { ok: false, error: "Couldn't archive the template." };
  return { ok: true };
}

// ── 5. promoteWorkspaceTemplate (super_admin only) ───────────────────────

export async function promoteWorkspaceTemplate(input: {
  templateId: string;
  toPlatform: boolean;
}): Promise<SimpleResult> {
  const auth = await requireStaff();
  if (!auth.ok) return { ok: false, error: auth.error };
  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "Server is missing service-role credentials." };

  // Super-admin gate.
  const { data: profile } = await admin
    .from("profiles")
    .select("role")
    .eq("id", auth.user.id)
    .maybeSingle();
  if (!profile || profile.role !== "super_admin") {
    return { ok: false, error: "Only platform admins can promote templates." };
  }

  const { error } = await admin
    .from("cms_workspace_templates")
    .update({
      visibility: input.toPlatform ? "platform" : "private",
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.templateId);
  if (error) return { ok: false, error: "Couldn't change template visibility." };
  return { ok: true };
}
