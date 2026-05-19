/**
 * CHARACTERIZATION TEST — pitch-engine.ts (DB-free branches only)
 *
 * Phase 0 safety-net (remediation-plan-2026-05-19 §3 + §5). The pitch
 * engine is DB-bound; per the lane scope we characterize ONLY the
 * branches that return BEFORE any Supabase access:
 *
 *   - createPitchDraft  — the two input guards (tenant / actor) that
 *                          short-circuit before filterPublishableTalentIds.
 *   - loadPitchByToken  — the verifyPitchToken result→reason mapping that
 *                          short-circuits before the `pitches` read.
 *   - the 5 token-gated public actions (recordPitchView / removeTalent /
 *     approve / decline / convert) — each delegates to loadPitchByToken
 *     and returns its failure VERBATIM before touching the DB.
 *
 * The DB is not mocked — a tripwire Proxy throws on ANY property access.
 * These engine fns are NOT wrapped in runWithEngineLog, so a tripwire
 * hit PROPAGATES as a thrown error (assert.rejects), exactly like Lane
 * E's createInquiryFromIntent net.
 *
 * Snapshots CURRENT behavior incl. quirks. Nothing is fixed here.
 * Run: npx tsx --test src/lib/pitch/pitch-engine.test.ts
 */

import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";

// signPitchToken is read lazily; PREVIEW_JWT_SECRET must exist before the
// first sign/verify. Mirrors src/lib/pitch/pitch-share-token.test.ts.
if (!process.env.PREVIEW_JWT_SECRET) {
  process.env.PREVIEW_JWT_SECRET =
    "test-secret-test-secret-test-secret-test-secret-min-32-chars";
}

import {
  approvePitch,
  cancelPitch,
  convertPitchToInquiry,
  createPitchDraft,
  declinePitch,
  loadPitchByToken,
  recordPitchView,
  removeTalentFromPitch,
  sendPitch,
  updatePitchDraft,
} from "./pitch-engine";
import { signPitchToken } from "./pitch-share-token";

// Any property access throws. If a path under test touched the DB the
// test would throw (caught by assert.rejects) instead of returning the
// expected DB-free shape.
const DB_TRIPWIRE = "DB MUST NOT be touched on a pre-DB branch";
const tripwireSupabase = new Proxy(
  {},
  {
    get() {
      throw new Error(DB_TRIPWIRE);
    },
  },
) as unknown as SupabaseClient;

const baseClaims = {
  tenantId: "11111111-1111-1111-1111-111111111111",
  pitchId: "22222222-2222-2222-2222-222222222222",
  shareTokenId: "33333333-3333-3333-3333-333333333333",
  issuerProfileId: "44444444-4444-4444-4444-444444444444",
};

// ─────────────────────────────────────────────────────────────────────────────
// createPitchDraft — the two pre-DB input guards
// ─────────────────────────────────────────────────────────────────────────────

describe("createPitchDraft — pre-DB input guards", () => {
  it("falsy tenantId → { ok:false, reason:'tenant_not_found' } and NO DB access", async () => {
    const res = await createPitchDraft(tripwireSupabase, {
      tenantId: "",
      actorUserId: "actor-1",
      talentProfileIds: [],
    });
    assert.deepEqual(res, { ok: false, reason: "tenant_not_found" });
  });

  it("tenantId set, falsy actorUserId → { ok:false, reason:'not_authenticated' } and NO DB access", async () => {
    const res = await createPitchDraft(tripwireSupabase, {
      tenantId: "ten-1",
      actorUserId: "",
      talentProfileIds: [],
    });
    assert.deepEqual(res, { ok: false, reason: "not_authenticated" });
  });

  it("ORDER: tenant guard wins when BOTH tenantId and actorUserId are falsy", async () => {
    const res = await createPitchDraft(tripwireSupabase, {
      tenantId: "",
      actorUserId: "",
      talentProfileIds: [],
    });
    assert.deepEqual(res, { ok: false, reason: "tenant_not_found" });
  });

  it("CONTRACT PIN: a VALID tenant+actor has NO further DB-free exit — filterPublishableTalentIds reads the DB immediately (fail loud if a refactor adds a pure pre-flight here)", async () => {
    await assert.rejects(
      () =>
        createPitchDraft(tripwireSupabase, {
          tenantId: "ten-1",
          actorUserId: "actor-1",
          talentProfileIds: ["tp-1"],
        }),
      new RegExp(DB_TRIPWIRE),
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// loadPitchByToken — the verifyPitchToken result→reason mapping (pre-DB)
// ─────────────────────────────────────────────────────────────────────────────

describe("loadPitchByToken — token-verify mapping is DB-free", () => {
  it("structurally-garbage token → { ok:false, reason:'token_invalid' } (message is the raw verify reason) and NO DB access", async () => {
    const res = await loadPitchByToken(tripwireSupabase, "not.a.jwt");
    assert.equal(res.ok, false);
    assert.equal(res.ok === false && res.reason, "token_invalid");
    // Existing pitch-share-token.test.ts pins this raw reason as either
    // — the engine forwards it verbatim into `message`.
    assert.ok(
      res.ok === false &&
        ["malformed", "bad_signature"].includes(String(res.message)),
    );
  });

  it("empty-string token → token_invalid, NO DB access", async () => {
    const res = await loadPitchByToken(tripwireSupabase, "");
    assert.equal(res.ok, false);
    assert.equal(res.ok === false && res.reason, "token_invalid");
  });

  it("tampered (valid-shape, flipped body char) token → deterministic { ok:false, reason:'token_invalid', message:'bad_signature' } and NO DB access", async () => {
    const signed = signPitchToken(baseClaims);
    const parts = signed.token.split(".");
    const tampered = `${parts[0]}.${parts[1].slice(0, -1)}X.${parts[2]}`;
    const res = await loadPitchByToken(tripwireSupabase, tampered);
    assert.deepEqual(res, {
      ok: false,
      reason: "token_invalid",
      message: "bad_signature",
    });
  });

  it("CONTRACT PIN: a VALID token has NO DB-free exit — loadPitchByToken reads `pitches` immediately after verify (fail loud if a refactor moves the read)", async () => {
    const signed = signPitchToken(baseClaims);
    await assert.rejects(
      () => loadPitchByToken(tripwireSupabase, signed.token),
      new RegExp(DB_TRIPWIRE),
    );
  });

  it.skip("OBSERVATION: the 'token_expired' branch (verify.reason==='expired' → reason:'token_expired') is UNREACHABLE in a unit test — signPitchToken clamps TTL to ≥1h (SHARE_JWT_MIN_TTL_SECONDS), so no genuinely-expired token can be minted without time-mocking. Not a bug; a test-env limitation already documented in pitch-share-token.test.ts. Refactor owner: cover via the underlying verifyShareJwt unit tests or a clock injection.", () => {
    // Intentionally empty — documents an uncoverable mapping branch so the
    // safety-net explicitly records the gap rather than silently omitting it.
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Token-gated public actions — all 5 short-circuit on loadPitchByToken
// failure and return it VERBATIM, before any DB access.
// ─────────────────────────────────────────────────────────────────────────────

describe("token-gated public actions return the loadPitchByToken failure verbatim, DB-free", () => {
  const garbage = "not.a.jwt";

  it("recordPitchView(garbage) → token_invalid, NO DB access", async () => {
    const res = await recordPitchView(tripwireSupabase, { token: garbage });
    assert.equal(res.ok, false);
    assert.equal(res.ok === false && res.reason, "token_invalid");
  });

  it("removeTalentFromPitch(garbage) → token_invalid, NO DB access", async () => {
    const res = await removeTalentFromPitch(tripwireSupabase, {
      token: garbage,
      talentProfileId: "tp-1",
    });
    assert.equal(res.ok, false);
    assert.equal(res.ok === false && res.reason, "token_invalid");
  });

  it("approvePitch(garbage) → token_invalid, NO DB access", async () => {
    const res = await approvePitch(tripwireSupabase, { token: garbage });
    assert.equal(res.ok, false);
    assert.equal(res.ok === false && res.reason, "token_invalid");
  });

  it("declinePitch(garbage) → token_invalid, NO DB access", async () => {
    const res = await declinePitch(tripwireSupabase, { token: garbage });
    assert.equal(res.ok, false);
    assert.equal(res.ok === false && res.reason, "token_invalid");
  });

  it("convertPitchToInquiry(garbage) → token_invalid, NO DB access (and submitInquiry is never reached)", async () => {
    const res = await convertPitchToInquiry(tripwireSupabase, {
      token: garbage,
    });
    assert.equal(res.ok, false);
    assert.equal(res.ok === false && res.reason, "token_invalid");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// CONTRACT PIN — the admin-only actions have NO DB-free pre-flight; their
// first observable effect is a DB read. Pinned so a refactor that adds a
// pure guard (or reorders) is forced to update this net.
// ─────────────────────────────────────────────────────────────────────────────

describe("CONTRACT PIN: admin pitch actions touch the DB as their first effect", () => {
  it("updatePitchDraft reads `pitches` immediately (no pure pre-flight)", async () => {
    await assert.rejects(
      () =>
        updatePitchDraft(tripwireSupabase, {
          tenantId: "ten-1",
          pitchId: "pit-1",
          actorUserId: "actor-1",
        }),
      new RegExp(DB_TRIPWIRE),
    );
  });

  it("sendPitch reads `pitches` immediately (no pure pre-flight)", async () => {
    await assert.rejects(
      () =>
        sendPitch(tripwireSupabase, {
          tenantId: "ten-1",
          pitchId: "pit-1",
          actorUserId: "actor-1",
          channel: "whatsapp",
        }),
      new RegExp(DB_TRIPWIRE),
    );
  });

  it("cancelPitch reads `pitches` immediately (no pure pre-flight)", async () => {
    await assert.rejects(
      () =>
        cancelPitch(tripwireSupabase, {
          tenantId: "ten-1",
          pitchId: "pit-1",
          actorUserId: "actor-1",
        }),
      new RegExp(DB_TRIPWIRE),
    );
  });
});
