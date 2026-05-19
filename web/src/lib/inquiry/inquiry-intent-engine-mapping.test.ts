/**
 * CHARACTERIZATION TEST — inquiry-intent-engine.ts (result-mapping + draft CRUD)
 *
 * Phase 0 safety-net (remediation-plan-2026-05-19 §3 line 51 + §5).
 *
 * COMPLEMENT, NOT A DUPLICATE: src/lib/inquiry/inquiry-intent.test.ts
 * already pins the pure validators/adapters AND the one createInquiryFromIntent
 * branch that returns BEFORE any DB (validation failure). Its header explicitly
 * scopes itself to that branch only. This file pins the OTHER half of
 * createInquiryFromIntent — what happens to a VALID intent once it reaches the
 * engine — plus the draft-CRUD entry points, none of which that file touches.
 *
 * WHAT THIS PINS
 *
 *   createInquiryFromIntent on a VALID intent:
 *     • result mapping submitInquiry.rateLimited  → { ok:false, reason:'rate_limited' }
 *       — reached PURELY (pre-exhausted tenant bucket; tripwire proves no DB),
 *         so the mapping is characterized without any DB mock.
 *     • result mapping submitInquiry generic error → { ok:false, reason:'engine_error', error }
 *       — reached via the caught DB tripwire; also pins the ordering invariant
 *         "validateIntentForSubmit runs BEFORE the engine/DB on the valid path".
 *     • the failure result OMITS missingInfoFlags (only the ok:true path carries it).
 *
 *   Draft CRUD (saveInquiryDraft / loadInquiryDraft / listOpenDraftsForUser /
 *   submitInquiryDraft / abandonInquiryDraft): each is DB-first with NO
 *   pre-flight and is UNWRAPPED (no runWithEngineLog), so the tripwire
 *   PROPAGATES — assert.rejects. A refactor that adds validation before the
 *   first query MUST update this net.
 *
 * Snapshots CURRENT behavior incl. quirks. Nothing is fixed here.
 * Run: npx tsx --test src/lib/inquiry/inquiry-intent-engine-mapping.test.ts
 */

import { strict as assert } from "node:assert";
import { randomUUID } from "node:crypto";
import { describe, it } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  createInquiryFromIntent,
  saveInquiryDraft,
  loadInquiryDraft,
  listOpenDraftsForUser,
  submitInquiryDraft,
  abandonInquiryDraft,
} from "./inquiry-intent-engine";
import type { InquiryIntent, IntentAdapterContext } from "./inquiry-intent";
import { rateLimiter } from "./inquiry-rate-limiter";

const DB_TRIPWIRE = "DB MUST NOT be touched on this branch";
const tripwireSupabase = new Proxy(
  {},
  {
    get() {
      throw new Error(DB_TRIPWIRE);
    },
  },
) as unknown as SupabaseClient;

const WINDOW_MS = 60 * 60_000;

/** Drive the per-tenant bucket to its 50/hr cap so submitInquiry's internal
 *  tenant check is rejected pre-DB while the (fresh) actor gate still passes. */
async function exhaustTenant(tenantId: string): Promise<void> {
  const key = `submitInquiry:tenant:${tenantId}`;
  for (let i = 0; i < 50; i++) await rateLimiter.check(key, 50, WINDOW_MS);
}

/** The minimal intent shape that passes validateIntentForSubmit (mirrors
 *  the "valid minimal intent" fixture in inquiry-intent.test.ts). */
function validIntent(tenantTag: string): InquiryIntent {
  return {
    source: "admin_created",
    requester: { name: "Jane", email: "jane@x.co" },
    brief: { summary: `Need 2 hosts ${tenantTag}` },
    location: { status: "online" },
    date: { status: "flexible" },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// createInquiryFromIntent — valid-intent result mapping.
// ─────────────────────────────────────────────────────────────────────────────

describe("createInquiryFromIntent — valid intent, rate-limited engine → reason:'rate_limited' (reached PURELY, no DB)", () => {
  it("submitInquiry's rateLimited result maps to { ok:false, reason:'rate_limited' } with NO error/missingInfoFlags, and the DB is never touched", async () => {
    const tenant_id = `ten-${randomUUID()}`;
    await exhaustTenant(tenant_id);
    // Unique authenticated actor → its own fresh 5/hr bucket, so the
    // ACTOR gate definitively passes and the per-tenant cap is
    // unambiguously the gate that blocks. No shared/guest-anon bucket
    // dependency → robust under any test-runner process model.
    const ctx: IntentAdapterContext = {
      tenant_id,
      actor_user_id: `u-${randomUUID()}`,
    };
    const res = await createInquiryFromIntent(
      tripwireSupabase,
      validIntent(tenant_id),
      ctx,
    );

    assert.deepEqual(res, { ok: false, reason: "rate_limited" });
    // explicit: the rate-limited mapping carries neither field
    assert.equal(Object.prototype.hasOwnProperty.call(res, "error"), false);
    assert.equal(
      Object.prototype.hasOwnProperty.call(res, "missingInfoFlags"),
      false,
    );
  });
});

describe("createInquiryFromIntent — valid intent, generic engine error → reason:'engine_error' (validation precedes the DB)", () => {
  it("a VALID intent passes validateIntentForSubmit, reaches submitInquiry, hits the DB tripwire (caught by runWithEngineLog), and is mapped to { ok:false, reason:'engine_error', error:<tripwire> }", async () => {
    // Unique tenant + unique authenticated actor → all three rate gates
    // are fresh and pass → submitInquiry reaches its first DB site →
    // tripwire → runWithEngineLog catches it → { success:false,
    // error:<msg> } → mapped here to engine_error. Unique keys mean no
    // dependency on any shared rate-limiter bucket across test files.
    const tenant_id = `ten-${randomUUID()}`;
    const ctx: IntentAdapterContext = {
      tenant_id,
      actor_user_id: `u-${randomUUID()}`,
    };

    const res = await createInquiryFromIntent(
      tripwireSupabase,
      validIntent(tenant_id),
      ctx,
    );

    assert.deepEqual(res, {
      ok: false,
      reason: "engine_error",
      error: DB_TRIPWIRE,
    });
  });

  it("CONTRACT: an INVALID intent never reaches the engine — proven here by the SAME tripwire returning validation_failed (not engine_error) because validateIntentForSubmit short-circuits first", async () => {
    const res = await createInquiryFromIntent(
      tripwireSupabase,
      { source: "admin_created", requester: {} },
      { tenant_id: "t", actor_user_id: null },
    );
    assert.equal(res.ok, false);
    if (!res.ok) {
      assert.equal(res.reason, "validation_failed");
      // engine_error would carry `error`; validation_failed never does
      assert.equal(Object.prototype.hasOwnProperty.call(res, "error"), false);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Draft CRUD — DB is the first effect, UNWRAPPED → tripwire propagates.
// ─────────────────────────────────────────────────────────────────────────────

describe("draft CRUD — DB is the first effect (no pre-flight; unwrapped → throws)", () => {
  const intent = validIntent("draft");
  const saveCtx = {
    tenant_id: "t",
    requester_user_id: null,
    requester_email: null,
  };

  it("saveInquiryDraft (create path, draftId=null) → throws on the inquiry_drafts insert", async () => {
    await assert.rejects(
      () => saveInquiryDraft(tripwireSupabase, null, intent, saveCtx),
      new RegExp(DB_TRIPWIRE),
    );
  });

  it("saveInquiryDraft (update path, draftId set) → throws on the inquiry_drafts update", async () => {
    await assert.rejects(
      () => saveInquiryDraft(tripwireSupabase, "draft-1", intent, saveCtx),
      new RegExp(DB_TRIPWIRE),
    );
  });

  it("loadInquiryDraft → throws on the inquiry_drafts select (the catch only handles a returned {error}, never a thrown one)", async () => {
    await assert.rejects(
      () => loadInquiryDraft(tripwireSupabase, "d1"),
      new RegExp(DB_TRIPWIRE),
    );
  });

  it("listOpenDraftsForUser → throws on the inquiry_drafts select", async () => {
    await assert.rejects(
      () =>
        listOpenDraftsForUser(tripwireSupabase, {
          tenant_id: "t",
          requester_user_id: "u1",
        }),
      new RegExp(DB_TRIPWIRE),
    );
  });

  it("abandonInquiryDraft → throws on the inquiry_drafts update", async () => {
    await assert.rejects(
      () => abandonInquiryDraft(tripwireSupabase, "d1"),
      new RegExp(DB_TRIPWIRE),
    );
  });

  it("QUIRK: submitInquiryDraft calls loadInquiryDraft FIRST — the tripwire thrown there PROPAGATES; it is NOT converted to the { ok:false, reason:'forbidden' } that a returned load failure would produce", async () => {
    await assert.rejects(
      () =>
        submitInquiryDraft(tripwireSupabase, "d1", { actor_user_id: "u1" }),
      new RegExp(DB_TRIPWIRE),
    );
  });

  it.skip("OBSERVATION (scope boundary for the refactor owner): the 6 inquiry-creation insert paths — createAgencyInquiry/createManualInquiry (lib/server-actions/admin-inquiries.ts), the client _actions (submitInquiryNowAction/submitDraftAction), the workspace roster bridge, the public talent-profile inquire button, and pitch-conversion — are all `\"use server\"` actions that resolve auth/session/tenant scope (DB-first) and then funnel into submitInquiry or createInquiryFromIntent. They expose NO pure pre-DB surface of their own. Their correctness reduces to: (a) the submitInquiry contract pinned in inquiry-engine-submit.test.ts, (b) the shared intentToSubmitInquiryInput adapter already exhaustively covered in inquiry-intent.test.ts, and (c) DB-bound auth/scope plumbing that is integration territory, not Lane-E unit-characterizable. The convergence invariant is therefore pinned at the engine, not per-wrapper — do not expect (or add) per-path pure coverage here.", () => {});
});
