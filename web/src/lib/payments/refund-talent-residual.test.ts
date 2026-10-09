import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  flagTalentResidual,
  isTalentResidualAttention,
  talentResidualAmount,
  talentResidualNote,
} from "./refund-talent-residual";

type Row = { id: string; metadata: Record<string, unknown>; currency: string; provider_refund_id: string };

/** Recording fake of the booking_transactions table: select(..).eq(..).maybeSingle() and update(..).eq("id", ..). */
function fake(rows: Row[]) {
  const updates: Array<{ id: string; metadata: Record<string, unknown> }> = [];
  return {
    updates,
    admin: {
      from: (_t: string) => ({
        select: () => {
          const filters: Record<string, unknown> = {};
          const q: any = {
            eq: (k: string, v: unknown) => { filters[k] = v; return q; },
            maybeSingle: async () => ({ data: rows.find((r) => Object.entries(filters).every(([k, v]) => (r as any)[k] === v)) ?? null, error: null }),
          };
          return q;
        },
        update: (patch: { metadata: Record<string, unknown> }) => ({
          eq: async (_k: string, id: string) => {
            updates.push({ id, metadata: patch.metadata });
            const r = rows.find((x) => x.id === id);
            if (r) r.metadata = patch.metadata;
            return { error: null };
          },
        }),
      }),
    },
  };
}

const base = { parentTransactionId: "f15c22ff", refundId: "re_1", refundAmountCents: 30_000, residualCents: 30_000 };

describe("owner-talent partial refund after the talent leg transferred (paid run #2, 2026-10-09)", () => {
  it("stamps the refund row with what a person must recover, in the row's currency", async () => {
    const f = fake([{ id: "6b1da7f5", metadata: { a: 1 }, currency: "mxn", provider_refund_id: "re_1" }]);
    const res = await flagTalentResidual(f.admin, base);
    assert.equal(res.ok, true);
    assert.equal(f.updates.length, 1);
    const m = f.updates[0].metadata;
    assert.equal(m.needs_attention, "talent_residual");
    assert.equal(m.talent_residual_cents, 30_000);
    assert.equal(m.a, 1, "existing metadata is kept");
    assert.match(String(m.needs_attention_note), /Talent leg already paid out; recover .*300.* MXN manually/);
    assert.equal(isTalentResidualAttention(m), true);
    assert.equal(talentResidualAmount(m), 30_000, "the amount is data, so each locale renders its own sentence");
  });

  it("is idempotent: a re-delivery does not re-stamp", async () => {
    const f = fake([{ id: "x", metadata: {}, currency: "MXN", provider_refund_id: "re_1" }]);
    await flagTalentResidual(f.admin, base);
    await flagTalentResidual(f.admin, base);
    assert.equal(f.updates.length, 1);
  });

  it("does nothing when there is no residual", async () => {
    const f = fake([{ id: "x", metadata: {}, currency: "MXN", provider_refund_id: "re_1" }]);
    const res = await flagTalentResidual(f.admin, { ...base, residualCents: 0 });
    assert.equal(res.ok, true);
    assert.equal(f.updates.length, 0);
  });

  it("never invents a currency: a refund row without one is not stamped", async () => {
    const f = fake([{ id: "x", metadata: {}, currency: "", provider_refund_id: "re_1" }]);
    const res = await flagTalentResidual(f.admin, base);
    assert.equal(res.ok, false);
    assert.equal(f.updates.length, 0);
  });

  it("formats zero-decimal currencies without dividing by 100", () => {
    assert.match(talentResidualNote(5000, "JPY"), /5,000 JPY/);
  });

  it("the partial-refund handler calls it, and the Refunds tab renders it", () => {
    const refunds = readFileSync(new URL("./refunds.ts", import.meta.url), "utf8");
    assert.match(refunds, /if \(clawback\.talentResidualCents > 0\) \{[\s\S]{0,300}await flagTalentResidual\(sb,/);
    const tabs = readFileSync(new URL("../../app/(workspace)/[tenantSlug]/admin/payments/payments-tabs.tsx", import.meta.url), "utf8");
    assert.match(tabs, /r\.talentResidualCents != null/);
    assert.match(tabs, /t\("refundRecoverDetail"\)/);
    assert.doesNotMatch(tabs, /r\.talentResidualNote/);
    for (const l of ["en", "es", "fr"]) assert.match(readFileSync(new URL(`../../../messages/${l}.json`, import.meta.url), "utf8"), /"refundRecoverDetail":/);
    assert.match(readFileSync(new URL("../../../messages/es.json", import.meta.url), "utf8"), /"Recuperar del talento"/);
  });
});
