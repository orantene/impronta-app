import type { SupabaseClient } from "@supabase/supabase-js";
import { after } from "next/server";
import { rebuildAiSearchDocument } from "@/lib/ai/rebuild-ai-search-document";
import { logServerError } from "@/lib/server/safe-error";

/**
 * P1 PERFORMANCE RESCUE — deferred + coalesced AI/search rebuild.
 *
 * Previously this `await`ed `rebuildAiSearchDocument` IN-REQUEST, so a
 * profile save / taxonomy mutation blocked on ~8 sequential queries +
 * a trigger-heavy `talent_profiles` UPDATE — and a save touching N
 * taxonomy slugs paid that cost N times serially (the 10s–60s symptom).
 *
 * Now:
 *  - The caller's `await` returns immediately (we do NOT block the
 *    edit/mutation response on the rebuild).
 *  - The actual rebuild runs via Next's `after()` — AFTER the response
 *    is flushed — so profile data is saved fast and search catches up
 *    out of band.
 *  - Multiple calls for the same profile inside one request/burst are
 *    COALESCED to a single rebuild (a save touching 4 slugs ⇒ 1 rebuild,
 *    not 4).
 *  - Logs `scheduled | coalesced | start | done(ms) | failed` so the
 *    schedule-vs-complete lifecycle is observable.
 *
 * Same exported name + signature as before — every caller (taxonomy
 * service, translation service, field values, admin-talent, onboarding,
 * dyn-field sync) inherits the fix with zero changes.
 */

const LOG = "[ai-search]";

// Module-scoped (per server instance). An id is "pending" from the
// moment it's scheduled until its deferred rebuild actually starts.
// Calls that arrive while an id is pending are coalesced away. We clear
// the id at the START of the rebuild so an edit that lands *during* an
// in-flight rebuild still schedules a fresh follow-up (no lost final
// state — eventual consistency).
const pending = new Set<string>();

function runDeferredRebuild(supabase: SupabaseClient, talentProfileId: string) {
  // Allow a subsequent edit (arriving during this rebuild) to schedule
  // another pass.
  pending.delete(talentProfileId);
  const startedAt = Date.now();
  console.info(`${LOG} rebuild start profile=${talentProfileId}`);
  return rebuildAiSearchDocument(supabase, talentProfileId)
    .then(({ error }) => {
      const ms = Date.now() - startedAt;
      if (error) {
        logServerError(
          "scheduleRebuildAiSearchDocument",
          new Error(error),
        );
        console.warn(
          `${LOG} rebuild FAILED profile=${talentProfileId} (${ms}ms): ${error}`,
        );
      } else {
        console.info(
          `${LOG} rebuild done profile=${talentProfileId} (${ms}ms)`,
        );
      }
    })
    .catch((e) => {
      logServerError("scheduleRebuildAiSearchDocument", e);
      console.warn(
        `${LOG} rebuild THREW profile=${talentProfileId}: ${String(e)}`,
      );
    });
}

/**
 * Schedule (deferred, coalesced) a rebuild of `ai_search_document` for a
 * talent. Returns immediately — never blocks the caller on the rebuild.
 * Never throws.
 */
export async function scheduleRebuildAiSearchDocument(
  supabase: SupabaseClient,
  talentProfileId: string,
): Promise<void> {
  if (!talentProfileId) return;

  // Coalesce: a save touching multiple slugs calls this several times in
  // one request — only the first schedules; the rest are no-ops.
  if (pending.has(talentProfileId)) {
    console.info(
      `${LOG} coalesced (already pending) profile=${talentProfileId}`,
    );
    return;
  }
  pending.add(talentProfileId);
  console.info(`${LOG} scheduled profile=${talentProfileId}`);

  try {
    // Preferred: run after the response is flushed (correct for
    // serverless — Next keeps the invocation alive for `after`).
    after(() => runDeferredRebuild(supabase, talentProfileId));
  } catch {
    // No request scope (e.g. a script / non-request context): fall back
    // to a detached promise so we still never block the caller. In a
    // long-lived process this completes; logging still applies.
    void runDeferredRebuild(supabase, talentProfileId);
  }
}
