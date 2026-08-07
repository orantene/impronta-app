"use server";
import { improntaLog } from "@/lib/server/structured-log";

// ============================================================================
// admin-talent-skills.ts — Multi-skill talent management.
//
// Reads from talent_skills_resolved view (created by
// 20260907200000_multi_skill_talent_v1.sql).
//
// Caps enforced at DB layer via enforce_talent_skill_caps trigger:
//   - ≤9 total skills (primary + secondary)
//   - All primary_role rows share one parent_category
//   - secondary_role rows from ≤2 distinct parent_categories
//
// Server actions also do business validation (filter generic-fallback
// terms, check tenant ownership, etc.) before hitting the trigger.
// ============================================================================

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireWorkspaceStaffAction } from "@/lib/saas/admin-scope";
import { CLIENT_ERROR, logServerError } from "@/lib/server/safe-error";
import { pgUuidSchema } from "@/lib/site-admin/validators";
import {
  MAX_TOTAL_SKILLS,
  type ResolvedSkill,
} from "./admin-talent-skills.types";

// Types/constants live in admin-talent-skills.types.ts because Next.js
// disallows non-async exports from "use server" files.

// ─── Read: get a talent's resolved skills ──────────────────────────────────

export async function getResolvedSkills(input: {
  talent_profile_id: string;
}): Promise<
  | { ok: true; skills: ResolvedSkill[] }
  | { ok: false; error: string }
> {
  const auth = await requireWorkspaceStaffAction();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, tenantId } = auth;

  const [{ data: rosterRow }, { data, error }] = await Promise.all([
    supabase
      .from("agency_talent_roster")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("talent_profile_id", input.talent_profile_id)
      .maybeSingle(),
    supabase
      .from("talent_skills_resolved")
      .select("*")
      .eq("talent_profile_id", input.talent_profile_id)
      .order("relationship_type", { ascending: true })
      .order("display_order", { ascending: true }),
  ]);

  if (!rosterRow) {
    return { ok: false, error: "Talent is not on this tenant's roster." };
  }
  if (error) {
    logServerError("getResolvedSkills", error);
    return { ok: false, error: CLIENT_ERROR.generic };
  }

  return { ok: true, skills: (data ?? []) as ResolvedSkill[] };
}

// ─── Add a skill (primary or secondary) ────────────────────────────────────

const addSkillSchema = z.object({
  talent_profile_id: pgUuidSchema(),
  talent_type_term_id: pgUuidSchema(),
  role: z.enum(["primary", "secondary"]),
  proficiency_level: z
    .enum(["beginner", "intermediate", "advanced", "expert", "master"])
    .optional(),
  years_experience: z.number().min(0).max(80).nullable().optional(),
});

export async function addSkill(
  input: z.input<typeof addSkillSchema>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await requireWorkspaceStaffAction();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, tenantId } = auth;

  const parsed = addSkillSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid request.",
    };
  }
  const v = parsed.data;

  // Verify roster access.
  const { data: rosterRow } = await supabase
    .from("agency_talent_roster")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("talent_profile_id", v.talent_profile_id)
    .maybeSingle();
  if (!rosterRow) {
    return { ok: false, error: "Talent is not on this tenant's roster." };
  }

  // Verify the term is a real talent_type (not a parent_category, context,
  // etc.) and not a generic-fallback.
  const { data: term } = await supabase
    .from("taxonomy_terms")
    .select("id, slug, term_type, level, is_active, is_generic_fallback")
    .eq("id", v.talent_type_term_id)
    .maybeSingle();
  if (!term) return { ok: false, error: "Skill not found." };
  if (term.term_type !== "talent_type") {
    return { ok: false, error: "Only talent_type terms can be added as skills." };
  }
  if (!term.is_active) {
    return { ok: false, error: "This skill is no longer available." };
  }
  if (term.is_generic_fallback) {
    return {
      ok: false,
      error: "Pick a specific role — generic fallback types can't be selected.",
    };
  }

  // Get next display_order (append to end of role group).
  const { data: existing } = await supabase
    .from("talent_profile_taxonomy")
    .select("display_order")
    .eq("talent_profile_id", v.talent_profile_id)
    .eq(
      "relationship_type",
      v.role === "primary" ? "primary_role" : "secondary_role",
    )
    .order("display_order", { ascending: false })
    .limit(1);
  const nextOrder = (existing?.[0]?.display_order ?? 0) + 10;

  // Insert. The DB trigger will reject if any cap is violated.
  const { error } = await supabase.from("talent_profile_taxonomy").insert({
    talent_profile_id: v.talent_profile_id,
    taxonomy_term_id: v.talent_type_term_id,
    relationship_type:
      v.role === "primary" ? "primary_role" : "secondary_role",
    proficiency_level: v.proficiency_level ?? null,
    years_experience: v.years_experience ?? null,
    display_order: nextOrder,
    tenant_id: tenantId,
    is_primary: v.role === "primary",
  });

  if (error) {
    // Bubble up the trigger error message verbatim — it's user-friendly.
    if (error.message?.includes("9 skills") || error.message?.includes("primary skills") || error.message?.includes("secondary categories")) {
      return { ok: false, error: error.message };
    }
    if (error.code === "23505") {
      // PK is (talent_profile_id, taxonomy_term_id): a term can only be
      // linked once. A 23505 means it's ALREADY on this talent's
      // profile — the caller's intent ("have this skill") is satisfied.
      // Treat as an idempotent no-op instead of a hard red error that
      // aborts a normal multi-select add (the Tina/Hosts & Promo bug).
      return { ok: true };
    }
    logServerError("addSkill", error);
    return { ok: false, error: CLIENT_ERROR.generic };
  }

  revalidatePath("/[tenantSlug]/admin/roster", "layout");
  return { ok: true };
}

const addSkillsSchema = z.object({
  talent_profile_id: pgUuidSchema(),
  talent_type_term_ids: z.array(pgUuidSchema()).min(1).max(MAX_TOTAL_SKILLS),
  role: z.enum(["primary", "secondary"]),
  proficiency_level: z
    .enum(["beginner", "intermediate", "advanced", "expert", "master"])
    .optional(),
  years_experience: z.number().min(0).max(80).nullable().optional(),
});

export async function addSkills(
  input: z.input<typeof addSkillsSchema>,
): Promise<{ ok: true; insertedCount: number } | { ok: false; error: string }> {
  const auth = await requireWorkspaceStaffAction();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, tenantId } = auth;

  const parsed = addSkillsSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid request.",
    };
  }
  const v = parsed.data;
  const termIds = [...new Set(v.talent_type_term_ids)];

  const { data: rosterRow } = await supabase
    .from("agency_talent_roster")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("talent_profile_id", v.talent_profile_id)
    .maybeSingle();
  if (!rosterRow) {
    return { ok: false, error: "Talent is not on this tenant's roster." };
  }

  const { data: terms, error: termsError } = await supabase
    .from("taxonomy_terms")
    .select("id, slug, term_type, level, is_active, is_generic_fallback")
    .in("id", termIds);
  if (termsError) {
    logServerError("addSkills.terms", termsError);
    return { ok: false, error: CLIENT_ERROR.generic };
  }

  const termsById = new Map((terms ?? []).map((term) => [term.id, term]));
  for (const termId of termIds) {
    const term = termsById.get(termId);
    if (!term) return { ok: false, error: "Skill not found." };
    if (term.term_type !== "talent_type") {
      return { ok: false, error: "Only talent_type terms can be added as skills." };
    }
    if (!term.is_active) {
      return { ok: false, error: "This skill is no longer available." };
    }
    if (term.is_generic_fallback) {
      return {
        ok: false,
        error: "Pick a specific role — generic fallback types can't be selected.",
      };
    }
  }

  const { data: existingRows, error: existingError } = await supabase
    .from("talent_profile_taxonomy")
    .select("taxonomy_term_id")
    .eq("talent_profile_id", v.talent_profile_id)
    .in("taxonomy_term_id", termIds);
  if (existingError) {
    logServerError("addSkills.existing", existingError);
    return { ok: false, error: CLIENT_ERROR.generic };
  }

  const existingIds = new Set((existingRows ?? []).map((row) => row.taxonomy_term_id));
  const idsToInsert = termIds.filter((termId) => !existingIds.has(termId));
  if (idsToInsert.length === 0) return { ok: true, insertedCount: 0 };

  const relationshipType = v.role === "primary" ? "primary_role" : "secondary_role";
  const { data: existingOrder, error: orderError } = await supabase
    .from("talent_profile_taxonomy")
    .select("display_order")
    .eq("talent_profile_id", v.talent_profile_id)
    .eq("relationship_type", relationshipType)
    .order("display_order", { ascending: false })
    .limit(1);
  if (orderError) {
    logServerError("addSkills.order", orderError);
    return { ok: false, error: CLIENT_ERROR.generic };
  }

  const startOrder = (existingOrder?.[0]?.display_order ?? 0) + 10;
  const { error } = await supabase.from("talent_profile_taxonomy").insert(
    idsToInsert.map((termId, index) => ({
      talent_profile_id: v.talent_profile_id,
      taxonomy_term_id: termId,
      relationship_type: relationshipType,
      proficiency_level: v.proficiency_level ?? null,
      years_experience: v.years_experience ?? null,
      display_order: startOrder + index * 10,
      tenant_id: tenantId,
      is_primary: v.role === "primary",
    })),
  );

  if (error) {
    if (error.message?.includes("9 skills") || error.message?.includes("primary skills") || error.message?.includes("secondary categories")) {
      return { ok: false, error: error.message };
    }
    if (error.code === "23505") return { ok: true, insertedCount: 0 };
    logServerError("addSkills", error);
    return { ok: false, error: CLIENT_ERROR.generic };
  }

  revalidatePath("/[tenantSlug]/admin/roster", "layout");
  return { ok: true, insertedCount: idsToInsert.length };
}

// ─── P5: set-style batched skills mutation (setAll) ────────────────────────
// The editor's selected chips are the DESIRED FINAL STATE. One action:
// auth once · roster check once · validate all terms in one query · diff
// current vs desired · delete removed · bulk-insert added · role-change
// update · respect caps · revalidate once · RETURN the final resolved
// list (so the drawer updates from the payload — no reload() cascade).
//
// Caps safety without a DB transaction: total-count cap pre-checked in
// app; deletes run BEFORE inserts so the per-row count trigger never
// transiently overflows; kept rows are left untouched so proficiency /
// years / display_order are preserved; the parent_category sub-caps are
// enforced by the trigger on INSERT — if it rejects, we compensating-
// restore the deleted rows and return the friendly trigger message
// (the caller keeps its local draft).

const setSkillsSchema = z.object({
  talent_profile_id: pgUuidSchema(),
  // 0..MAX desired (taxonomy_term_id, role) pairs. Empty = clear all.
  skills: z
    .array(
      z.object({
        taxonomy_term_id: pgUuidSchema(),
        role: z.enum(["primary", "secondary"]),
      }),
    )
    .max(MAX_TOTAL_SKILLS),
});

const SKILL_RELS = ["primary_role", "secondary_role"] as const;

export async function setTalentProfileSkills(
  input: z.input<typeof setSkillsSchema>,
): Promise<
  | { ok: true; skills: ResolvedSkill[] }
  | { ok: false; error: string }
> {
  const auth = await requireWorkspaceStaffAction();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, tenantId } = auth;

  const parsed = setSkillsSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid request.",
    };
  }
  const tpid = parsed.data.talent_profile_id;
  const LOG = "[setSkills]";
  const t0 = Date.now();

  // Dedupe by term (last role wins) — the desired set is a membership set.
  const desiredByTerm = new Map<string, "primary" | "secondary">();
  for (const s of parsed.data.skills) desiredByTerm.set(s.taxonomy_term_id, s.role);
  const desiredIds = [...desiredByTerm.keys()];
  void improntaLog("admin_talent_skills.info", {
    message: `${LOG} start talent=${tpid} tenant=${tenantId} desired=${desiredIds.length} ` +
      `(primary=${[...desiredByTerm.values()].filter((r) => r === "primary").length})`,
  });
  if (desiredIds.length > MAX_TOTAL_SKILLS) {
    return {
      ok: false,
      error: `Skill cap exceeded — a talent can have at most ${MAX_TOTAL_SKILLS} skills.`,
    };
  }

  // Roster check (once).
  const { data: rosterRow } = await supabase
    .from("agency_talent_roster")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("talent_profile_id", tpid)
    .maybeSingle();
  if (!rosterRow) {
    void improntaLog("admin_talent_skills.warn", {
      message: `${LOG} FAIL roster-miss talent=${tpid}`,
    });
    return {
      ok: false,
      error: "Couldn't save: this profile isn't on your roster.",
    };
  }

  // Validate ALL desired terms in one query.
  if (desiredIds.length > 0) {
    const { data: terms, error: termsErr } = await supabase
      .from("taxonomy_terms")
      .select("id, slug, term_type, is_active, is_generic_fallback")
      .in("id", desiredIds);
    if (termsErr) {
      logServerError("setTalentProfileSkills.terms", termsErr);
      return {
        ok: false,
        error: "Couldn't validate the selected skills. Try again.",
      };
    }
    const byId = new Map((terms ?? []).map((t) => [t.id, t]));
    const invalid: string[] = [];
    for (const id of desiredIds) {
      const t = byId.get(id);
      if (!t || t.term_type !== "talent_type" || !t.is_active || t.is_generic_fallback) {
        invalid.push(t?.slug ?? id);
      }
    }
    if (invalid.length > 0) {
      void improntaLog("admin_talent_skills.warn", {
        message: `${LOG} FAIL invalid-terms talent=${tpid} invalid=${invalid.join(",")}`,
      });
      return {
        ok: false,
        error:
          "Some selected skills are invalid for this profile (not a real skill, inactive, or a generic placeholder).",
      };
    }
    void improntaLog("admin_talent_skills.info", {
      message: `${LOG} validated terms=${desiredIds.length}`,
    });
  }

  // Current skill rows (capture full data for a compensating restore).
  const { data: currentRows, error: curErr } = await supabase
    .from("talent_profile_taxonomy")
    .select(
      "taxonomy_term_id, relationship_type, proficiency_level, years_experience, display_order, is_primary",
    )
    .eq("talent_profile_id", tpid)
    .in("relationship_type", SKILL_RELS as unknown as string[]);
  if (curErr) {
    logServerError("setTalentProfileSkills.current", curErr);
    return {
      ok: false,
      error: "Couldn't read the current skills. No changes were saved.",
    };
  }
  const current = currentRows ?? [];
  const currentByTerm = new Map(current.map((r) => [r.taxonomy_term_id, r]));
  const relOf = (role: "primary" | "secondary") =>
    role === "primary" ? "primary_role" : "secondary_role";

  // ── Schema invariant: AT MOST ONE primary_role per talent
  // (partial unique index ux_talent_profile_taxonomy_one_primary —
  // UNIQUE(talent_profile_id) WHERE relationship_type='primary_role').
  // The editor can hand up several "primary" picks (e.g. multi-add under
  // the primary category). Only one term can be THE primary: keep the
  // existing DB primary if it's still desired, else the first desired
  // primary; demote the rest to secondary. Without this the INSERT hits
  // a 23505 on a constraint the PK onConflict doesn't cover (the P5 QA
  // failure). The cap trigger then governs the secondary parents.
  const desiredPrimaryIds = desiredIds.filter(
    (id) => desiredByTerm.get(id) === "primary",
  );
  if (desiredPrimaryIds.length > 1) {
    const currentPrimaryId = current.find(
      (r) => r.relationship_type === "primary_role",
    )?.taxonomy_term_id;
    const keepPrimary =
      currentPrimaryId && desiredByTerm.get(currentPrimaryId) === "primary"
        ? currentPrimaryId
        : desiredPrimaryIds[0]!;
    for (const id of desiredPrimaryIds) {
      if (id !== keepPrimary) desiredByTerm.set(id, "secondary");
    }
    void improntaLog("admin_talent_skills.info", {
      message: `${LOG} coerced extra-primary→secondary count=${desiredPrimaryIds.length - 1} keep=${keepPrimary}`,
    });
  }

  const toDelete = current.filter((r) => !desiredByTerm.has(r.taxonomy_term_id));
  const toInsert = desiredIds.filter((id) => !currentByTerm.has(id));
  const toUpdate = desiredIds
    .map((id) => ({ id, row: currentByTerm.get(id), role: desiredByTerm.get(id)! }))
    .filter(
      (x) => x.row && x.row.relationship_type !== relOf(x.role),
    );
  void improntaLog("admin_talent_skills.info", {
    message: `${LOG} diff talent=${tpid} current=${current.length} ` +
      `toInsert=${toInsert.length} toDelete=${toDelete.length} ` +
      `toUpdate=${toUpdate.length} kept=${desiredIds.length - toInsert.length}`,
  });

  if (toDelete.length === 0 && toInsert.length === 0 && toUpdate.length === 0) {
    // No-op — return the current resolved list, no writes/revalidate.
    const { data } = await supabase
      .from("talent_skills_resolved")
      .select("*")
      .eq("talent_profile_id", tpid)
      .order("relationship_type", { ascending: true })
      .order("display_order", { ascending: true });
    return { ok: true, skills: (data ?? []) as ResolvedSkill[] };
  }

  // 1. DELETE removed first (count never transiently overflows).
  if (toDelete.length > 0) {
    const { error: delErr } = await supabase
      .from("talent_profile_taxonomy")
      .delete()
      .eq("talent_profile_id", tpid)
      .in("taxonomy_term_id", toDelete.map((r) => r.taxonomy_term_id))
      .in("relationship_type", SKILL_RELS as unknown as string[]);
    if (delErr) {
      logServerError("setTalentProfileSkills.delete", delErr);
      void improntaLog("admin_talent_skills.warn", {
        message: `${LOG} FAIL delete talent=${tpid} code=${delErr.code}`,
      });
      return {
        ok: false,
        error: "Couldn't update skills (remove step). No changes were saved.",
      };
    }
    void improntaLog("admin_talent_skills.info", { message: `${LOG} deleted=${toDelete.length}` });
  }

  // Best-effort compensating restore if a later write fails.
  const restoreDeleted = async () => {
    if (toDelete.length === 0) return;
    await supabase.from("talent_profile_taxonomy").upsert(
      toDelete.map((r) => ({
        talent_profile_id: tpid,
        taxonomy_term_id: r.taxonomy_term_id,
        relationship_type: r.relationship_type,
        proficiency_level: r.proficiency_level,
        years_experience: r.years_experience,
        display_order: r.display_order,
        is_primary: r.is_primary,
        tenant_id: tenantId,
      })),
      { onConflict: "talent_profile_id,taxonomy_term_id", ignoreDuplicates: true },
    );
  };
  // Classify a Supabase write error into a specific, user-safe message.
  const friendlyDbError = (
    err: { code?: string; message?: string } | null,
  ): string => {
    const msg = err?.message ?? "";
    // Cap trigger (ERRCODE 23514) — its RAISE messages are user-friendly.
    if (
      err?.code === "23514" ||
      msg.includes("9 skills") ||
      msg.includes("primary skills") ||
      msg.includes("secondary categories")
    ) {
      return msg || "Skill cap exceeded.";
    }
    if (
      err?.code === "23505" &&
      msg.includes("ux_talent_profile_taxonomy_one_primary")
    ) {
      return "A talent can only have one primary skill — keep a single primary and add the rest as secondary.";
    }
    if (err?.code === "23505") {
      return "That skill is already on this profile.";
    }
    return `Database rejected the skill change${msg ? `: ${msg.slice(0, 160)}` : "."}`;
  };

  // 2. INSERT added (append display_order per role after kept rows).
  if (toInsert.length > 0) {
    const keptMaxOrder = (rel: string) =>
      current
        .filter(
          (r) =>
            r.relationship_type === rel && desiredByTerm.has(r.taxonomy_term_id),
        )
        .reduce((m, r) => Math.max(m, r.display_order ?? 0), 0);
    const nextOrder: Record<string, number> = {
      primary_role: keptMaxOrder("primary_role"),
      secondary_role: keptMaxOrder("secondary_role"),
    };
    const rows = toInsert.map((id) => {
      const role = desiredByTerm.get(id)!;
      const rel = relOf(role);
      nextOrder[rel] += 10;
      return {
        talent_profile_id: tpid,
        taxonomy_term_id: id,
        relationship_type: rel,
        proficiency_level: null,
        years_experience: null,
        display_order: nextOrder[rel],
        tenant_id: tenantId,
        is_primary: role === "primary",
      };
    });
    const { error: insErr } = await supabase
      .from("talent_profile_taxonomy")
      .upsert(rows, {
        onConflict: "talent_profile_id,taxonomy_term_id",
        ignoreDuplicates: true,
      });
    if (insErr) {
      await restoreDeleted();
      // Cap constraint violations (23514) are expected user-input errors surfaced
      // to the UI — skip Sentry noise to match addSkill/addSkills behavior.
      const isCapConstraint =
        insErr.code === "23514" ||
        insErr.message?.includes("9 skills") ||
        insErr.message?.includes("primary skills") ||
        insErr.message?.includes("secondary categories");
      if (!isCapConstraint) {
        logServerError("setTalentProfileSkills.insert", insErr);
      }
      void improntaLog("admin_talent_skills.warn", {
        message: `${LOG} FAIL insert talent=${tpid} code=${insErr.code} restored=${toDelete.length}`,
      });
      return { ok: false, error: friendlyDbError(insErr) };
    }
    void improntaLog("admin_talent_skills.info", { message: `${LOG} inserted=${rows.length}` });
  }

  // 3. Role changes for kept terms (preserve proficiency/years/order).
  for (const u of toUpdate) {
    const rel = relOf(u.role);
    const { error: updErr } = await supabase
      .from("talent_profile_taxonomy")
      .update({ relationship_type: rel, is_primary: u.role === "primary" })
      .eq("talent_profile_id", tpid)
      .eq("taxonomy_term_id", u.id);
    if (updErr) {
      await restoreDeleted();
      logServerError("setTalentProfileSkills.update", updErr);
      void improntaLog("admin_talent_skills.warn", {
        message: `${LOG} FAIL role-update talent=${tpid} code=${updErr.code}`,
      });
      return { ok: false, error: friendlyDbError(updErr) };
    }
  }
  if (toUpdate.length > 0) void improntaLog("admin_talent_skills.info", {
    message: `${LOG} role-updated=${toUpdate.length}`,
  });

  revalidatePath("/[tenantSlug]/admin/roster", "layout");

  // Return the FINAL resolved list (same shape as getResolvedSkills) so
  // the drawer updates from the payload with no extra round trip.
  const { data: finalData, error: finalErr } = await supabase
    .from("talent_skills_resolved")
    .select("*")
    .eq("talent_profile_id", tpid)
    .order("relationship_type", { ascending: true })
    .order("display_order", { ascending: true });
  if (finalErr) {
    logServerError("setTalentProfileSkills.resolved", finalErr);
    void improntaLog("admin_talent_skills.warn", {
      message: `${LOG} FAIL final-fetch talent=${tpid} (writes applied)`,
    });
    // Writes succeeded; only the re-read failed.
    return {
      ok: false,
      error: "Skills were saved, but the list couldn't be reloaded — reopen the profile to confirm.",
    };
  }
  void improntaLog("admin_talent_skills.info", {
    message: `${LOG} done talent=${tpid} final=${(finalData ?? []).length} ms=${Date.now() - t0}`,
  });
  return { ok: true, skills: (finalData ?? []) as ResolvedSkill[] };
}

// ─── Update proficiency / years on an existing skill ───────────────────────

const updateSkillSchema = z.object({
  talent_profile_id: pgUuidSchema(),
  talent_type_term_id: pgUuidSchema(),
  proficiency_level: z
    .enum(["beginner", "intermediate", "advanced", "expert", "master"])
    .nullable()
    .optional(),
  years_experience: z.number().min(0).max(80).nullable().optional(),
});

export async function updateSkill(
  input: z.input<typeof updateSkillSchema>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await requireWorkspaceStaffAction();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, tenantId } = auth;

  const parsed = updateSkillSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid request.",
    };
  }
  const v = parsed.data;

  const { data: rosterRow } = await supabase
    .from("agency_talent_roster")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("talent_profile_id", v.talent_profile_id)
    .maybeSingle();
  if (!rosterRow) {
    return { ok: false, error: "Talent is not on this tenant's roster." };
  }

  const updates: Record<string, unknown> = {};
  if (v.proficiency_level !== undefined) updates.proficiency_level = v.proficiency_level;
  if (v.years_experience !== undefined) updates.years_experience = v.years_experience;

  const { error } = await supabase
    .from("talent_profile_taxonomy")
    .update(updates)
    .eq("talent_profile_id", v.talent_profile_id)
    .eq("taxonomy_term_id", v.talent_type_term_id);

  if (error) {
    logServerError("updateSkill", error);
    return { ok: false, error: CLIENT_ERROR.generic };
  }

  revalidatePath("/[tenantSlug]/admin/roster", "layout");
  return { ok: true };
}

// ─── Remove a skill ────────────────────────────────────────────────────────

export async function removeSkill(input: {
  talent_profile_id: string;
  talent_type_term_id: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await requireWorkspaceStaffAction();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, tenantId } = auth;

  const { data: rosterRow } = await supabase
    .from("agency_talent_roster")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("talent_profile_id", input.talent_profile_id)
    .maybeSingle();
  if (!rosterRow) {
    return { ok: false, error: "Talent is not on this tenant's roster." };
  }

  const { error } = await supabase
    .from("talent_profile_taxonomy")
    .delete()
    .eq("talent_profile_id", input.talent_profile_id)
    .eq("taxonomy_term_id", input.talent_type_term_id)
    .in("relationship_type", ["primary_role", "secondary_role"]);

  if (error) {
    logServerError("removeSkill", error);
    return { ok: false, error: CLIENT_ERROR.generic };
  }

  revalidatePath("/[tenantSlug]/admin/roster", "layout");
  return { ok: true };
}

// ─── Verify a skill (admin/agency action) ──────────────────────────────────

const verifySkillSchema = z.object({
  talent_profile_id: pgUuidSchema(),
  talent_type_term_id: pgUuidSchema(),
  scope: z.enum(["agency", "platform"]).default("agency"),
  note: z.string().max(500).nullable().optional(),
});

export async function verifySkill(
  input: z.input<typeof verifySkillSchema>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await requireWorkspaceStaffAction();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, tenantId, user } = auth;

  const parsed = verifySkillSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid request.",
    };
  }
  const v = parsed.data;

  const { error } = await supabase
    .from("talent_profile_taxonomy")
    .update({
      verified_at: new Date().toISOString(),
      verified_by_user_id: user.id,
      verified_by_tenant_id: v.scope === "agency" ? tenantId : null,
      verification_note: v.note ?? null,
    })
    .eq("talent_profile_id", v.talent_profile_id)
    .eq("taxonomy_term_id", v.talent_type_term_id);

  if (error) {
    logServerError("verifySkill", error);
    return { ok: false, error: CLIENT_ERROR.generic };
  }

  // Phase 4.1: After successful skill verification, upsert an aggregate
  // "skills_verified" trust badge for this talent. Note count of currently-
  // verified skills in the badge note. Idempotent — uses upsert via a
  // best-effort SELECT then INSERT/UPDATE pattern. Failures here don't
  // block the skill verification itself (it's already saved).
  try {
    const { count: verifiedCount } = await supabase
      .from("talent_profile_taxonomy")
      .select("*", { count: "exact", head: true })
      .eq("talent_profile_id", v.talent_profile_id)
      .not("verified_at", "is", null)
      .or(`verified_by_tenant_id.eq.${tenantId},verified_by_tenant_id.is.null`);

    const { data: existingBadge } = await supabase
      .from("talent_profile_trust_badges")
      .select("id")
      .eq("talent_profile_id", v.talent_profile_id)
      .eq("badge_kind", "skills_verified")
      .eq("scope", v.scope === "agency" ? "agency" : "platform")
      .or(`scope_tenant_id.eq.${tenantId},scope_tenant_id.is.null`)
      .maybeSingle();

    const badgeNote = `${verifiedCount ?? 1} skill${(verifiedCount ?? 1) === 1 ? "" : "s"} verified`;

    if (existingBadge) {
      await supabase
        .from("talent_profile_trust_badges")
        .update({
          status: "verified",
          notes: badgeNote,
          verified_at: new Date().toISOString(),
          verified_by_user_id: user.id,
        })
        .eq("id", existingBadge.id);
    } else {
      await supabase.from("talent_profile_trust_badges").insert({
        talent_profile_id: v.talent_profile_id,
        badge_kind: "skills_verified",
        status: "verified",
        scope: v.scope === "agency" ? "agency" : "platform",
        scope_tenant_id: v.scope === "agency" ? tenantId : null,
        verified_at: new Date().toISOString(),
        verified_by_user_id: user.id,
        notes: badgeNote,
      });
    }
  } catch (badgeErr) {
    // Don't fail the skill-verify if the badge upsert breaks — log and continue.
    logServerError("verifySkill.badge", badgeErr);
  }

  revalidatePath("/[tenantSlug]/admin/roster", "layout");
  return { ok: true };
}

export async function unverifySkill(input: {
  talent_profile_id: string;
  talent_type_term_id: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await requireWorkspaceStaffAction();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, tenantId } = auth;

  const { error } = await supabase
    .from("talent_profile_taxonomy")
    .update({
      verified_at: null,
      verified_by_user_id: null,
      verified_by_tenant_id: null,
      verification_note: null,
    })
    .eq("talent_profile_id", input.talent_profile_id)
    .eq("taxonomy_term_id", input.talent_type_term_id)
    .or(`verified_by_tenant_id.eq.${tenantId},verified_by_tenant_id.is.null`);

  if (error) {
    logServerError("unverifySkill", error);
    return { ok: false, error: CLIENT_ERROR.generic };
  }

  return { ok: true };
}

// ─── Reorder skills (drag-to-reorder; first row = featured skill) ──────────

const reorderSkillsSchema = z.object({
  talent_profile_id: pgUuidSchema(),
  ordered_term_ids: z.array(pgUuidSchema()).min(1),
});

export async function reorderSkills(
  input: z.input<typeof reorderSkillsSchema>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await requireWorkspaceStaffAction();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, tenantId } = auth;

  const parsed = reorderSkillsSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid request.",
    };
  }
  const v = parsed.data;

  const { data: rosterRow } = await supabase
    .from("agency_talent_roster")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("talent_profile_id", v.talent_profile_id)
    .maybeSingle();
  if (!rosterRow) {
    return { ok: false, error: "Talent is not on this tenant's roster." };
  }

  for (let i = 0; i < v.ordered_term_ids.length; i++) {
    const { error } = await supabase
      .from("talent_profile_taxonomy")
      .update({ display_order: (i + 1) * 10 })
      .eq("talent_profile_id", v.talent_profile_id)
      .eq("taxonomy_term_id", v.ordered_term_ids[i]);
    if (error) {
      logServerError("reorderSkills", error);
      return { ok: false, error: CLIENT_ERROR.generic };
    }
  }

  revalidatePath("/[tenantSlug]/admin/roster", "layout");
  return { ok: true };
}

// ─── Set the talent's featured skill (for roster card display) ────────────
//
// Featured = lowest display_order. Sets the chosen skill to display_order=1,
// bumps all other skills to 10, 20, 30, … in their previous order. The roster
// card and search snippet read display_order ASC and pick the first.

const setFeaturedSchema = z.object({
  talent_profile_id: pgUuidSchema(),
  talent_type_term_id: pgUuidSchema(),
});

export async function setFeaturedSkill(
  input: z.input<typeof setFeaturedSchema>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await requireWorkspaceStaffAction();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, tenantId } = auth;

  const parsed = setFeaturedSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid request.",
    };
  }
  const v = parsed.data;

  const { data: rosterRow } = await supabase
    .from("agency_talent_roster")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("talent_profile_id", v.talent_profile_id)
    .maybeSingle();
  if (!rosterRow) {
    return { ok: false, error: "Talent is not on this tenant's roster." };
  }

  // Pull all role rows in current order to know how to renumber.
  const { data: rows } = await supabase
    .from("talent_profile_taxonomy")
    .select("taxonomy_term_id, display_order")
    .eq("talent_profile_id", v.talent_profile_id)
    .in("relationship_type", ["primary_role", "secondary_role"])
    .order("display_order", { ascending: true });

  if (!rows || rows.length === 0) {
    return { ok: false, error: "No skills to feature." };
  }

  // Featured first, then everyone else in their existing relative order.
  const featured = rows.find((r) => r.taxonomy_term_id === v.talent_type_term_id);
  if (!featured) {
    return { ok: false, error: "Skill not found on this talent." };
  }
  const others = rows.filter((r) => r.taxonomy_term_id !== v.talent_type_term_id);

  // Update featured → 1, others → 10, 20, 30, …
  const { error: errFeatured } = await supabase
    .from("talent_profile_taxonomy")
    .update({ display_order: 1 })
    .eq("talent_profile_id", v.talent_profile_id)
    .eq("taxonomy_term_id", v.talent_type_term_id);
  if (errFeatured) {
    logServerError("setFeaturedSkill.featured", errFeatured);
    return { ok: false, error: CLIENT_ERROR.generic };
  }
  for (let i = 0; i < others.length; i++) {
    const { error } = await supabase
      .from("talent_profile_taxonomy")
      .update({ display_order: (i + 1) * 10 })
      .eq("talent_profile_id", v.talent_profile_id)
      .eq("taxonomy_term_id", others[i].taxonomy_term_id);
    if (error) {
      logServerError("setFeaturedSkill.bump", error);
      return { ok: false, error: CLIENT_ERROR.generic };
    }
  }

  revalidatePath("/[tenantSlug]/admin/roster", "layout");
  return { ok: true };
}

// ─── Get all enabled parent_categories for picker top-level ───────────────

export async function getEnabledParentCategoriesForPicker(): Promise<
  | {
      ok: true;
      parents: Array<{
        id: string;
        slug: string;
        name_en: string;
      }>;
    }
  | { ok: false; error: string }
> {
  const auth = await requireWorkspaceStaffAction();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, tenantId } = auth;

  // Get all active parent_categories. Apply tenant overlay (is_enabled).
  // name_en folded into name_i18n {en,es} (WS4); flattened for the picker DTO.
  const { data: terms } = await supabase
    .from("taxonomy_terms")
    .select("id, slug, name_i18n")
    .eq("term_type", "parent_category")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  const { data: settings } = await supabase
    .from("agency_taxonomy_settings")
    .select("taxonomy_term_id, is_enabled")
    .eq("tenant_id", tenantId);

  const settingsByTermId = new Map(
    (settings ?? []).map((s) => [s.taxonomy_term_id, s] as const),
  );

  // Default: enabled when no overlay row exists.
  const filtered = (terms ?? [])
    .filter((t) => {
      const overlay = settingsByTermId.get(t.id);
      return overlay?.is_enabled !== false;
    })
    .map((t) => ({
      id: t.id,
      slug: t.slug,
      name_en: (t.name_i18n as Record<string, string | null> | null)?.en ?? "",
    }));

  return { ok: true, parents: filtered };
}

// ─── Per-tenant skill overrides (Phase 7.1) ────────────────────────────────

export type AgencySkillOverride = {
  id: string;
  taxonomy_term_id: string;
  is_visible_on_agency_site: boolean;
  is_featured_for_agency: boolean;
  display_order_override: number | null;
  custom_label: string | null;
  notes: string | null;
};

export async function getAgencySkillOverrides(input: {
  talent_profile_id: string;
}): Promise<
  | { ok: true; overrides: AgencySkillOverride[] }
  | { ok: false; error: string }
> {
  const auth = await requireWorkspaceStaffAction();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, tenantId } = auth;

  const { data, error } = await supabase
    .from("agency_talent_skill_overrides")
    .select(
      "id, taxonomy_term_id, is_visible_on_agency_site, is_featured_for_agency, display_order_override, custom_label, notes",
    )
    .eq("tenant_id", tenantId)
    .eq("talent_profile_id", input.talent_profile_id);

  if (error) {
    logServerError("getAgencySkillOverrides", error);
    return { ok: false, error: CLIENT_ERROR.generic };
  }

  return { ok: true, overrides: (data ?? []) as AgencySkillOverride[] };
}

const upsertOverrideSchema = z.object({
  talent_profile_id: pgUuidSchema(),
  taxonomy_term_id: pgUuidSchema(),
  is_visible_on_agency_site: z.boolean().optional(),
  is_featured_for_agency: z.boolean().optional(),
  display_order_override: z.number().int().min(0).max(9999).nullable().optional(),
  custom_label: z.string().max(120).nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
});

export async function upsertAgencySkillOverride(
  input: z.input<typeof upsertOverrideSchema>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await requireWorkspaceStaffAction();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, tenantId, user } = auth;

  const parsed = upsertOverrideSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid request.",
    };
  }
  const v = parsed.data;

  // If is_featured_for_agency is being set true, clear the flag from any
  // other override row for this (tenant, talent) — only one featured at a time.
  if (v.is_featured_for_agency) {
    await supabase
      .from("agency_talent_skill_overrides")
      .update({ is_featured_for_agency: false })
      .eq("tenant_id", tenantId)
      .eq("talent_profile_id", v.talent_profile_id)
      .neq("taxonomy_term_id", v.taxonomy_term_id);
  }

  const updates: Record<string, unknown> = {
    tenant_id: tenantId,
    talent_profile_id: v.talent_profile_id,
    taxonomy_term_id: v.taxonomy_term_id,
    created_by_user_id: user.id,
    updated_at: new Date().toISOString(),
  };
  if (v.is_visible_on_agency_site !== undefined)
    updates.is_visible_on_agency_site = v.is_visible_on_agency_site;
  if (v.is_featured_for_agency !== undefined)
    updates.is_featured_for_agency = v.is_featured_for_agency;
  if (v.display_order_override !== undefined)
    updates.display_order_override = v.display_order_override;
  if (v.custom_label !== undefined) updates.custom_label = v.custom_label;
  if (v.notes !== undefined) updates.notes = v.notes;

  const { error } = await supabase
    .from("agency_talent_skill_overrides")
    .upsert(updates, {
      onConflict: "tenant_id,talent_profile_id,taxonomy_term_id",
    });

  if (error) {
    logServerError("upsertAgencySkillOverride", error);
    return { ok: false, error: CLIENT_ERROR.generic };
  }

  revalidatePath("/[tenantSlug]/admin/roster", "layout");
  return { ok: true };
}

export async function clearAgencySkillOverride(input: {
  talent_profile_id: string;
  taxonomy_term_id: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await requireWorkspaceStaffAction();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, tenantId } = auth;

  const { error } = await supabase
    .from("agency_talent_skill_overrides")
    .delete()
    .eq("tenant_id", tenantId)
    .eq("talent_profile_id", input.talent_profile_id)
    .eq("taxonomy_term_id", input.taxonomy_term_id);

  if (error) {
    logServerError("clearAgencySkillOverride", error);
    return { ok: false, error: CLIENT_ERROR.generic };
  }

  return { ok: true };
}

// ─── Aspirations (Phase 1.2 / Q2 — career interests) ──────────────────────

const addAspirationSchema = z.object({
  talent_profile_id: pgUuidSchema(),
  taxonomy_term_id: pgUuidSchema(),
});

export async function addAspiration(
  input: z.input<typeof addAspirationSchema>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await requireWorkspaceStaffAction();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, tenantId } = auth;

  const parsed = addAspirationSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid request.",
    };
  }
  const v = parsed.data;

  const { error } = await supabase.from("talent_profile_taxonomy").insert({
    talent_profile_id: v.talent_profile_id,
    taxonomy_term_id: v.taxonomy_term_id,
    relationship_type: "aspiration",
    tenant_id: tenantId,
    is_primary: false,
  });

  if (error) {
    if (error.code === "23505") {
      return { ok: false, error: "Already on the talent's interests." };
    }
    logServerError("addAspiration", error);
    return { ok: false, error: CLIENT_ERROR.generic };
  }

  revalidatePath("/[tenantSlug]/admin/roster", "layout");
  return { ok: true };
}

export async function removeAspiration(input: {
  talent_profile_id: string;
  taxonomy_term_id: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await requireWorkspaceStaffAction();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase } = auth;

  const { error } = await supabase
    .from("talent_profile_taxonomy")
    .delete()
    .eq("talent_profile_id", input.talent_profile_id)
    .eq("taxonomy_term_id", input.taxonomy_term_id)
    .eq("relationship_type", "aspiration");

  if (error) {
    logServerError("removeAspiration", error);
    return { ok: false, error: CLIENT_ERROR.generic };
  }

  return { ok: true };
}

export async function getAspirations(input: {
  talent_profile_id: string;
}): Promise<
  | {
      ok: true;
      aspirations: Array<{ term_id: string; slug: string; name_en: string; parent_name: string | null }>;
    }
  | { ok: false; error: string }
> {
  const auth = await requireWorkspaceStaffAction();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase } = auth;

  const { data, error } = await supabase
    .from("talent_profile_taxonomy")
    .select(
      `taxonomy_term_id,
       taxonomy_terms!inner ( slug, name_i18n, parent_id )`,
    )
    .eq("talent_profile_id", input.talent_profile_id)
    .eq("relationship_type", "aspiration");

  if (error) {
    logServerError("getAspirations", error);
    return { ok: false, error: CLIENT_ERROR.generic };
  }

  return {
    ok: true,
    // name_en folded into name_i18n {en,es} (WS4); flatten back for the DTO.
    aspirations: (data ?? []).map((row) => {
      const t = row.taxonomy_terms as unknown as {
        slug: string;
        name_i18n: Record<string, string | null> | null;
        parent_id: string | null;
      };
      return {
        term_id: row.taxonomy_term_id,
        slug: t.slug,
        name_en: t.name_i18n?.en ?? "",
        parent_name: null, // Resolved in UI via parent_id if needed
      };
    }),
  };
}

// ─── Request a new taxonomy term ──────────────────────────────────────────
//
// "Don't see your skill?" path. Captures a user-submitted suggestion that
// platform staff can review later. Forms the input queue for catalog
// growth (talent_types added by demand, not just up-front spec).
//
// Future: trigger a notification to support / platform admin when a request
// lands. For now, just stores the row.

const requestTermSchema = z.object({
  parent_category_id: pgUuidSchema().nullable().optional(),
  proposed_name: z.string().min(2).max(120),
  context_note: z.string().max(500).nullable().optional(),
  talent_profile_id: pgUuidSchema().nullable().optional(),
  source: z
    .enum(["skill_picker", "registration", "inquiry_form", "admin_settings"])
    .default("skill_picker"),
});

export async function requestNewTaxonomyTerm(
  input: z.input<typeof requestTermSchema>,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const auth = await requireWorkspaceStaffAction();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, tenantId, user } = auth;

  const parsed = requestTermSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid request.",
    };
  }
  const v = parsed.data;

  // Lightweight de-dup: if this tenant already has a pending request for
  // the same name + parent in the last 30 days, surface the existing one
  // instead of double-logging.
  const { data: existing } = await supabase
    .from("taxonomy_term_requests")
    .select("id")
    .eq("requested_by_tenant_id", tenantId)
    .eq("proposed_name", v.proposed_name)
    .eq("status", "pending")
    .gte("created_at", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
    .maybeSingle();

  if (existing) {
    return { ok: true, id: existing.id };
  }

  const { data, error } = await supabase
    .from("taxonomy_term_requests")
    .insert({
      requested_by_user_id: user.id,
      requested_by_tenant_id: tenantId,
      talent_profile_id: v.talent_profile_id ?? null,
      parent_category_id: v.parent_category_id ?? null,
      proposed_name: v.proposed_name,
      context_note: v.context_note ?? null,
      source: v.source,
    })
    .select("id")
    .single();

  if (error || !data) {
    logServerError("requestNewTaxonomyTerm", error);
    return { ok: false, error: CLIENT_ERROR.generic };
  }

  return { ok: true, id: data.id };
}

// ─── Get talent_types within a parent_category for the picker search ──────

export async function getTalentTypesUnderParent(input: {
  parent_category_id: string;
  query?: string;
}): Promise<
  | {
      ok: true;
      types: Array<{
        id: string;
        slug: string;
        name_en: string;
        name_es: string | null;
        category_group_name: string | null;
      }>;
    }
  | { ok: false; error: string }
> {
  const auth = await requireWorkspaceStaffAction();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase } = auth;

  // Get all talent_type level-3 descendants of this parent_category, filter
  // out generic fallbacks. The taxonomy structure is:
  //   parent_category (L1) -> category_group (L2) -> talent_type (L3)
  // name_en folded into name_i18n {en,es} (WS4); flatten for the picker DTO.
  const { data: groups } = await supabase
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

  if (groupIds.length === 0) {
    return { ok: true, types: [] };
  }

  // M7: alias-aware search. Match name_en (ILIKE), aliases array (any
  // element ILIKE), or search_synonyms array (any element ILIKE).
  //
  // Implementation: fetch all candidates by name_en first (the common path),
  // then if a query is provided, ALSO do a second fetch for terms whose
  // aliases/search_synonyms contain the query, and union the results
  // client-side. Two round-trips is fine at this scale; it avoids the
  // PostgREST array-literal escaping issues that broke the `or()` filter
  // for queries with spaces or special chars.
  const baseQuery = supabase
    .from("taxonomy_terms")
    .select("id, slug, name_i18n, parent_id")
    .in("parent_id", groupIds)
    .eq("term_type", "talent_type")
    .eq("is_active", true)
    .eq("is_generic_fallback", false)
    .order("name_i18n->>en", { ascending: true });

  let primary: typeof baseQuery = baseQuery;
  if (input.query && input.query.length > 0) {
    primary = primary.ilike("name_i18n->>en", `%${input.query}%`);
  }
  const { data: nameMatches, error } = await primary;
  if (error) {
    logServerError("getTalentTypesUnderParent.name", error);
    return { ok: false, error: CLIENT_ERROR.generic };
  }

  // Second pass: alias / synonym matches via a `cs` filter on each array.
  // Postgres array literal needs proper escaping — wrap the value in
  // double quotes to handle spaces ("wedding dj"). Backslashes and quotes
  // in user input are stripped to keep the literal valid.
  let aliasMatches: typeof nameMatches = [];
  if (input.query && input.query.length > 0) {
    const safe = input.query.replace(/[\\"]/g, "");
    const { data: aliasHits } = await supabase
      .from("taxonomy_terms")
      .select("id, slug, name_i18n, parent_id")
      .in("parent_id", groupIds)
      .eq("term_type", "talent_type")
      .eq("is_active", true)
      .eq("is_generic_fallback", false)
      .or(`aliases.cs.{"${safe}"},search_synonyms.cs.{"${safe}"}`);
    aliasMatches = aliasHits ?? [];
  }

  // Union (dedup by id), then sort by English name for stable ordering.
  const seen = new Set<string>();
  const types: NonNullable<typeof nameMatches> = [];
  for (const row of [...(nameMatches ?? []), ...aliasMatches]) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    types.push(row);
  }
  const nameEnOf = (r: { name_i18n: Record<string, string | null> | null }) =>
    r.name_i18n?.en ?? "";
  types.sort((a, b) => nameEnOf(a).localeCompare(nameEnOf(b)));

  return {
    ok: true,
    // name_en/name_es folded into name_i18n {en,es} (WS4); flatten for the DTO.
    types: types.map((t) => ({
      id: t.id,
      slug: t.slug,
      name_en: t.name_i18n?.en ?? "",
      name_es: t.name_i18n?.es ?? null,
      category_group_name: groupNameById.get(t.parent_id) ?? null,
    })),
  };
}
