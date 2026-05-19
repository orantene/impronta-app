/**
 * Characterization — the result/error SHAPES the server-action layer
 * returns. Companion to `result.test.ts` (which pins `ServerActionResult`).
 *
 * Two families flow out of `src/lib/server-actions/**`:
 *  1. `EngineResult` — `client-pipeline.ts` / `talent-pipeline.ts` receive
 *     this from the inquiry engine and (per their header docs) "translate
 *     `EngineResult` to a flat `{ ok, error }` shape".
 *  2. Documented INTENTIONAL DIVERGENCES from canonical `ServerActionResult`
 *     declared inside the action modules themselves (`ClientActionResult`,
 *     `AdminClientProfileActionState`).
 *
 * Type-only imports — this file pins the contract, NOT engine behavior
 * (engine characterization is a separate workstream/owner). Compile-time
 * proofs are the real contract; runtime assertions are light, mirroring
 * `result.test.ts`.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import type {
  EngineResult,
  EngineOk,
  EngineErr,
} from "@/lib/inquiry/inquiry-engine.types";
import type { ClientActionResult } from "./client-pipeline";
import type { AdminClientProfileActionState } from "./admin-clients";

// ── compile-time helpers ───────────────────────────────────────────────────
function expectType<T>(_v: T): void {
  /* compile-time only */
}

// ─────────────────────────────────────────────────────────────────────────
// EngineResult — discriminated on `success` (NOT `ok`, unlike ServerActionResult)
// ─────────────────────────────────────────────────────────────────────────

describe("EngineResult shape", () => {
  it("QUIRK: discriminant is `success`, not `ok` — diverges from ServerActionResult", () => {
    const ok: EngineResult = { success: true };
    const err: EngineResult = { success: false };
    assert.equal(ok.success, true);
    assert.equal(err.success, false);
  });

  it("EngineOk: data/already/notificationErrors are all optional", () => {
    // The bare success object is valid (no data payload required).
    expectType<EngineOk>({ success: true });
    const full: EngineOk<{ bookingId: string }> = {
      success: true,
      data: { bookingId: "b1" },
      already: true,
      notificationErrors: [new Error("email bounced")],
    };
    assert.equal(full.success, true);
    assert.equal(full.already, true);
    assert.equal(full.data?.bookingId, "b1");
    assert.ok(full.notificationErrors?.[0] instanceof Error);
  });

  it("EngineErr: every diagnostic field is optional — a bare {success:false} is valid", () => {
    expectType<EngineErr>({ success: false });
    const err: EngineErr = {
      success: false,
      reason: "version_conflict",
      forbidden: true,
      conflict: true,
      rateLimited: true,
      retryAfterMs: 1500,
      error: "human readable",
    };
    assert.equal(err.success, false);
    assert.equal(err.reason, "version_conflict");
    assert.equal(err.retryAfterMs, 1500);
  });

  it("EngineErr.shortfall rows carry the requirement-group drilldown contract", () => {
    const err: EngineErr = {
      success: false,
      reason: "requirement_groups_unfulfilled",
      shortfall: [
        {
          group_id: "g1",
          role_key: "model",
          quantity_required: 3,
          approved_count: 1,
          shortfall: 2,
        },
      ],
    };
    if (!err.success) {
      assert.equal(err.shortfall?.[0]?.shortfall, 2);
      assert.equal(
        (err.shortfall?.[0]?.quantity_required ?? 0) -
          (err.shortfall?.[0]?.approved_count ?? 0),
        err.shortfall?.[0]?.shortfall,
      );
    }
  });

  it("runtime narrowing on `success` exposes the right half", () => {
    const results: EngineResult<{ id: string }>[] = [
      { success: true, data: { id: "x" } },
      { success: false, reason: "forbidden", forbidden: true },
    ];
    for (const r of results) {
      if (r.success) {
        expectType<{ id: string } | undefined>(r.data);
        assert.equal(r.data?.id, "x");
      } else {
        // @ts-expect-error — `data` does not exist on the error half
        void r.data;
        assert.equal(r.forbidden, true);
      }
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Documented INTENTIONAL DIVERGENCES (these are quirks-by-design, pinned)
// ─────────────────────────────────────────────────────────────────────────

describe("ClientActionResult (client-pipeline.ts) — divergence is intentional", () => {
  it("success branch carries NO `data` (vs ServerActionResult.data)", () => {
    const ok: ClientActionResult = { ok: true };
    const bad: ClientActionResult = { ok: false, error: "Not your inquiry." };
    assert.equal(ok.ok, true);
    if (!bad.ok) assert.equal(bad.error, "Not your inquiry.");
    // @ts-expect-error — success half is exactly `{ ok: true }`, no data key
    void (ok as { ok: true }).data;
  });
});

describe("AdminClientProfileActionState (admin-clients.ts) — useFormState shape", () => {
  it("QUIRK: flat error/success/message + create-result fields, NOT { ok, data }; `undefined` is a valid state", () => {
    const initial: AdminClientProfileActionState = undefined;
    assert.equal(initial, undefined);

    const errState: AdminClientProfileActionState = { error: "Not configured." };
    assert.equal(errState?.error, "Not configured.");

    const created: AdminClientProfileActionState = {
      success: true,
      message: "Client login created.",
      createdUserId: "u1",
      temporaryPassword: "pw",
      createdDisplayName: "Mara",
      createdCompanyName: null,
      createdEmail: "mara@example.com",
      createdPhone: null,
    };
    // Success + payload coexist on ONE flat object (the divergence the
    // module header documents) — no nested `data`.
    assert.equal(created?.success, true);
    assert.equal(created?.createdCompanyName, null);
    if (created) {
      // @ts-expect-error — there is no canonical `data` envelope here
      void created.data;
    }
  });
});
