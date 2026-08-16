"use server";
/* eslint-disable ratchet/no-untenanted-from -- Talent self service actions are owner-gated by requireTalentSelfAction, then roster-checked before tenant-scoped writes. Platform taxonomy tables intentionally have no tenant_id. */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireTalentSelfAction } from "@/lib/saas/admin-scope";
import { CLIENT_ERROR, logServerError } from "@/lib/server/safe-error";
import { pgUuidSchema } from "@/lib/site-admin/validators";
import {
  MAX_TOTAL_SKILLS,
  type ResolvedSkill,
} from "./admin-talent-skills.types";
import {
  MAX_CONTEXTS_PER_TALENT,
  type ContextCatalogGroup,
  type ResolvedContext,
} from "./admin-talent-contexts.types";

const SKILL_RELS = ["primary_role", "secondary_role"] as const;

async function requireTalentServiceScope(talentProfileId: string) {
  const auth = await requireTalentSelfAction(talentProfileId);
  if (!auth.ok) return auth;
  const { data: rosterRow } = await auth.supabase
    .from("agency_talent_roster")
    .select("tenant_id")
    .eq("tenant_id", auth.tenantId)
    .eq("talent_profile_id", talentProfileId)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  if (!rosterRow?.tenant_id) {
    return { ok: false as const, error: "Talent is not on any active roster." };
  }
  return { ...auth, tenantId: rosterRow.tenant_id };
}

function revalidateTalent(profileCode: string) {
  revalidatePath("/talent", "layout");
  revalidatePath(`/t/${profileCode}`, "page");
}

export async function getResolvedSkillsAsTalent(input: {
  talent_profile_id: string;
}): Promise<{ ok: true; skills: ResolvedSkill[] } | { ok: false; error: string }> {
  const auth = await requireTalentServiceScope(input.talent_profile_id);
  if (!auth.ok) return auth;
  // NOTE (skills are PROFILE-scoped, not tenant-scoped): the PK of
  // `talent_profile_taxonomy` is (talent_profile_id, taxonomy_term_id) — there is
  // exactly ONE row per skill per profile, shared by every roster the talent is
  // on. `tenant_id` is provenance ("who first added it"), never an isolation key,
  // and RLS here gates on roster membership / profile ownership without ever
  // referencing it. Filtering rows by it therefore adds no isolation and only
  // produces FALSE NEGATIVES: rows written by another roster (or legacy rows with
  // a NULL tenant_id) silently vanish from reads and are silently skipped by
  // writes. That is the "I save it and after refresh nothing changed" bug.
  const { data, error } = await auth.supabase
    .from("talent_skills_resolved")
    .select("*")
    .eq("talent_profile_id", input.talent_profile_id)
    .order("relationship_type", { ascending: true })
    .order("display_order", { ascending: true });
  if (error) {
    logServerError("getResolvedSkillsAsTalent", error);
    return { ok: false, error: CLIENT_ERROR.generic };
  }
  return { ok: true, skills: (data ?? []) as ResolvedSkill[] };
}

export async function getAspirationsAsTalent(input: {
  talent_profile_id: string;
}): Promise<
  | { ok: true; aspirations: Array<{ term_id: string; slug: string; name_en: string; parent_name: string | null }> }
  | { ok: false; error: string }
> {
  const auth = await requireTalentServiceScope(input.talent_profile_id);
  if (!auth.ok) return auth;
  const { data, error } = await auth.supabase
    .from("talent_profile_taxonomy")
    .select("taxonomy_term_id, taxonomy_terms!inner ( slug, name_i18n, parent_id )")
    .eq("tenant_id", auth.tenantId)
    .eq("talent_profile_id", input.talent_profile_id)
    .eq("relationship_type", "aspiration");
  if (error) {
    logServerError("getAspirationsAsTalent", error);
    return { ok: false, error: CLIENT_ERROR.generic };
  }
  return {
    ok: true,
    // name_en folded into name_i18n {en,es} (WS4); flatten back for the picker DTO.
    aspirations: (data ?? []).map((row) => {
      const t = row.taxonomy_terms as unknown as {
        slug: string;
        name_i18n: Record<string, string | null> | null;
      };
      return {
        term_id: row.taxonomy_term_id,
        slug: t.slug,
        name_en: t.name_i18n?.en ?? "",
        parent_name: null,
      };
    }),
  };
}

const setSkillsSchema = z.object({
  talent_profile_id: pgUuidSchema(),
  skills: z.array(z.object({
    taxonomy_term_id: pgUuidSchema(),
    role: z.enum(["primary", "secondary"]),
  })).max(MAX_TOTAL_SKILLS),
});

export async function setTalentProfileSkillsAsTalent(
  input: z.input<typeof setSkillsSchema>,
): Promise<{ ok: true; skills: ResolvedSkill[] } | { ok: false; error: string }> {
  const parsed = setSkillsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid request." };
  const tpid = parsed.data.talent_profile_id;
  const auth = await requireTalentServiceScope(tpid);
  if (!auth.ok) return auth;
  const desiredByTerm = new Map<string, "primary" | "secondary">();
  for (const s of parsed.data.skills) desiredByTerm.set(s.taxonomy_term_id, s.role);
  const desiredIds = [...desiredByTerm.keys()];

  // Read the current rows BEFORE validating: the editor resubmits the whole
  // membership set on every change, so persisted terms must be exempt from the
  // "new pick" rules below. See the grandfathering note in
  // admin-talent-skills.ts — the same defect locked 19 profiles out of every
  // skill edit on the admin path.
  const { data: currentRows, error: currentError } = await auth.supabase
    .from("talent_profile_taxonomy")
    .select("taxonomy_term_id, relationship_type, proficiency_level, years_experience, display_order, is_primary")
    .eq("talent_profile_id", tpid)
    .in("relationship_type", SKILL_RELS as unknown as string[]);
  if (currentError) {
    logServerError("setTalentProfileSkillsAsTalent.current", currentError);
    return { ok: false, error: "Couldn't read the current services." };
  }

  const current = currentRows ?? [];
  const currentByTerm = new Map(current.map((r) => [r.taxonomy_term_id, r]));

  if (desiredIds.length > 0) {
    const { data: terms, error } = await auth.supabase
      .from("taxonomy_terms")
      .select("id, slug, term_type, is_active, is_generic_fallback")
      .in("id", desiredIds);
    if (error) return { ok: false, error: "Couldn't validate selected services." };
    const byId = new Map((terms ?? []).map((t) => [t.id, t]));
    for (const id of desiredIds) {
      const t = byId.get(id);
      if (!t || t.term_type !== "talent_type") {
        return { ok: false, error: "Some selected services are no longer available." };
      }
      // Already on the profile → keep it, whatever the catalog says today.
      if (currentByTerm.has(id)) continue;
      if (!t.is_active || t.is_generic_fallback) {
        return { ok: false, error: "Some selected services are no longer available." };
      }
    }
  }
  const relOf = (role: "primary" | "secondary") => role === "primary" ? "primary_role" : "secondary_role";
  const primaryIds = desiredIds.filter((id) => desiredByTerm.get(id) === "primary");
  if (primaryIds.length > 1) {
    const currentPrimaryId = current.find((r) => r.relationship_type === "primary_role")?.taxonomy_term_id;
    const keepPrimary = currentPrimaryId && desiredByTerm.get(currentPrimaryId) === "primary" ? currentPrimaryId : primaryIds[0]!;
    for (const id of primaryIds) if (id !== keepPrimary) desiredByTerm.set(id, "secondary");
  }

  const toDelete = current.filter((r) => !desiredByTerm.has(r.taxonomy_term_id));
  const toInsert = desiredIds.filter((id) => !currentByTerm.has(id));
  const toUpdate = desiredIds
    .map((id) => ({ id, row: currentByTerm.get(id), role: desiredByTerm.get(id)! }))
    .filter((x) => x.row && x.row.relationship_type !== relOf(x.role));

  if (toDelete.length > 0) {
    const { error } = await auth.supabase
      .from("talent_profile_taxonomy")
      .delete()
      .eq("talent_profile_id", tpid)
      .in("taxonomy_term_id", toDelete.map((r) => r.taxonomy_term_id))
      .in("relationship_type", SKILL_RELS as unknown as string[]);
    if (error) return { ok: false, error: "Couldn't remove services." };
  }

  if (toInsert.length > 0) {
    const keptMaxOrder = (rel: string) =>
      current
        .filter((r) => r.relationship_type === rel && desiredByTerm.has(r.taxonomy_term_id))
        .reduce((m, r) => Math.max(m, r.display_order ?? 0), 0);
    const nextOrder = { primary_role: keptMaxOrder("primary_role"), secondary_role: keptMaxOrder("secondary_role") };
    const rows = toInsert.map((id) => {
      const role = desiredByTerm.get(id)!;
      const rel = relOf(role);
      nextOrder[rel] += 10;
      return {
        tenant_id: auth.tenantId,
        talent_profile_id: tpid,
        taxonomy_term_id: id,
        relationship_type: rel,
        proficiency_level: null,
        years_experience: null,
        display_order: nextOrder[rel],
        is_primary: role === "primary",
      };
    });
    const { error } = await auth.supabase
      .from("talent_profile_taxonomy")
      .upsert(rows, { onConflict: "talent_profile_id,taxonomy_term_id", ignoreDuplicates: true });
    if (error) {
      logServerError("setTalentProfileSkillsAsTalent.insert", error);
      return { ok: false, error: error.message || "Couldn't add services." };
    }
  }

  for (const u of toUpdate) {
    const { error } = await auth.supabase
      .from("talent_profile_taxonomy")
      .update({ relationship_type: relOf(u.role), is_primary: u.role === "primary" })
      .eq("talent_profile_id", tpid)
      .eq("taxonomy_term_id", u.id);
    if (error) return { ok: false, error: "Couldn't update services." };
  }

  revalidateTalent(auth.profileCode);
  return getResolvedSkillsAsTalent({ talent_profile_id: tpid });
}

const updateSkillSchema = z.object({
  talent_profile_id: pgUuidSchema(),
  talent_type_term_id: pgUuidSchema(),
  proficiency_level: z.enum(["beginner", "intermediate", "advanced", "expert", "master"]).nullable().optional(),
  years_experience: z.number().min(0).max(80).nullable().optional(),
});

export async function updateSkillAsTalent(input: z.input<typeof updateSkillSchema>) {
  const parsed = updateSkillSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid request." };
  const auth = await requireTalentServiceScope(parsed.data.talent_profile_id);
  if (!auth.ok) return auth;
  const updates: Record<string, unknown> = {};
  if (parsed.data.proficiency_level !== undefined) updates.proficiency_level = parsed.data.proficiency_level;
  if (parsed.data.years_experience !== undefined) updates.years_experience = parsed.data.years_experience;
  // `.select()` so a predicate that matches NOTHING is reported instead of
  // returning ok:true. A no-match UPDATE is not an error in Postgres, so the old
  // code told the editor "saved" while writing nothing — the level/years the
  // operator set reappeared blank on the next refresh, with no error anywhere.
  const { data: updated, error } = await auth.supabase
    .from("talent_profile_taxonomy")
    .update(updates)
    .eq("talent_profile_id", parsed.data.talent_profile_id)
    .eq("taxonomy_term_id", parsed.data.talent_type_term_id)
    .in("relationship_type", SKILL_RELS as unknown as string[])
    .select("taxonomy_term_id");
  if (error) return { ok: false as const, error: CLIENT_ERROR.generic };
  if (!updated || updated.length === 0) {
    return { ok: false as const, error: "That service is no longer on this profile — reload and try again." };
  }
  revalidateTalent(auth.profileCode);
  return { ok: true as const };
}

export async function setFeaturedSkillAsTalent(input: {
  talent_profile_id: string;
  talent_type_term_id: string;
}) {
  const auth = await requireTalentServiceScope(input.talent_profile_id);
  if (!auth.ok) return auth;
  const { data: rows, error: readError } = await auth.supabase
    .from("talent_profile_taxonomy")
    .select("taxonomy_term_id")
    .eq("talent_profile_id", input.talent_profile_id)
    .in("relationship_type", SKILL_RELS as unknown as string[])
    .order("display_order", { ascending: true });
  if (readError || !rows?.some((r) => r.taxonomy_term_id === input.talent_type_term_id)) {
    return { ok: false as const, error: "Service not found on this profile." };
  }
  const ordered = [input.talent_type_term_id, ...rows.map((r) => r.taxonomy_term_id).filter((id) => id !== input.talent_type_term_id)];
  for (let index = 0; index < ordered.length; index += 1) {
    const { error } = await auth.supabase
      .from("talent_profile_taxonomy")
      .update({ display_order: index === 0 ? 1 : (index + 1) * 10 })
      .eq("talent_profile_id", input.talent_profile_id)
      .eq("taxonomy_term_id", ordered[index]);
    if (error) return { ok: false as const, error: CLIENT_ERROR.generic };
  }
  revalidateTalent(auth.profileCode);
  return { ok: true as const };
}

export async function verifySkillAsTalent() {
  return { ok: false as const, error: "Only workspace admins can verify services." };
}

export async function unverifySkillAsTalent() {
  return { ok: false as const, error: "Only workspace admins can unverify services." };
}

export async function getEnabledParentCategoriesForPickerAsTalent(input: { talent_profile_id?: string } = {}) {
  if (!input.talent_profile_id) return { ok: false as const, error: "Missing profile." };
  const auth = await requireTalentServiceScope(input.talent_profile_id);
  if (!auth.ok) return auth;
  // name_en folded into name_i18n {en,es} (WS4); flatten back for the picker DTO.
  const { data: terms } = await auth.supabase
    .from("taxonomy_terms")
    .select("id, slug, name_i18n")
    .eq("term_type", "parent_category")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });
  const { data: settings } = await auth.supabase
    .from("agency_taxonomy_settings")
    .select("taxonomy_term_id, is_enabled")
    .eq("tenant_id", auth.tenantId);
  const settingsByTermId = new Map((settings ?? []).map((s) => [s.taxonomy_term_id, s] as const));
  return {
    ok: true as const,
    parents: (terms ?? [])
      .filter((t) => settingsByTermId.get(t.id)?.is_enabled !== false)
      .map((t) => ({
        id: t.id,
        slug: t.slug,
        name_en: (t.name_i18n as Record<string, string | null> | null)?.en ?? "",
      })),
  };
}

export async function getTalentTypesUnderParentAsTalent(input: {
  talent_profile_id?: string;
  parent_category_id: string;
  query?: string;
}) {
  if (!input.talent_profile_id) return { ok: false as const, error: "Missing profile." };
  const auth = await requireTalentServiceScope(input.talent_profile_id);
  if (!auth.ok) return auth;
  // name_en/name_es folded into name_i18n {en,es} (WS4); flatten for picker DTO.
  const { data: groups } = await auth.supabase
    .from("taxonomy_terms")
    .select("id, name_i18n")
    .eq("parent_id", input.parent_category_id)
    .eq("term_type", "category_group")
    .eq("is_active", true);
  const groupIds = (groups ?? []).map((g) => g.id);
  const groupNameById = new Map(
    (groups ?? []).map(
      (g) => [g.id, (g.name_i18n as Record<string, string | null> | null)?.en ?? ""] as const,
    ),
  );
  if (groupIds.length === 0) return { ok: true as const, types: [] };
  let query = auth.supabase
    .from("taxonomy_terms")
    .select("id, slug, name_i18n, parent_id")
    .in("parent_id", groupIds)
    .eq("term_type", "talent_type")
    .eq("is_active", true)
    .eq("is_generic_fallback", false)
    .order("name_i18n->>en", { ascending: true });
  if (input.query) query = query.ilike("name_i18n->>en", `%${input.query}%`);
  const { data, error } = await query;
  if (error) return { ok: false as const, error: CLIENT_ERROR.generic };
  // Tenant taxonomy overlay: a leaf the agency disabled in
  // `agency_taxonomy_settings` must not be offered as a selectable type.
  // Mirrors `getEnabledParentCategoriesForPickerAsTalent` above, which already
  // applies this overlay to the parent level. Also honours a disabled
  // category_group so a leaf can't survive its parent being switched off.
  // Absent row = enabled (only an explicit `is_enabled === false` hides).
  const { data: typeSettings } = await auth.supabase
    .from("agency_taxonomy_settings")
    .select("taxonomy_term_id, is_enabled")
    .eq("tenant_id", auth.tenantId);
  const disabledTermIds = new Set(
    (typeSettings ?? []).filter((s) => s.is_enabled === false).map((s) => s.taxonomy_term_id),
  );
  return {
    ok: true as const,
    types: (data ?? [])
      .filter((t) => !disabledTermIds.has(t.id))
      .filter((t) => !(t.parent_id && disabledTermIds.has(t.parent_id)))
      .map((t) => {
      const nameMap = t.name_i18n as Record<string, string | null> | null;
      return {
        id: t.id,
        slug: t.slug,
        name_en: nameMap?.en ?? "",
        name_es: nameMap?.es ?? null,
        category_group_name: t.parent_id ? groupNameById.get(t.parent_id) ?? null : null,
      };
    }),
  };
}

const aspirationSchema = z.object({
  talent_profile_id: pgUuidSchema(),
  taxonomy_term_id: pgUuidSchema(),
});

export async function addAspirationAsTalent(input: z.input<typeof aspirationSchema>) {
  const parsed = aspirationSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid request." };
  const auth = await requireTalentServiceScope(parsed.data.talent_profile_id);
  if (!auth.ok) return auth;
  const { error } = await auth.supabase.from("talent_profile_taxonomy").insert({
    tenant_id: auth.tenantId,
    talent_profile_id: parsed.data.talent_profile_id,
    taxonomy_term_id: parsed.data.taxonomy_term_id,
    relationship_type: "aspiration",
    is_primary: false,
  });
  if (error) return { ok: false as const, error: error.code === "23505" ? "Already on your interests." : CLIENT_ERROR.generic };
  revalidateTalent(auth.profileCode);
  return { ok: true as const };
}

export async function removeAspirationAsTalent(input: z.input<typeof aspirationSchema>) {
  const parsed = aspirationSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid request." };
  const auth = await requireTalentServiceScope(parsed.data.talent_profile_id);
  if (!auth.ok) return auth;
  const { error } = await auth.supabase
    .from("talent_profile_taxonomy")
    .delete()
    .eq("tenant_id", auth.tenantId)
    .eq("talent_profile_id", parsed.data.talent_profile_id)
    .eq("taxonomy_term_id", parsed.data.taxonomy_term_id)
    .eq("relationship_type", "aspiration");
  if (error) return { ok: false as const, error: CLIENT_ERROR.generic };
  revalidateTalent(auth.profileCode);
  return { ok: true as const };
}

const requestTermSchema = z.object({
  parent_category_id: pgUuidSchema().nullable().optional(),
  proposed_name: z.string().min(2).max(120),
  context_note: z.string().max(500).nullable().optional(),
  talent_profile_id: pgUuidSchema().nullable().optional(),
  source: z.enum(["skill_picker", "registration", "inquiry_form", "admin_settings"]).default("skill_picker"),
});

export async function requestNewTaxonomyTermAsTalent(input: z.input<typeof requestTermSchema>) {
  const parsed = requestTermSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid request." };
  if (!parsed.data.talent_profile_id) return { ok: false as const, error: "Missing profile." };
  const auth = await requireTalentServiceScope(parsed.data.talent_profile_id);
  if (!auth.ok) return auth;
  const { data, error } = await auth.supabase
    .from("taxonomy_term_requests")
    .insert({
      requested_by_user_id: auth.user.id,
      requested_by_tenant_id: auth.tenantId,
      talent_profile_id: parsed.data.talent_profile_id,
      parent_category_id: parsed.data.parent_category_id ?? null,
      proposed_name: parsed.data.proposed_name,
      context_note: parsed.data.context_note ?? null,
      source: parsed.data.source,
    })
    .select("id")
    .single();
  if (error || !data) return { ok: false as const, error: CLIENT_ERROR.generic };
  return { ok: true as const, id: data.id };
}

export async function getResolvedContextsAsTalent(input: {
  talent_profile_id: string;
}): Promise<{ ok: true; contexts: ResolvedContext[] } | { ok: false; error: string }> {
  const auth = await requireTalentServiceScope(input.talent_profile_id);
  if (!auth.ok) return auth;
  const { data: rows, error } = await auth.supabase
    .from("talent_profile_taxonomy")
    .select("taxonomy_term_id, taxonomy_terms!inner(id, slug, name_i18n, term_type, parent_id, sort_order)")
    .eq("tenant_id", auth.tenantId)
    .eq("talent_profile_id", input.talent_profile_id)
    .eq("relationship_type", "context");
  if (error) return { ok: false, error: CLIENT_ERROR.generic };
  // name_en/name_es folded into name_i18n {en,es} (WS4); flatten for the DTO.
  type Joined = {
    taxonomy_term_id: string;
    taxonomy_terms: {
      id: string;
      slug: string;
      name_i18n: Record<string, string | null> | null;
      term_type: string;
      parent_id: string | null;
      sort_order: number | null;
    } | null;
  };
  const ctxRows = ((rows ?? []) as unknown as Joined[]).filter((r) => r.taxonomy_terms?.term_type === "context");
  const parentIds = [...new Set(ctxRows.map((r) => r.taxonomy_terms!.parent_id).filter((x): x is string => !!x))];
  const groupById = new Map<string, { slug: string; name_en: string; sort_order: number }>();
  if (parentIds.length > 0) {
    const { data: groups } = await auth.supabase
      .from("taxonomy_terms")
      .select("id, slug, name_i18n, sort_order")
      .in("id", parentIds)
      .eq("term_type", "context_group");
    for (const group of groups ?? []) {
      groupById.set(group.id, {
        slug: group.slug,
        name_en: (group.name_i18n as Record<string, string | null> | null)?.en ?? "",
        sort_order: group.sort_order ?? 999,
      });
    }
  }
  const contexts = ctxRows.map((row) => {
    const term = row.taxonomy_terms!;
    const termNameMap = term.name_i18n as Record<string, string | null> | null;
    const group = term.parent_id ? groupById.get(term.parent_id) : undefined;
    return {
      context_term_id: term.id,
      context_slug: term.slug,
      context_name_en: termNameMap?.en ?? "",
      context_name_es: termNameMap?.es ?? null,
      group_id: term.parent_id,
      group_slug: group?.slug ?? null,
      group_name_en: group?.name_en ?? null,
      group_sort_order: group?.sort_order ?? 999,
      sort_order: term.sort_order ?? 999,
    };
  });
  contexts.sort((a, b) => a.group_sort_order - b.group_sort_order || (a.group_name_en ?? "").localeCompare(b.group_name_en ?? "") || a.sort_order - b.sort_order || a.context_name_en.localeCompare(b.context_name_en));
  return { ok: true, contexts };
}

export async function getContextCatalogAsTalent(input: { talent_profile_id?: string } = {}) {
  if (!input.talent_profile_id) return { ok: false as const, error: "Missing profile." };
  const auth = await requireTalentServiceScope(input.talent_profile_id);
  if (!auth.ok) return auth;
  const [{ data: terms, error }, { data: groups }, { data: settings }] = await Promise.all([
    // name_en/name_es folded into name_i18n {en,es} (WS4); flattened below.
    auth.supabase.from("taxonomy_terms").select("id, slug, name_i18n, parent_id, sort_order").eq("term_type", "context").eq("is_active", true).eq("is_generic_fallback", false).order("sort_order", { ascending: true }),
    auth.supabase.from("taxonomy_terms").select("id, slug, name_i18n, sort_order").eq("term_type", "context_group").order("sort_order", { ascending: true }),
    auth.supabase.from("agency_taxonomy_settings").select("taxonomy_term_id, is_enabled").eq("tenant_id", auth.tenantId),
  ]);
  if (error) return { ok: false as const, error: CLIENT_ERROR.generic };
  const disabled = new Set((settings ?? []).filter((s) => s.is_enabled === false).map((s) => s.taxonomy_term_id));
  const groupMeta = new Map((groups ?? []).map((g) => [g.id, { slug: g.slug, name_en: (g.name_i18n as Record<string, string | null> | null)?.en ?? "", sort_order: g.sort_order ?? 999 }]));
  const byGroup = new Map<string, ContextCatalogGroup>();
  const ungrouped = "__ungrouped__";
  for (const term of terms ?? []) {
    if (disabled.has(term.id)) continue;
    const groupId = term.parent_id ?? ungrouped;
    if (!byGroup.has(groupId)) {
      const meta = term.parent_id ? groupMeta.get(term.parent_id) : undefined;
      byGroup.set(groupId, { group_id: groupId, group_slug: meta?.slug ?? "other", group_name_en: meta?.name_en ?? "Other Contexts", sort_order: meta?.sort_order ?? 999, contexts: [] });
    }
    const termNameMap = term.name_i18n as Record<string, string | null> | null;
    byGroup.get(groupId)!.contexts.push({ id: term.id, slug: term.slug, name_en: termNameMap?.en ?? "", name_es: termNameMap?.es ?? null, sort_order: term.sort_order ?? 999 });
  }
  const result = [...byGroup.values()].sort((a, b) => a.sort_order - b.sort_order || a.group_name_en.localeCompare(b.group_name_en));
  for (const group of result) group.contexts.sort((a, b) => a.sort_order - b.sort_order || a.name_en.localeCompare(b.name_en));
  return { ok: true as const, groups: result };
}

const setContextsSchema = z.object({
  talent_profile_id: pgUuidSchema(),
  context_term_ids: z.array(pgUuidSchema()).max(MAX_CONTEXTS_PER_TALENT),
});

export async function setTalentProfileContextsAsTalent(
  input: z.input<typeof setContextsSchema>,
): Promise<{ ok: true; contexts: ResolvedContext[] } | { ok: false; error: string }> {
  const parsed = setContextsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid request." };
  const auth = await requireTalentServiceScope(parsed.data.talent_profile_id);
  if (!auth.ok) return auth;
  const desiredIds = [...new Set(parsed.data.context_term_ids)];
  if (desiredIds.length > 0) {
    const { data: terms, error } = await auth.supabase.from("taxonomy_terms").select("id, term_type, is_active, is_generic_fallback").in("id", desiredIds);
    if (error) return { ok: false, error: CLIENT_ERROR.generic };
    const byId = new Map((terms ?? []).map((term) => [term.id, term]));
    for (const id of desiredIds) {
      const term = byId.get(id);
      if (!term || term.term_type !== "context" || !term.is_active || term.is_generic_fallback) return { ok: false, error: "Some selected contexts are invalid." };
    }
  }
  const { data: currentRows, error: currentError } = await auth.supabase
    .from("talent_profile_taxonomy")
    .select("taxonomy_term_id")
    .eq("tenant_id", auth.tenantId)
    .eq("talent_profile_id", parsed.data.talent_profile_id)
    .eq("relationship_type", "context");
  if (currentError) return { ok: false, error: CLIENT_ERROR.generic };
  const currentIds = new Set((currentRows ?? []).map((row) => row.taxonomy_term_id));
  const desiredSet = new Set(desiredIds);
  const toDelete = [...currentIds].filter((id) => !desiredSet.has(id));
  const toInsert = desiredIds.filter((id) => !currentIds.has(id));
  if (toDelete.length > 0) {
    const { error } = await auth.supabase
      .from("talent_profile_taxonomy")
      .delete()
      .eq("tenant_id", auth.tenantId)
      .eq("talent_profile_id", parsed.data.talent_profile_id)
      .eq("relationship_type", "context")
      .in("taxonomy_term_id", toDelete);
    if (error) return { ok: false, error: CLIENT_ERROR.generic };
  }
  if (toInsert.length > 0) {
    const { error } = await auth.supabase.from("talent_profile_taxonomy").upsert(
      toInsert.map((id) => ({ tenant_id: auth.tenantId, talent_profile_id: parsed.data.talent_profile_id, taxonomy_term_id: id, relationship_type: "context", is_primary: false, display_order: 0 })),
      { onConflict: "talent_profile_id,taxonomy_term_id", ignoreDuplicates: true },
    );
    if (error) return { ok: false, error: CLIENT_ERROR.generic };
  }
  revalidateTalent(auth.profileCode);
  return getResolvedContextsAsTalent({ talent_profile_id: parsed.data.talent_profile_id });
}
