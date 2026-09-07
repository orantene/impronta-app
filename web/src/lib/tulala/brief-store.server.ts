/**
 * brief-store.server.ts — every write to a Tulala Brief goes through here.
 *
 * The four Brief tables REVOKE insert, update and delete from both `anon` and
 * `authenticated`, so this module is not merely the recommended path, it is the
 * only one. That is deliberate: the L20 rule (a model may propose, only a human
 * may confirm) is enforced by a CHECK constraint, by `resolveIncomingStatus`,
 * and by there being no route to the table that skips both.
 *
 * Ownership is resolved from the HMAC-signed `impronta_guest` cookie or from
 * `auth.uid()`, never from a caller-supplied id. Anything else would make a
 * brief id a capability.
 */

import "server-only";
import { cache } from "react";

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import { FACT_VOCABULARY_VERSION } from "./fact-keys";
import {
  buildSnapshot,
  factsFromSnapshot,
  normalizeFact,
  shouldReplaceFact,
  type Brief,
  type BriefFact,
  type BriefSnapshot,
  type BriefStatus,
  type FactInput,
  type FactSource,
  type FactStatus,
} from "./brief-store";

type FactRow = {
  fact_key: string;
  fact_value: unknown;
  source: string;
  confidence: number | string | null;
  status: string;
  source_excerpt: string | null;
  source_url: string | null;
  question_id: string | null;
  question_version: number | null;
  updated_at: string | null;
};

type BriefRow = {
  id: string;
  status: string;
  locale: string | null;
  current_version: number | null;
  engine_version: string | null;
  profile_id: string | null;
  guest_session_id: string | null;
  signup_lead_id: string | null;
  talent_profile_id: string | null;
  tenant_id: string | null;
  updated_at: string | null;
  tulala_brief_facts?: FactRow[] | null;
};

const BRIEF_SELECT = `
  id, status, locale, current_version, engine_version,
  profile_id, guest_session_id, signup_lead_id, talent_profile_id, tenant_id, updated_at,
  tulala_brief_facts (
    fact_key, fact_value, source, confidence, status,
    source_excerpt, source_url, question_id, question_version, updated_at
  )
`;

function mapFact(row: FactRow): BriefFact {
  // `numeric` comes back as a string from PostgREST. Reading it as a number
  // without this returns NaN, and NaN confidence silently zeroes an entire
  // evidence line in the engine.
  const raw = row.confidence;
  const confidence =
    typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : 1;
  return {
    factKey: row.fact_key,
    value: row.fact_value,
    source: row.source as FactSource,
    confidence: Number.isFinite(confidence) ? confidence : 1,
    status: row.status as FactStatus,
    sourceExcerpt: row.source_excerpt,
    sourceUrl: row.source_url,
    questionId: row.question_id,
    questionVersion: row.question_version,
    updatedAt: row.updated_at,
  };
}

function mapBrief(row: BriefRow): Brief {
  return {
    id: row.id,
    status: (row.status as BriefStatus) ?? "discovering",
    locale: row.locale ?? "en",
    currentVersion: row.current_version ?? 0,
    engineVersion: row.engine_version,
    profileId: row.profile_id,
    guestSessionId: row.guest_session_id,
    signupLeadId: row.signup_lead_id,
    talentProfileId: row.talent_profile_id,
    tenantId: row.tenant_id,
    facts: (row.tulala_brief_facts ?? []).map(mapFact),
    updatedAt: row.updated_at,
  };
}

// ─── Ownership ────────────────────────────────────────────────────────────────

/**
 * Who a brief belongs to. Exactly one side is set.
 *
 * A discriminated union rather than two nullable fields so that "neither" is
 * unrepresentable — the DB has a CHECK for it, and a caller should not be able
 * to construct the invalid case in the first place.
 */
export type BriefOwner =
  | { kind: "profile"; profileId: string }
  | { kind: "guest"; guestSessionId: string };

// ─── Reads ────────────────────────────────────────────────────────────────────

/**
 * The owner's current brief, or null.
 *
 * Cached per request: the Settings surface, the What-I-know panel and the engine
 * all want it in one render and none of them should pay separately.
 */
export const loadBrief = cache(async (owner: BriefOwner): Promise<Brief | null> => {
  const sb = createServiceRoleClient();
  if (!sb) return null;
  try {
    const query = sb
      .from("tulala_briefs")
      .select(BRIEF_SELECT)
      .neq("status", "abandoned")
      .order("updated_at", { ascending: false })
      .limit(1);

    const { data, error } =
      owner.kind === "profile"
        ? await query.eq("profile_id", owner.profileId).maybeSingle()
        : await query.eq("guest_session_id", owner.guestSessionId).maybeSingle();

    if (error) {
      logServerError("tulala.loadBrief", error);
      return null;
    }
    return data ? mapBrief(data as unknown as BriefRow) : null;
  } catch (err) {
    logServerError("tulala.loadBrief", err);
    return null;
  }
});

export async function loadBriefById(
  briefId: string,
  owner: BriefOwner,
): Promise<Brief | null> {
  const sb = createServiceRoleClient();
  if (!sb) return null;
  try {
    // Scoped by owner, not just id: a brief id must never be enough to read a
    // brief, or a guessed uuid becomes a data leak.
    const query = sb.from("tulala_briefs").select(BRIEF_SELECT).eq("id", briefId);
    const { data, error } =
      owner.kind === "profile"
        ? await query.eq("profile_id", owner.profileId).maybeSingle()
        : await query.eq("guest_session_id", owner.guestSessionId).maybeSingle();
    if (error) {
      logServerError("tulala.loadBriefById", error);
      return null;
    }
    return data ? mapBrief(data as unknown as BriefRow) : null;
  } catch (err) {
    logServerError("tulala.loadBriefById", err);
    return null;
  }
}

/**
 * The brief a signup lead produced, for PROVISIONING to read.
 *
 * WHY THIS HAS NO OWNER ARGUMENT, UNLIKE EVERY OTHER READ HERE.
 * `loadBriefById` is owner-scoped because a brief id must never be enough to
 * read a brief. This one is not addressed by a brief id at all: the caller
 * already holds the signup lead it is provisioning, and the lead is the
 * authority. There is no id here for an attacker to guess into — you either are
 * the provisioner acting on a lead, or you are not calling this.
 *
 * WHY IT EXISTS. The intake fetches a page, extracts facts, scores them and
 * stores them with their source URL — and provisioning then reads exactly one
 * string off the lead row and walks past the rest. The facts have been sitting
 * in `tulala_brief_facts` the whole time with nobody reading them. This is the
 * door.
 */
export async function loadBriefForSignupLead(signupLeadId: string): Promise<Brief | null> {
  if (!signupLeadId) return null;
  const sb = createServiceRoleClient();
  if (!sb) return null;
  try {
    const { data, error } = await sb
      .from("tulala_briefs")
      .select(BRIEF_SELECT)
      .eq("signup_lead_id", signupLeadId)
      // A lead can only have produced one live brief, but "abandoned" rows can
      // exist beside it after a start-over. Newest wins, and status is not
      // filtered: a brief the visitor abandoned still described their business,
      // and refusing it would silently provision an empty workspace for someone
      // who typed everything in.
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) {
      logServerError("tulala.loadBriefForSignupLead", error);
      return null;
    }
    return data ? mapBrief(data as unknown as BriefRow) : null;
  } catch (err) {
    logServerError("tulala.loadBriefForSignupLead", err);
    return null;
  }
}

// ─── Create ───────────────────────────────────────────────────────────────────

export type EnsureBriefResult =
  | { ok: true; brief: Brief; created: boolean }
  | { ok: false; error: string };

/**
 * The owner's brief, creating one if they have none.
 *
 * One live brief per owner. "Start a new discovery session" archives the old one
 * rather than creating a second live one, so nothing downstream has to decide
 * which of two briefs is the real one.
 */
export async function ensureBrief(
  owner: BriefOwner,
  init: { locale?: string; signupLeadId?: string | null } = {},
): Promise<EnsureBriefResult> {
  const sb = createServiceRoleClient();
  if (!sb) return { ok: false, error: "Database not available." };

  const existing = await loadBrief(owner);
  if (existing) return { ok: true, brief: existing, created: false };

  try {
    const insert: Record<string, unknown> = {
      locale: init.locale ?? "en",
      signup_lead_id: init.signupLeadId ?? null,
    };
    if (owner.kind === "profile") insert.profile_id = owner.profileId;
    else insert.guest_session_id = owner.guestSessionId;

    const { data, error } = await sb
      .from("tulala_briefs")
      .insert(insert)
      .select(BRIEF_SELECT)
      .single();

    if (error || !data) {
      logServerError("tulala.ensureBrief", error);
      return { ok: false, error: "Could not start your brief." };
    }
    return { ok: true, brief: mapBrief(data as unknown as BriefRow), created: true };
  } catch (err) {
    logServerError("tulala.ensureBrief", err);
    return { ok: false, error: "Could not start your brief." };
  }
}

// ─── Facts ────────────────────────────────────────────────────────────────────

export type RecordFactsResult = {
  written: string[];
  skipped: Array<{ factKey: string; reason: string }>;
  rejected: Array<{ factKey: string; error: string }>;
};

/**
 * Record facts, applying the provenance and precedence rules.
 *
 * Partial success is the correct behaviour and the reason this returns three
 * lists instead of a boolean. A model extracting eight facts will occasionally
 * get one wrong; discarding the other seven because of it would make extraction
 * fragile in exactly the situation it is most useful. Callers log `rejected` —
 * a recurring entry there is a prompt or vocabulary bug, and it is the only
 * place that shows up.
 */
export async function recordFacts(
  briefId: string,
  inputs: FactInput[],
): Promise<RecordFactsResult> {
  const result: RecordFactsResult = { written: [], skipped: [], rejected: [] };
  const sb = createServiceRoleClient();
  if (!sb || inputs.length === 0) return result;

  const { data: currentRows, error: readErr } = await sb
    .from("tulala_brief_facts")
    .select(
      "fact_key, fact_value, source, confidence, status, source_excerpt, source_url, question_id, question_version, updated_at",
    )
    .eq("brief_id", briefId);

  if (readErr) {
    logServerError("tulala.recordFacts.read", readErr);
    return result;
  }

  const current = new Map<string, BriefFact>(
    ((currentRows ?? []) as FactRow[]).map((r) => [r.fact_key, mapFact(r)]),
  );

  const toWrite: Array<Record<string, unknown>> = [];
  // Later inputs win over earlier ones for the same key inside a single call,
  // via the same precedence rule, so a batch behaves like the sequence of
  // writes it represents rather than depending on array order.
  const staged = new Map<string, BriefFact>();

  for (const input of inputs) {
    const normalized = normalizeFact(input);
    if (!normalized.ok) {
      result.rejected.push({ factKey: input.factKey, error: normalized.error });
      continue;
    }
    const fact = normalized.fact;
    const existing = staged.get(fact.factKey) ?? current.get(fact.factKey) ?? null;
    if (!shouldReplaceFact(existing, fact)) {
      result.skipped.push({
        factKey: fact.factKey,
        reason: existing
          ? `kept existing ${existing.source} value (${existing.status})`
          : "no change",
      });
      continue;
    }
    staged.set(fact.factKey, {
      ...fact,
      updatedAt: null,
    });
    toWrite.push({
      brief_id: briefId,
      fact_key: fact.factKey,
      fact_value: fact.value ?? null,
      source: fact.source,
      confidence: fact.confidence,
      status: fact.status,
      source_excerpt: fact.sourceExcerpt,
      source_url: fact.sourceUrl,
      question_id: fact.questionId,
      question_version: fact.questionVersion,
      updated_at: new Date().toISOString(),
    });
  }

  if (toWrite.length === 0) return result;

  const { error: writeErr } = await sb
    .from("tulala_brief_facts")
    .upsert(toWrite, { onConflict: "brief_id,fact_key" });

  if (writeErr) {
    logServerError("tulala.recordFacts.write", writeErr);
    for (const row of toWrite) {
      result.rejected.push({
        factKey: String(row.fact_key),
        error: "write failed",
      });
    }
    return result;
  }

  result.written = toWrite.map((r) => String(r.fact_key));
  return result;
}

/**
 * Approve or reject facts a model proposed.
 *
 * The human half of L20, and the only path by which a fact reaches `confirmed`
 * from `ai_inference`. Confidence is set to 1 on approval because the user has
 * now told us: keeping the model's 0.6 would mean a later 0.7 guess could
 * overwrite something a human agreed to.
 */
export async function resolveFactApprovals(
  briefId: string,
  decisions: Array<{ factKey: string; approve: boolean }>,
): Promise<{ ok: boolean; updated: number }> {
  const sb = createServiceRoleClient();
  if (!sb || decisions.length === 0) return { ok: true, updated: 0 };

  let updated = 0;
  try {
    for (const decision of decisions) {
      const patch = decision.approve
        ? { status: "confirmed", confidence: 1, source: "user_stated" }
        : { status: "rejected" };
      const { error } = await sb
        .from("tulala_brief_facts")
        .update(patch)
        .eq("brief_id", briefId)
        .eq("fact_key", decision.factKey)
        .in("status", ["needs_approval", "suggested"]);
      if (error) {
        logServerError("tulala.resolveFactApprovals", error);
        continue;
      }
      updated += 1;
    }
    return { ok: true, updated };
  } catch (err) {
    logServerError("tulala.resolveFactApprovals", err);
    return { ok: false, updated };
  }
}

/** Remove one fact outright. For "that is not right and there is no correction". */
export async function deleteFact(
  briefId: string,
  factKey: string,
): Promise<{ ok: boolean }> {
  const sb = createServiceRoleClient();
  if (!sb) return { ok: false };
  const { error } = await sb
    .from("tulala_brief_facts")
    .delete()
    .eq("brief_id", briefId)
    .eq("fact_key", factKey);
  if (error) {
    logServerError("tulala.deleteFact", error);
    return { ok: false };
  }
  return { ok: true };
}

// ─── Versions ─────────────────────────────────────────────────────────────────

export type SnapshotReason =
  | "intake"
  | "user_edit"
  | "reimport"
  | "repositioning"
  | "restore"
  | "reset";

/**
 * Freeze the current facts as a new version.
 *
 * Compare-and-set on `current_version`, following `saveIdentity`: the caller
 * passes the version it read, and a mismatch is reported rather than silently
 * overwriting a concurrent snapshot. Two browser tabs approving the same brief
 * is not hypothetical during intake.
 *
 * Order matters. The version row is inserted FIRST, then the counter advances.
 * Inserting after the bump would leave a brief claiming version 3 with no v3 to
 * restore, which is worse than a spare snapshot nobody points at.
 */
export async function snapshotBrief(
  briefId: string,
  opts: {
    expectedVersion: number;
    reason: SnapshotReason;
    createdBy?: string | null;
    engineVersion?: string | null;
  },
): Promise<{ ok: true; version: number } | { ok: false; error: string; conflict?: boolean }> {
  const sb = createServiceRoleClient();
  if (!sb) return { ok: false, error: "Database not available." };

  try {
    const { data: row, error: readErr } = await sb
      .from("tulala_briefs")
      .select(BRIEF_SELECT)
      .eq("id", briefId)
      .maybeSingle();
    if (readErr || !row) {
      logServerError("tulala.snapshotBrief.read", readErr);
      return { ok: false, error: "Brief not found." };
    }

    const brief = mapBrief(row as unknown as BriefRow);
    if (brief.currentVersion !== opts.expectedVersion) {
      return {
        ok: false,
        conflict: true,
        error: "This brief changed while you were looking at it. Reload and try again.",
      };
    }

    const nextVersion = brief.currentVersion + 1;
    const snapshot = buildSnapshot(brief, FACT_VOCABULARY_VERSION);

    const { error: insertErr } = await sb.from("tulala_brief_versions").insert({
      brief_id: briefId,
      version: nextVersion,
      snapshot,
      reason: opts.reason,
      engine_version: opts.engineVersion ?? brief.engineVersion,
      created_by: opts.createdBy ?? brief.profileId,
    });
    if (insertErr) {
      logServerError("tulala.snapshotBrief.insert", insertErr);
      return { ok: false, error: "Could not save a version of your brief." };
    }

    const { error: bumpErr, data: bumped } = await sb
      .from("tulala_briefs")
      .update({
        current_version: nextVersion,
        engine_version: opts.engineVersion ?? brief.engineVersion,
      })
      .eq("id", briefId)
      .eq("current_version", opts.expectedVersion)
      .select("id");

    if (bumpErr) {
      logServerError("tulala.snapshotBrief.bump", bumpErr);
      return { ok: false, error: "Could not save a version of your brief." };
    }
    if (!bumped || bumped.length === 0) {
      // Someone else advanced the counter between the read and the update. The
      // snapshot we inserted is still valid history; the caller just did not win.
      return {
        ok: false,
        conflict: true,
        error: "This brief changed while you were looking at it. Reload and try again.",
      };
    }

    return { ok: true, version: nextVersion };
  } catch (err) {
    logServerError("tulala.snapshotBrief", err);
    return { ok: false, error: "Could not save a version of your brief." };
  }
}

export type BriefVersionSummary = {
  version: number;
  reason: SnapshotReason;
  engineVersion: string | null;
  createdAt: string;
  factCount: number;
};

export async function listBriefVersions(
  briefId: string,
): Promise<BriefVersionSummary[]> {
  const sb = createServiceRoleClient();
  if (!sb) return [];
  const { data, error } = await sb
    .from("tulala_brief_versions")
    .select("version, reason, engine_version, created_at, snapshot")
    .eq("brief_id", briefId)
    .order("version", { ascending: false });
  if (error) {
    logServerError("tulala.listBriefVersions", error);
    return [];
  }
  return ((data ?? []) as Array<{
    version: number;
    reason: string;
    engine_version: string | null;
    created_at: string;
    snapshot: BriefSnapshot | null;
  }>).map((r) => ({
    version: r.version,
    reason: (r.reason as SnapshotReason) ?? "intake",
    engineVersion: r.engine_version,
    createdAt: r.created_at,
    factCount: r.snapshot?.facts?.length ?? 0,
  }));
}

/**
 * Replace the current facts with those from an earlier version.
 *
 * Snapshots the current state first, under reason `restore`. Restoring is itself
 * an edit, and losing the state you restored away from would make the feature
 * unusable the first time someone restores the wrong version.
 */
export async function restoreBriefVersion(
  briefId: string,
  version: number,
  actorProfileId: string | null,
): Promise<{ ok: true; version: number } | { ok: false; error: string }> {
  const sb = createServiceRoleClient();
  if (!sb) return { ok: false, error: "Database not available." };

  const { data: target, error: readErr } = await sb
    .from("tulala_brief_versions")
    .select("snapshot")
    .eq("brief_id", briefId)
    .eq("version", version)
    .maybeSingle();
  if (readErr || !target) {
    logServerError("tulala.restoreBriefVersion.read", readErr);
    return { ok: false, error: "That version is not available." };
  }

  const { data: briefRow } = await sb
    .from("tulala_briefs")
    .select("current_version")
    .eq("id", briefId)
    .maybeSingle();
  const currentVersion =
    (briefRow as { current_version?: number } | null)?.current_version ?? 0;

  const preserved = await snapshotBrief(briefId, {
    expectedVersion: currentVersion,
    reason: "restore",
    createdBy: actorProfileId,
  });
  if (!preserved.ok) return { ok: false, error: preserved.error };

  const snapshot = (target as { snapshot: BriefSnapshot }).snapshot;
  const restored = factsFromSnapshot(snapshot);

  const { error: clearErr } = await sb
    .from("tulala_brief_facts")
    .delete()
    .eq("brief_id", briefId);
  if (clearErr) {
    logServerError("tulala.restoreBriefVersion.clear", clearErr);
    return { ok: false, error: "Could not restore that version." };
  }

  await recordFacts(briefId, restored);
  return { ok: true, version: preserved.version };
}

/**
 * "Reset AI understanding": drop every fact the model produced, keep what the
 * user actually said.
 *
 * The escape hatch that makes the whole inference layer safe to offer. A user
 * who feels the AI has the wrong idea about them needs one button that is
 * obviously safe to press, and "delete everything including my own answers" is
 * not that button.
 */
export async function resetAiUnderstanding(
  briefId: string,
  actorProfileId: string | null,
  currentVersion: number,
): Promise<{ ok: true; removed: number } | { ok: false; error: string }> {
  const sb = createServiceRoleClient();
  if (!sb) return { ok: false, error: "Database not available." };

  const preserved = await snapshotBrief(briefId, {
    expectedVersion: currentVersion,
    reason: "reset",
    createdBy: actorProfileId,
  });
  if (!preserved.ok) return { ok: false, error: preserved.error };

  const { data, error } = await sb
    .from("tulala_brief_facts")
    .delete()
    .eq("brief_id", briefId)
    .in("source", ["ai_inference", "url_import"])
    .select("fact_key");
  if (error) {
    logServerError("tulala.resetAiUnderstanding", error);
    return { ok: false, error: "Could not reset." };
  }
  return { ok: true, removed: (data ?? []).length };
}

// ─── Lifecycle ────────────────────────────────────────────────────────────────

export async function setBriefStatus(
  briefId: string,
  status: BriefStatus,
): Promise<{ ok: boolean }> {
  const sb = createServiceRoleClient();
  if (!sb) return { ok: false };
  const { error } = await sb
    .from("tulala_briefs")
    .update({ status })
    .eq("id", briefId);
  if (error) {
    logServerError("tulala.setBriefStatus", error);
    return { ok: false };
  }
  return { ok: true };
}

/** Stamp the engine that last classified this brief. See the replay harness. */
export async function setBriefEngineVersion(
  briefId: string,
  engineVersion: string,
): Promise<{ ok: boolean }> {
  const sb = createServiceRoleClient();
  if (!sb) return { ok: false };
  const { error } = await sb
    .from("tulala_briefs")
    .update({ engine_version: engineVersion })
    .eq("id", briefId);
  if (error) {
    logServerError("tulala.setBriefEngineVersion", error);
    return { ok: false };
  }
  return { ok: true };
}

/**
 * Point a brief at the objects the intake produced.
 *
 * Called after provisioning, so the Settings surface can say "this brief built
 * that workspace" and the Account Strategist knows which account a brief
 * describes.
 */
export async function linkBriefObjects(
  briefId: string,
  links: {
    talentProfileId?: string | null;
    tenantId?: string | null;
    signupLeadId?: string | null;
  },
): Promise<{ ok: boolean }> {
  const sb = createServiceRoleClient();
  if (!sb) return { ok: false };
  const patch: Record<string, unknown> = {};
  if (links.talentProfileId !== undefined) patch.talent_profile_id = links.talentProfileId;
  if (links.tenantId !== undefined) patch.tenant_id = links.tenantId;
  if (links.signupLeadId !== undefined) patch.signup_lead_id = links.signupLeadId;
  if (Object.keys(patch).length === 0) return { ok: true };

  const { error } = await sb.from("tulala_briefs").update(patch).eq("id", briefId);
  if (error) {
    logServerError("tulala.linkBriefObjects", error);
    return { ok: false };
  }
  return { ok: true };
}

/**
 * Archive the live brief so a new discovery session can start clean.
 *
 * Archives rather than deletes: the versions are the record of what someone told
 * us, and "start over" is not a request to forget.
 */
export async function archiveBrief(briefId: string): Promise<{ ok: boolean }> {
  return setBriefStatus(briefId, "abandoned");
}

// ─── Claim ────────────────────────────────────────────────────────────────────

/**
 * The one method of the caller's client we need.
 *
 * `PromiseLike`, not `Promise`: PostgREST's builder is a thenable that only
 * becomes a Promise when awaited, so requiring `Promise` here rejects every
 * real Supabase client. Structural rather than `SupabaseClient` so a test can
 * pass a two-line stub.
 */
export type BriefRpcClient = {
  rpc: (
    fn: string,
    args: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: unknown }>;
};

/**
 * Attach a guest brief to a profile after signup.
 *
 * Uses the SECURITY DEFINER RPC so the auth check lives next to the write, in
 * SQL, where a future caller cannot forget it. Returns the claimed brief id, or
 * null when the guest had nothing worth claiming — which is a normal outcome for
 * anyone who signed up without talking to the Agent first.
 */
export async function claimBriefForUser(
  sessionKey: string,
  profileId: string,
  supabase: BriefRpcClient,
): Promise<string | null> {
  try {
    const { data, error } = await supabase.rpc("claim_tulala_brief_for_user", {
      p_session_key: sessionKey,
      p_profile_id: profileId,
    });
    if (error) {
      logServerError("tulala.claimBriefForUser", error);
      return null;
    }
    return typeof data === "string" ? data : null;
  } catch (err) {
    logServerError("tulala.claimBriefForUser", err);
    return null;
  }
}
