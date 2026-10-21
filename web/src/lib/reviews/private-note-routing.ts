/**
 * TUL-1686: who reads a client's private review note (#4178's rule).
 *
 * In a team studio the client is the business's, so the private note goes to the
 * WORKSPACE (its staff), never to the talent who did the job. Every other work
 * model is unchanged: the note is the subject talent's coaching channel.
 *
 * The database is the authority once the held migration
 * 20261231422900_team_studio_review_private_notes_tul1686.sql is applied: both
 * readers call its signed-in RPCs. Until then (function missing) they fall back to
 * a service-role read with the SAME rule applied here, fail closed:
 *   - talent side: if the workspace models cannot be read, every review earned in
 *     a workspace is dropped (only workspace-less notes are shown). A missing
 *     work_model column (42703, before 20261231420200) means no team studio can
 *     exist yet, so nothing is dropped.
 *   - workspace side: anything unreadable shows nothing.
 *
 * Not behind HUB_REVIEW_ROUTING_ENABLED: that flag lives on the unmerged TUL-1591
 * (b) branch and governs where PUBLIC reviews are shown. This is a privacy rule;
 * a flag that defaults off would keep the leak open.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { NoteWorkspace } from "./private-note-audience";

export const TEAM_STUDIO_MODEL = "team_studio";

/** The rule, pure: a team-studio review sends its private note to the workspace. */
export function privateNoteGoesToWorkspace(workModel: string | null | undefined): boolean {
  return workModel === TEAM_STUDIO_MODEL;
}

type Db = Pick<SupabaseClient, "from">;
type RpcDb = Pick<SupabaseClient, "rpc">;
type DbError = { code?: string; message?: string } | null | undefined;

export type TalentPrivateNote = { reviewId: string; note: string; createdAt: string };
export type WorkspacePrivateNote = { reviewId: string; talentProfileId: string; note: string; createdAt: string };

/** PostgREST / Postgres "that function does not exist (yet)". */
export function isMissingFunction(error: DbError): boolean {
  return !!error && (error.code === "PGRST202" || error.code === "42883");
}

/**
 * Which of these tenants run as a team studio. null = could not tell (fail closed
 * by the caller). An empty set when the work_model column does not exist yet.
 */
export async function teamStudioTenantIds(db: Db, tenantIds: readonly string[]): Promise<Set<string> | null> {
  const ids = [...new Set(tenantIds.filter(Boolean))];
  if (ids.length === 0) return new Set();
  try {
    const { data, error } = await db.from("agencies").select("id, work_model").in("id", ids);
    if (error) return error.code === "42703" ? new Set() : null;
    if (!Array.isArray(data)) return null;
    const out = new Set<string>();
    for (const a of data as Array<{ id: string; work_model?: string | null }>) {
      if (privateNoteGoesToWorkspace(a.work_model)) out.add(a.id);
    }
    return out;
  } catch {
    return null;
  }
}

/**
 * The review's workspace for the client forms' private-note label (./private-note-audience).
 * null = could not be read (the form then names no one). A missing work_model column
 * (before 20261231420200) means no team studio can exist: the note stays the talent's.
 */
export async function readNoteWorkspace(db: Db, tenantId: string | null | undefined): Promise<NoteWorkspace> {
  if (!tenantId) return null;
  try {
    const { data, error } = await db.from("agencies").select("work_model, display_name").eq("id", tenantId).maybeSingle();
    if (error) return error.code === "42703" ? { workModel: null, name: null } : null;
    if (!data) return null;
    const row = data as { work_model?: string | null; display_name?: string | null };
    return { workModel: row.work_model ?? null, name: row.display_name?.trim() || null };
  } catch {
    return null;
  }
}

type NoteRow = { id: string; tenant_id: string | null; private_note: string | null; created_at: string };

/**
 * Talent side, service-role fallback: the subject talent's notes minus every
 * team-studio review. The caller has already checked the caller owns the profile.
 */
export async function readTalentPrivateNotes(svc: Db, talentProfileId: string, limit = 6): Promise<TalentPrivateNote[]> {
  try {
    const { data, error } = await svc
      .from("talent_reviews")
      .select("id, tenant_id, private_note, created_at")
      .eq("talent_profile_id", talentProfileId)
      .not("private_note", "is", null)
      .order("created_at", { ascending: false })
      .limit(Math.min(Math.max(limit, 1) * 4, 50));
    if (error || !Array.isArray(data)) return [];
    const rows = data as NoteRow[];
    const studios = await teamStudioTenantIds(svc, rows.map((r) => r.tenant_id ?? ""));
    return rows
      .filter((r) => (studios === null ? !r.tenant_id : !(r.tenant_id && studios.has(r.tenant_id))))
      .map((r) => ({ reviewId: r.id, note: (r.private_note ?? "").trim(), createdAt: r.created_at }))
      .filter((n) => n.note.length > 0)
      .slice(0, limit);
  } catch {
    return [];
  }
}

/**
 * Workspace side, service-role fallback: the tenant's notes, only when it is a team
 * studio. The caller has already checked the caller is staff of this tenant.
 */
export async function readWorkspacePrivateNotes(svc: Db, tenantId: string, limit = 20): Promise<WorkspacePrivateNote[]> {
  try {
    const studios = await teamStudioTenantIds(svc, [tenantId]);
    if (!studios || !studios.has(tenantId)) return [];
    const { data, error } = await svc
      .from("talent_reviews")
      .select("id, talent_profile_id, private_note, created_at")
      .eq("tenant_id", tenantId)
      .not("private_note", "is", null)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error || !Array.isArray(data)) return [];
    return (data as Array<{ id: string; talent_profile_id: string; private_note: string | null; created_at: string }>)
      .map((r) => ({ reviewId: r.id, talentProfileId: r.talent_profile_id, note: (r.private_note ?? "").trim(), createdAt: r.created_at }))
      .filter((n) => n.note.length > 0);
  } catch {
    return [];
  }
}

/**
 * Talent side: the DB reader as the signed-in owner, else the fallback. Any RPC
 * error other than "function missing" shows nothing.
 */
export async function loadTalentPrivateNotes(
  session: RpcDb,
  svc: Db,
  talentProfileId: string,
  limit = 6,
): Promise<TalentPrivateNote[]> {
  try {
    const { data, error } = await session.rpc("review_private_notes_for_talent", { p_talent_profile_id: talentProfileId, p_limit: limit });
    if (isMissingFunction(error)) return readTalentPrivateNotes(svc, talentProfileId, limit);
    if (error || !Array.isArray(data)) return [];
    return (data as Array<{ review_id: string; private_note: string | null; created_at: string }>)
      .map((r) => ({ reviewId: r.review_id, note: (r.private_note ?? "").trim(), createdAt: r.created_at }))
      .filter((n) => n.note.length > 0);
  } catch {
    return [];
  }
}

/** Workspace side: the DB reader as the signed-in staff member, else the fallback. */
export async function loadWorkspacePrivateNotes(
  session: RpcDb,
  svc: Db,
  tenantId: string,
  limit = 20,
): Promise<WorkspacePrivateNote[]> {
  try {
    const { data, error } = await session.rpc("review_private_notes_for_workspace", { p_tenant_id: tenantId, p_limit: limit });
    if (isMissingFunction(error)) return readWorkspacePrivateNotes(svc, tenantId, limit);
    if (error || !Array.isArray(data)) return [];
    return (data as Array<{ review_id: string; talent_profile_id: string; private_note: string | null; created_at: string }>)
      .map((r) => ({ reviewId: r.review_id, talentProfileId: r.talent_profile_id, note: (r.private_note ?? "").trim(), createdAt: r.created_at }))
      .filter((n) => n.note.length > 0);
  } catch {
    return [];
  }
}
