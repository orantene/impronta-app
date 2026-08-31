"use server";

/**
 * Brief settings actions.
 *
 * Every one of these resolves the brief from the SESSION, never from a
 * caller-supplied brief id. The Brief tables revoke writes from `authenticated`,
 * so the service role is the only writer, which means an id accepted from a form
 * would be an authorization bypass rather than a convenience.
 */

import { revalidatePath } from "next/cache";

import { requireSession } from "@/lib/server/action-guards";
import {
  deleteFact,
  loadBrief,
  resetAiUnderstanding,
  resolveFactApprovals,
  restoreBriefVersion,
  archiveBrief,
  recordFacts,
  snapshotBrief,
} from "@/lib/tulala/brief-store.server";
import { isKnownFactKey } from "@/lib/tulala/fact-keys";

export type BriefActionResult = { ok: true } | { ok: false; error: string };

const BRIEF_PATH = "/account/brief";

/** The signed-in user's brief, or an error. Shared preamble for every action. */
async function requireOwnBrief() {
  const session = await requireSession();
  if (!session.ok) return { ok: false as const, error: session.error };
  const brief = await loadBrief({ kind: "profile", profileId: session.user.id });
  if (!brief) return { ok: false as const, error: "You don't have a brief yet." };
  return { ok: true as const, brief, userId: session.user.id };
}

export async function approveBriefFacts(
  decisions: Array<{ factKey: string; approve: boolean }>,
): Promise<BriefActionResult> {
  const own = await requireOwnBrief();
  if (!own.ok) return { ok: false, error: own.error };

  const clean = decisions.filter((d) => isKnownFactKey(d.factKey));
  if (clean.length === 0) return { ok: false, error: "Nothing to save." };

  const result = await resolveFactApprovals(own.brief.id, clean);
  if (!result.ok) return { ok: false, error: "Could not save your decisions." };

  revalidatePath(BRIEF_PATH);
  return { ok: true };
}

/**
 * Correct a fact by hand.
 *
 * Recorded as `user_stated`, which is what it is, and which is why it outranks
 * whatever was there. Snapshots first so the correction is undoable.
 */
export async function editBriefFact(
  factKey: string,
  value: unknown,
): Promise<BriefActionResult> {
  const own = await requireOwnBrief();
  if (!own.ok) return { ok: false, error: own.error };
  if (!isKnownFactKey(factKey)) return { ok: false, error: "Unknown field." };

  const snap = await snapshotBrief(own.brief.id, {
    expectedVersion: own.brief.currentVersion,
    reason: "user_edit",
    createdBy: own.userId,
  });
  if (!snap.ok) return { ok: false, error: snap.error };

  const written = await recordFacts(own.brief.id, [
    { factKey, value, source: "user_stated" },
  ]);
  if (written.rejected.length > 0) {
    return { ok: false, error: written.rejected[0]?.error ?? "That value isn't valid." };
  }

  revalidatePath(BRIEF_PATH);
  return { ok: true };
}

export async function removeBriefFact(factKey: string): Promise<BriefActionResult> {
  const own = await requireOwnBrief();
  if (!own.ok) return { ok: false, error: own.error };
  if (!isKnownFactKey(factKey)) return { ok: false, error: "Unknown field." };

  const snap = await snapshotBrief(own.brief.id, {
    expectedVersion: own.brief.currentVersion,
    reason: "user_edit",
    createdBy: own.userId,
  });
  if (!snap.ok) return { ok: false, error: snap.error };

  const result = await deleteFact(own.brief.id, factKey);
  if (!result.ok) return { ok: false, error: "Could not remove that." };

  revalidatePath(BRIEF_PATH);
  return { ok: true };
}

/**
 * Drop everything the AI produced, keep everything the user said.
 *
 * The button that makes the inference layer safe to offer at all.
 */
export async function resetBriefAiUnderstanding(): Promise<BriefActionResult> {
  const own = await requireOwnBrief();
  if (!own.ok) return { ok: false, error: own.error };

  const result = await resetAiUnderstanding(
    own.brief.id,
    own.userId,
    own.brief.currentVersion,
  );
  if (!result.ok) return { ok: false, error: result.error };

  revalidatePath(BRIEF_PATH);
  return { ok: true };
}

export async function restoreBrief(version: number): Promise<BriefActionResult> {
  const own = await requireOwnBrief();
  if (!own.ok) return { ok: false, error: own.error };
  if (!Number.isInteger(version) || version < 1) {
    return { ok: false, error: "Unknown version." };
  }

  const result = await restoreBriefVersion(own.brief.id, version, own.userId);
  if (!result.ok) return { ok: false, error: result.error };

  revalidatePath(BRIEF_PATH);
  return { ok: true };
}

/**
 * Archive the current brief so the next conversation starts clean.
 *
 * Archive, not delete: the versions are the record of what someone told us, and
 * "start over" is not a request to forget.
 */
export async function startNewDiscoverySession(): Promise<BriefActionResult> {
  const own = await requireOwnBrief();
  if (!own.ok) return { ok: false, error: own.error };

  const snap = await snapshotBrief(own.brief.id, {
    expectedVersion: own.brief.currentVersion,
    reason: "repositioning",
    createdBy: own.userId,
  });
  if (!snap.ok) return { ok: false, error: snap.error };

  const archived = await archiveBrief(own.brief.id);
  if (!archived.ok) return { ok: false, error: "Could not start a new session." };

  revalidatePath(BRIEF_PATH);
  return { ok: true };
}
