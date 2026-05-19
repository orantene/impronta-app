/**
 * Characterization / TRIPWIRE CONTRACT — "no DB on the guard/validation-fail
 * path" for DB-bound server-action mutations.
 *
 * Mechanism (source-free tripwire): with the Supabase env vars unset,
 * `@/lib/supabase/server#createClient` returns `null` *before* it ever
 * touches `next/headers` (`isSupabaseConfigured()` gate precedes
 * `cookies()`), and `createServiceRoleClient` returns `null` likewise.
 * Every centralized guard (`requireStaff/Admin/Session/Talent/Client`)
 * therefore resolves to a clean `{ ok:false }` — `resolveDashboardIdentity`
 * also returns `null` before its `cookies()` call.
 *
 * Consequence: a DB-bound action invoked with no env MUST return a known
 * PRE-DB sentinel error and MUST NOT throw. If it instead threw a
 * null-deref / `cookies()` error, that would prove a DB/request access was
 * attempted before the guard — i.e. the tripwire fired. Resolving with a
 * pre-DB sentinel proves the guard short-circuits before any `.from()`.
 *
 * This file also pins a real cross-cutting QUIRK: the layer has **no
 * consistent guard/validation ordering** (validate-first vs auth-first vs
 * db-config-first all coexist). Behavior is characterized, not judged.
 */
import { describe, it, before } from "node:test";
import assert from "node:assert/strict";

// Self-contained: guarantee the tripwire precondition regardless of how
// the runner is launched. Server-action modules read these lazily at call
// time (inside isSupabaseConfigured()), so deleting here — before the
// dynamic imports below — is sufficient and deterministic.
before(() => {
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
});

type FlatResult = { ok: true } | { ok: false; error: string };

/** Pre-DB sentinels — every string an action can return BEFORE its first
 *  `.from()/.rpc()/.auth.admin` call. A post-DB failure ("Failed to …")
 *  would prove the DB was reached. */
const PRE_DB_SENTINELS = new Set([
  "Missing inquiry id.",
  "Missing request id.",
  "Sign in required.",
  "Not authenticated.",
  "Service unavailable.",
  "Database unavailable.",
  "Not configured.",
  "Unknown plan.",
]);

async function assertResolvesToPreDbError(
  label: string,
  call: () => Promise<FlatResult>,
): Promise<string> {
  let out: FlatResult;
  try {
    out = await call();
  } catch (err) {
    assert.fail(
      `${label}: threw instead of returning a guard-fail (tripwire FIRED — ` +
        `DB/request access attempted before the guard): ${String(err)}`,
    );
  }
  assert.equal(typeof out, "object");
  assert.equal(out.ok, false, `${label}: expected ok:false, got ${JSON.stringify(out)}`);
  if (!out.ok) {
    assert.ok(
      PRE_DB_SENTINELS.has(out.error),
      `${label}: "${out.error}" is not a pre-DB sentinel — DB may have been reached`,
    );
    return out.error;
  }
  return "";
}

// ─────────────────────────────────────────────────────────────────────────
// coord-request-actions — VALIDATE-FIRST (input check precedes auth & DB)
// ─────────────────────────────────────────────────────────────────────────

describe("coord-request-actions: pure validation-fail precedes auth/DB", () => {
  it("requestCoordinatorJoin('') → 'Missing inquiry id.' (no auth, no DB, no env needed)", async () => {
    const { requestCoordinatorJoin } = await import("./coord-request-actions");
    const e = await assertResolvesToPreDbError("requestCoordinatorJoin('')", () =>
      requestCoordinatorJoin(""),
    );
    assert.equal(e, "Missing inquiry id.");
  });

  it("requestCoordinatorJoin('iq_x') → 'Sign in required.' (auth gate, still no DB)", async () => {
    const { requestCoordinatorJoin } = await import("./coord-request-actions");
    const e = await assertResolvesToPreDbError("requestCoordinatorJoin('iq_x')", () =>
      requestCoordinatorJoin("iq_x"),
    );
    assert.equal(e, "Sign in required.");
  });

  it("approveCoordinatorJoin('') and declineCoordinatorJoin('') → 'Missing request id.'", async () => {
    const m = await import("./coord-request-actions");
    assert.equal(
      await assertResolvesToPreDbError("approveCoordinatorJoin('')", () =>
        m.approveCoordinatorJoin(""),
      ),
      "Missing request id.",
    );
    assert.equal(
      await assertResolvesToPreDbError("declineCoordinatorJoin('')", () =>
        m.declineCoordinatorJoin(""),
      ),
      "Missing request id.",
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────
// message-reactions / message-stars — AUTH-FIRST (no input validation)
// ─────────────────────────────────────────────────────────────────────────

describe("message-reactions/stars: auth gate fires; empty args NOT validated", () => {
  it("QUIRK: addReaction('','') → 'Not authenticated.' (empty messageId/emoji pass entry unchecked)", async () => {
    const { addReaction } = await import("./message-reactions");
    const e = await assertResolvesToPreDbError("addReaction('','')", () =>
      addReaction("", ""),
    );
    assert.equal(e, "Not authenticated.");
  });

  it("removeReaction('','') → 'Not authenticated.'", async () => {
    const { removeReaction } = await import("./message-reactions");
    assert.equal(
      await assertResolvesToPreDbError("removeReaction('','')", () =>
        removeReaction("", ""),
      ),
      "Not authenticated.",
    );
  });

  it("toggleMessageStar('','') → 'Not authenticated.'", async () => {
    const { toggleMessageStar } = await import("./message-stars");
    assert.equal(
      await assertResolvesToPreDbError("toggleMessageStar('','')", () =>
        toggleMessageStar("", ""),
      ),
      "Not authenticated.",
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────
// admin-billing — VALIDATE-FIRST (VALID_PLANS gate precedes requireStaff…)
// ─────────────────────────────────────────────────────────────────────────

describe("admin-billing.changeWorkspacePlan: plan validation precedes auth/DB", () => {
  it("invalid plan → 'Unknown plan.' (returns before requireStaffTenantAction)", async () => {
    const { changeWorkspacePlan } = await import("./admin-billing");
    const e = await assertResolvesToPreDbError("changeWorkspacePlan('__nope__')", () =>
      // Invalid value on purpose — exercises the pure VALID_PLANS guard.
      changeWorkspacePlan("__nope__" as unknown as Parameters<typeof changeWorkspacePlan>[0]),
    );
    assert.equal(e, "Unknown plan.");
  });
});

// ─────────────────────────────────────────────────────────────────────────
// admin-clients (form-state) — AUTH-FIRST (requireStaff precedes zod)
// ─────────────────────────────────────────────────────────────────────────

describe("admin-clients form-state: requireStaff precedes zod parse", () => {
  it("QUIRK: updateAdminClientProfile(undefined, emptyFormData) → { error:'Not configured.' } NOT a field error", async () => {
    const { updateAdminClientProfile } = await import("./admin-clients");
    const out = await updateAdminClientProfile(undefined, new FormData());
    assert.ok(out && "error" in out, `got ${JSON.stringify(out)}`);
    // Auth-first: the config/guard error wins over the (never-reached)
    // "Client name is required." / "Enter a valid email." zod messages.
    assert.equal(out?.error, "Not configured.");
  });

  it("createAdminClient(undefined, emptyFormData) → { error:'Not configured.' }", async () => {
    const { createAdminClient } = await import("./admin-clients");
    const out = await createAdminClient(undefined, new FormData());
    assert.equal(out?.error, "Not configured.");
  });
});

// ─────────────────────────────────────────────────────────────────────────
// client-pipeline — TESTABILITY BOUNDARY (not a bug; characterized as-is)
//
// `client-pipeline.ts` transitively `import "server-only"` (via
// `@/lib/bookings/transactions`). `server-only` is NOT an installed
// package — Next.js aliases it to a build-time stub. Under `tsx --test`
// (raw Node, no Next bundler) the import chain throws MODULE_NOT_FOUND at
// resolution, BEFORE any action logic runs. So its DB-config-first
// guard-fail behavior cannot be unit-characterized here. We PIN the
// boundary instead (so the next owner knows exactly why, and is alerted
// if the import graph ever changes), and skip the behavioral cases.
// ─────────────────────────────────────────────────────────────────────────

describe("client-pipeline: server-only import boundary (pinned)", () => {
  it("importing client-pipeline rejects with the server-only MODULE_NOT_FOUND boundary", async () => {
    await assert.rejects(
      () => import("./client-pipeline"),
      (err: unknown) => {
        const msg = String((err as { message?: string })?.message ?? err);
        assert.match(msg, /server-only/);
        return true;
      },
      "client-pipeline is expected to be non-loadable under tsx --test",
    );
  });

  it.skip("clientApproveCurrentOffer('') → 'Database unavailable.' — BLOCKED: server-only import boundary (see pinned test above)", async () => {
    const { clientApproveCurrentOffer } = await import("./client-pipeline");
    const e = await assertResolvesToPreDbError("clientApproveCurrentOffer('')", () =>
      clientApproveCurrentOffer(""),
    );
    assert.equal(e, "Database unavailable.");
  });

  it.skip("clientRejectCurrentOffer('iq') → 'Database unavailable.' — BLOCKED: server-only import boundary (see pinned test above)", async () => {
    const { clientRejectCurrentOffer } = await import("./client-pipeline");
    assert.equal(
      await assertResolvesToPreDbError("clientRejectCurrentOffer('iq')", () =>
        clientRejectCurrentOffer("iq"),
      ),
      "Database unavailable.",
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────
// META-QUIRK — the layer has NO consistent guard/validation ordering
// ─────────────────────────────────────────────────────────────────────────

describe("META: guard/validation ordering is inconsistent across the layer (pinned, not judged)", () => {
  it("(at least) three different orderings coexist for the same 'invalid input + no session/env' scenario", async () => {
    const { requestCoordinatorJoin } = await import("./coord-request-actions");
    const { changeWorkspacePlan } = await import("./admin-billing");
    const { addReaction } = await import("./message-reactions");
    const { updateAdminClientProfile } = await import("./admin-clients");

    // validate-first: input error surfaces despite no session/env
    const coord = await requestCoordinatorJoin("");
    assert.equal(coord.ok === false && coord.error, "Missing inquiry id.");

    // validate-first (different module, same shape of ordering)
    const billing = await changeWorkspacePlan(
      "__nope__" as unknown as Parameters<typeof changeWorkspacePlan>[0],
    );
    assert.equal(billing.ok === false && billing.error, "Unknown plan.");

    // auth-first: input never validated — auth/session error wins
    const reaction = await addReaction("", "");
    assert.equal(reaction.ok === false && reaction.error, "Not authenticated.");

    // auth-first (form-state flavor): config error, not the zod messages
    const form = await updateAdminClientProfile(undefined, new FormData());
    assert.equal(form?.error, "Not configured.");

    // A 4th ordering (db-config-first: createClient()-null before input
    // AND before auth — `client-pipeline.ts`) is real but characterized
    // separately: that module can't load here (server-only boundary,
    // pinned in the test above). Its header doc states the contract.

    // The invariant that DOES hold for every LOADABLE path above: nothing
    // threw, every path returned a pre-DB sentinel → zero DB access on
    // every guard/validation-fail path.
  });
});
