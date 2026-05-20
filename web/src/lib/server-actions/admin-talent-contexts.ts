"use server";
import { improntaLog } from "@/lib/server/structured-log";

// ============================================================================
// admin-talent-contexts.ts — Contexts / Best-Fit management.
//
// Storage: talent_profile_taxonomy, relationship_type='context',
// taxonomy_term_id -> taxonomy_terms (term_type='context'), grouped under
// taxonomy_terms (term_type='context_group') via parent_id.
//
// Mirrors the proven setAll pattern from admin-talent-skills.ts: the editor
// hands up the DESIRED final set of context term ids; one action does
// auth-once / roster-once / validate-all / diff / bulk delete+insert /
// revalidate-once / return the final resolved list. No per-chip action,
// no reload cascade. The enforce_talent_skill_caps trigger explicitly
// skips non-role rows, so contexts have no DB cap and no parent rules.
// ============================================================================

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireStaffTenantAction } from "@/lib/saas/admin-scope";
import { CLIENT_ERROR, logServerError } from "@/lib/server/safe-error";
import { pgUuidSchema } from "@/lib/site-admin/validators";
import {
  MAX_CONTEXTS_PER_TALENT,
  type ContextCatalogGroup,
  type ResolvedContext,
} from "./admin-talent-contexts.types";

// ─── Read: a talent's resolved contexts ────────────────────────────────────

export async function getResolvedContexts(input: {
  talent_profile_id: string;
}): Promise<
  | { ok: true; contexts: ResolvedContext[] }
  | { ok: false; error: string }
> {
  const auth = await requireStaffTenantAction();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, tenantId } = auth;

  const [{ data: rosterRow }, { data: rows, error }] = await Promise.all([
    supabase
      .from("agency_talent_roster")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("talent_profile_id", input.talent_profile_id)
      .maybeSingle(),
    supabase
      .from("talent_profile_taxonomy")
      .select(
        "taxonomy_term_id, taxonomy_terms!inner(id, slug, name_en, name_es, term_type, parent_id, sort_order)",
      )
      .eq("talent_profile_id", input.talent_profile_id)
      .eq("relationship_type", "context"),
  ]);

  if (!rosterRow) {
    return { ok: false, error: "Talent is not on this tenant's roster." };
  }
  if (error) {
    logServerError("getResolvedContexts", error);
    return { ok: false, error: CLIENT_ERROR.generic };
  }

  type Joined = {
    taxonomy_term_id: string;
    taxonomy_terms: {
      id: string;
      slug: string;
      name_en: string;
      name_es: string | null;
      term_type: string;
      parent_id: string | null;
      sort_order: number | null;
    } | null;
  };
  const ctxRows = ((rows ?? []) as unknown as Joined[]).filter(
    (r) => r.taxonomy_terms && r.taxonomy_terms.term_type === "context",
  );

  // Resolve the context_group parents in one query, map in JS (avoids
  // fragile self-referential PostgREST nesting).
  const parentIds = [
    ...new Set(
      ctxRows
        .map((r) => r.taxonomy_terms!.parent_id)
        .filter((x): x is string => !!x),
    ),
  ];
  const groupById = new Map<
    string,
    { slug: string; name_en: string; sort_order: number }
  >();
  if (parentIds.length > 0) {
    const { data: groups } = await supabase
      .from("taxonomy_terms")
      .select("id, slug, name_en, sort_order")
      .in("id", parentIds)
      .eq("term_type", "context_group");
    for (const g of groups ?? []) {
      groupById.set(g.id, {
        slug: g.slug,
        name_en: g.name_en,
        sort_order: g.sort_order ?? 999,
      });
    }
  }

  const contexts: ResolvedContext[] = ctxRows.map((r) => {
    const t = r.taxonomy_terms!;
    const g = t.parent_id ? groupById.get(t.parent_id) : undefined;
    return {
      context_term_id: t.id,
      context_slug: t.slug,
      context_name_en: t.name_en,
      context_name_es: t.name_es,
      group_id: t.parent_id,
      group_slug: g?.slug ?? null,
      group_name_en: g?.name_en ?? null,
      group_sort_order: g?.sort_order ?? 999,
      sort_order: t.sort_order ?? 999,
    };
  });
  contexts.sort(
    (a, b) =>
      a.group_sort_order - b.group_sort_order ||
      (a.group_name_en ?? "").localeCompare(b.group_name_en ?? "") ||
      a.sort_order - b.sort_order ||
      a.context_name_en.localeCompare(b.context_name_en),
  );

  return { ok: true, contexts };
}

// ─── Read: the selectable context catalog (DB taxonomy, tenant-overlay) ─────

export async function getContextCatalog(): Promise<
  | { ok: true; groups: ContextCatalogGroup[] }
  | { ok: false; error: string }
> {
  const auth = await requireStaffTenantAction();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, tenantId } = auth;

  const [{ data: terms, error: termsErr }, { data: groups }, { data: settings }] =
    await Promise.all([
      supabase
        .from("taxonomy_terms")
        .select("id, slug, name_en, name_es, parent_id, sort_order")
        .eq("term_type", "context")
        .eq("is_active", true)
        .eq("is_generic_fallback", false)
        .order("sort_order", { ascending: true }),
      supabase
        .from("taxonomy_terms")
        .select("id, slug, name_en, sort_order")
        .eq("term_type", "context_group")
        .order("sort_order", { ascending: true }),
      supabase
        .from("agency_taxonomy_settings")
        .select("taxonomy_term_id, is_enabled")
        .eq("tenant_id", tenantId),
    ]);

  if (termsErr) {
    logServerError("getContextCatalog", termsErr);
    return { ok: false, error: CLIENT_ERROR.generic };
  }

  // Tenant overlay: a term is enabled unless an overlay row sets is_enabled
  // false (same default-enabled convention as the skills picker).
  const disabled = new Set(
    (settings ?? [])
      .filter((s) => s.is_enabled === false)
      .map((s) => s.taxonomy_term_id),
  );

  const groupMeta = new Map(
    (groups ?? []).map((g) => [
      g.id,
      { slug: g.slug, name_en: g.name_en, sort_order: g.sort_order ?? 999 },
    ]),
  );

  const byGroup = new Map<string, ContextCatalogGroup>();
  const UNGROUPED = "__ungrouped__";
  for (const t of terms ?? []) {
    if (disabled.has(t.id)) continue;
    const gid = t.parent_id ?? UNGROUPED;
    if (!byGroup.has(gid)) {
      const gm = t.parent_id ? groupMeta.get(t.parent_id) : undefined;
      byGroup.set(gid, {
        group_id: gid,
        group_slug: gm?.slug ?? "other",
        group_name_en: gm?.name_en ?? "Other Contexts",
        sort_order: gm?.sort_order ?? 999,
        contexts: [],
      });
    }
    byGroup.get(gid)!.contexts.push({
      id: t.id,
      slug: t.slug,
      name_en: t.name_en,
      name_es: t.name_es,
      sort_order: t.sort_order ?? 999,
    });
  }

  const result = [...byGroup.values()].sort(
    (a, b) =>
      a.sort_order - b.sort_order ||
      a.group_name_en.localeCompare(b.group_name_en),
  );
  for (const g of result) {
    g.contexts.sort(
      (a, b) =>
        a.sort_order - b.sort_order || a.name_en.localeCompare(b.name_en),
    );
  }

  return { ok: true, groups: result };
}

// ─── setAll: the editor's selected contexts are the DESIRED final state ─────

const setContextsSchema = z.object({
  talent_profile_id: pgUuidSchema(),
  context_term_ids: z.array(pgUuidSchema()).max(MAX_CONTEXTS_PER_TALENT),
});

export async function setTalentProfileContexts(
  input: z.input<typeof setContextsSchema>,
): Promise<
  | { ok: true; contexts: ResolvedContext[] }
  | { ok: false; error: string }
> {
  const auth = await requireStaffTenantAction();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, tenantId } = auth;

  const parsed = setContextsSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid request.",
    };
  }
  const tpid = parsed.data.talent_profile_id;
  const desiredIds = [...new Set(parsed.data.context_term_ids)];
  const LOG = "[setContexts]";
  const t0 = Date.now();
  void improntaLog("admin_talent_contexts.info", {
    message: `${LOG} start talent=${tpid} tenant=${tenantId} desired=${desiredIds.length}`,
  });

  // Roster check (once).
  const { data: rosterRow } = await supabase
    .from("agency_talent_roster")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("talent_profile_id", tpid)
    .maybeSingle();
  if (!rosterRow) {
    void improntaLog("admin_talent_contexts.warn", {
      message: `${LOG} FAIL roster-miss talent=${tpid}`,
    });
    return {
      ok: false,
      error: "Couldn't save: this profile isn't on your roster.",
    };
  }

  // Validate ALL desired terms in one query — must be real, active contexts.
  if (desiredIds.length > 0) {
    const { data: terms, error: termsErr } = await supabase
      .from("taxonomy_terms")
      .select("id, slug, term_type, is_active, is_generic_fallback")
      .in("id", desiredIds);
    if (termsErr) {
      logServerError("setTalentProfileContexts.terms", termsErr);
      return {
        ok: false,
        error: "Couldn't validate the selected contexts. Try again.",
      };
    }
    const byId = new Map((terms ?? []).map((t) => [t.id, t]));
    const invalid: string[] = [];
    for (const id of desiredIds) {
      const t = byId.get(id);
      if (
        !t ||
        t.term_type !== "context" ||
        !t.is_active ||
        t.is_generic_fallback
      ) {
        invalid.push(t?.slug ?? id);
      }
    }
    if (invalid.length > 0) {
      void improntaLog("admin_talent_contexts.warn", {
        message: `${LOG} FAIL invalid-terms talent=${tpid} invalid=${invalid.join(",")}`,
      });
      return {
        ok: false,
        error:
          "Some selected contexts are invalid (not a real context, inactive, or a placeholder).",
      };
    }
    void improntaLog("admin_talent_contexts.info", {
      message: `${LOG} validated terms=${desiredIds.length}`,
    });
  }

  // Current context rows.
  const { data: currentRows, error: curErr } = await supabase
    .from("talent_profile_taxonomy")
    .select("taxonomy_term_id")
    .eq("talent_profile_id", tpid)
    .eq("relationship_type", "context");
  if (curErr) {
    logServerError("setTalentProfileContexts.current", curErr);
    return {
      ok: false,
      error: "Couldn't read the current contexts. No changes were saved.",
    };
  }
  const currentIds = new Set(
    (currentRows ?? []).map((r) => r.taxonomy_term_id),
  );
  const desiredSet = new Set(desiredIds);
  const toDelete = [...currentIds].filter((id) => !desiredSet.has(id));
  const toInsert = desiredIds.filter((id) => !currentIds.has(id));
  void improntaLog("admin_talent_contexts.info", {
    message: `${LOG} diff talent=${tpid} current=${currentIds.size} ` +
      `toInsert=${toInsert.length} toDelete=${toDelete.length}`,
  });

  const friendlyDbError = (
    err: { code?: string; message?: string } | null,
  ): string => {
    const msg = err?.message ?? "";
    if (err?.code === "23505") return "That context is already on this profile.";
    return `Database rejected the context change${
      msg ? `: ${msg.slice(0, 160)}` : "."
    }`;
  };

  if (toDelete.length > 0) {
    const { error: delErr } = await supabase
      .from("talent_profile_taxonomy")
      .delete()
      .eq("talent_profile_id", tpid)
      .eq("relationship_type", "context")
      .in("taxonomy_term_id", toDelete);
    if (delErr) {
      logServerError("setTalentProfileContexts.delete", delErr);
      void improntaLog("admin_talent_contexts.warn", {
        message: `${LOG} FAIL delete talent=${tpid} code=${delErr.code}`,
      });
      return {
        ok: false,
        error: "Couldn't update contexts (remove step). No changes were saved.",
      };
    }
    void improntaLog("admin_talent_contexts.info", { message: `${LOG} deleted=${toDelete.length}` });
  }

  if (toInsert.length > 0) {
    const { error: insErr } = await supabase
      .from("talent_profile_taxonomy")
      .upsert(
        toInsert.map((id) => ({
          talent_profile_id: tpid,
          taxonomy_term_id: id,
          relationship_type: "context",
          is_primary: false,
          display_order: 0,
          tenant_id: tenantId,
        })),
        {
          onConflict: "talent_profile_id,taxonomy_term_id",
          ignoreDuplicates: true,
        },
      );
    if (insErr) {
      logServerError("setTalentProfileContexts.insert", insErr);
      void improntaLog("admin_talent_contexts.warn", {
        message: `${LOG} FAIL insert talent=${tpid} code=${insErr.code}`,
      });
      return { ok: false, error: friendlyDbError(insErr) };
    }
    void improntaLog("admin_talent_contexts.info", {
      message: `${LOG} inserted=${toInsert.length}`,
    });
  }

  if (toDelete.length > 0 || toInsert.length > 0) {
    revalidatePath("/[tenantSlug]/admin/roster", "layout");
  }

  // Return the final resolved list (same shape as getResolvedContexts).
  const finalRes = await getResolvedContexts({ talent_profile_id: tpid });
  if (!finalRes.ok) {
    void improntaLog("admin_talent_contexts.warn", {
      message: `${LOG} FAIL final-fetch talent=${tpid} (writes applied)`,
    });
    return {
      ok: false,
      error:
        "Contexts were saved, but the list couldn't be reloaded — reopen the profile to confirm.",
    };
  }
  void improntaLog("admin_talent_contexts.info", {
    message: `${LOG} done talent=${tpid} final=${finalRes.contexts.length} ms=${
      Date.now() - t0
    }`,
  });
  return { ok: true, contexts: finalRes.contexts };
}
