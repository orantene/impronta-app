/**
 * TUL-313: a NEW offer's currency order. participants -> solo owner-talent ->
 * workspace default -> refuse. The platform currency is never a silent default.
 * Run: NODE_OPTIONS='--require ./scripts/register-server-only-test.cjs' node_modules/.bin/tsx --test src/lib/inquiry/offer-currency-fallback.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveNewOfferCurrency } from "./offer-currency-seller";

type World = {
  participants?: Array<{ id: string; currency: string | null }>;
  workspaceType?: string;
  workspaceDefault?: string | null;
  owners?: string[];
  ownerTalentCurrency?: string | null;
  readError?: boolean;
  /** Fail one of the seller-currency fallback reads (TUL-313 fail-closed). */
  failTable?: "agencies" | "agency_memberships" | "talent_profiles";
};

function fake(w: World): SupabaseClient {
  return {
    from: (table: string) => {
      let rows: unknown[] = [];
      let error: { message: string } | null = null;
      if (table === "inquiry_participants") {
        rows = (w.participants ?? []).map((p) => ({ talent_profile_id: p.id }));
        if (w.readError) error = { message: "db down" };
      } else if (table === "agencies") {
        rows = [{ workspace_type: w.workspaceType ?? "business", default_currency: w.workspaceDefault ?? null }];
      } else if (table === "agency_memberships") {
        rows = (w.owners ?? []).map((id) => ({ profile_id: id }));
      } else if (table === "talent_profiles") {
        rows = (w.participants ?? []).map((p) => ({ id: p.id, default_currency: p.currency, stripe_account_platform: null }));
      }
      if (w.failTable === table) error = { message: "db down" };
      const b: Record<string, unknown> = {};
      for (const m of ["select", "eq", "in", "is", "limit"]) b[m] = () => b;
      // participants lookup awaits the builder (.in); the owner lookup uses maybeSingle()
      b.maybeSingle = async () =>
        table === "talent_profiles"
          ? { data: error ? null : { default_currency: w.ownerTalentCurrency ?? null }, error }
          : { data: rows[0] ?? null, error };
      b.then = (resolve: (v: { data: unknown[] | null; error: unknown }) => unknown) =>
        resolve({ data: error ? null : rows, error });
      return b;
    },
  } as unknown as SupabaseClient;
}

const run = (w: World) =>
  resolveNewOfferCurrency(fake(w), { inquiryId: "i1", tenantId: "t1", explicitCurrency: "USD", followSeller: true });

describe("new offer currency order (TUL-313)", () => {
  it("1. active talent participant wins, even over the solo owner and the workspace default", async () =>
    assert.equal(
      await run({
        participants: [{ id: "a", currency: "MXN" }],
        workspaceType: "talent",
        owners: ["u1"],
        ownerTalentCurrency: "USD",
        workspaceDefault: "USD",
      }),
      "MXN",
    ));
  it("2. no participant, solo talent workspace -> the owner-talent's currency", async () =>
    assert.equal(
      await run({ workspaceType: "talent", owners: ["u1"], ownerTalentCurrency: "mxn", workspaceDefault: "USD" }),
      "MXN",
    ));
  it("2. not solo (two owners) skips the owner step", async () =>
    assert.equal(
      await run({ workspaceType: "talent", owners: ["u1", "u2"], ownerTalentCurrency: "MXN", workspaceDefault: "EUR" }),
      "EUR",
    ));
  it("2. business workspace skips the owner step", async () =>
    assert.equal(
      await run({ workspaceType: "business", owners: ["u1"], ownerTalentCurrency: "MXN", workspaceDefault: "EUR" }),
      "EUR",
    ));
  it("3. no participant, owner currency unknown -> agencies.default_currency", async () =>
    assert.equal(
      await run({ workspaceType: "talent", owners: ["u1"], ownerTalentCurrency: null, workspaceDefault: "MXN" }),
      "MXN",
    ));
  it("3. participants disagree -> workspace default, not platform", async () =>
    assert.equal(
      await run({ participants: [{ id: "a", currency: "MXN" }, { id: "b", currency: "USD" }], workspaceDefault: "MXN" }),
      "MXN",
    ));
  it("4. nothing resolvable -> null (refuse)", async () => assert.equal(await run({}), null));
  it("4. a participant read error -> null (refuse), never a guess", async () =>
    assert.equal(await run({ readError: true, workspaceDefault: "MXN" }), null));
  it("followSeller=false returns only the explicit currency", async () => {
    assert.equal(
      await resolveNewOfferCurrency(fake({}), { inquiryId: "i1", tenantId: "t1", explicitCurrency: "eur", followSeller: false }),
      "EUR",
    );
    assert.equal(await resolveNewOfferCurrency(fake({}), { inquiryId: "i1", tenantId: "t1", followSeller: false }), null);
  });
});

describe("the platform currency is never a silent default (TUL-313)", () => {
  it("resolveNewOfferCurrency has no platform/USD fallback", () => {
    const src = readFileSync(new URL("./offer-currency-seller.ts", import.meta.url), "utf8");
    const start = src.indexOf("export async function resolveNewOfferCurrency");
    const fn = src.slice(start, src.indexOf("export const SELLER_CURRENCY_UNREADABLE"));
    assert.ok(start > 0);
    assert.doesNotMatch(fn, /platformCurrency|PLATFORM_FALLBACK|"USD"/);
  });
  it("createOffer refuses when the currency cannot be resolved", () => {
    const src = readFileSync(new URL("./inquiry-engine-offers.ts", import.meta.url), "utf8");
    assert.match(src, /if \(!offerCurrency\) return \{ success: false, reason: "offer_currency_unresolved" \}/);
  });
});

describe("offer_currency_unresolved has a user-facing message in every layer (TUL-313)", () => {
  const WEB = new URL("../../../", import.meta.url);
  const json = (loc: string) => JSON.parse(readFileSync(new URL(`messages/${loc}.json`, WEB), "utf8"));
  const dig = (o: unknown, path: string[]): unknown => path.reduce<unknown>((a, k) => (a as Record<string, unknown> | undefined)?.[k], o);

  it("maps to its own sentence in en, es and fr, next to the seller-mismatch one", () => {
    for (const loc of ["en", "es", "fr"]) {
      const m = json(loc);
      for (const base of [["dashboard", "scheduling", "engine", "refusal"], ["dashboard", "pos", "messages", "refusal"]]) {
        const node = dig(m, base) as Record<string, string> | undefined;
        assert.ok(node?.offer_currency_seller_mismatch, `${loc} ${base.join(".")} has the sibling`);
        const msg = node?.offer_currency_unresolved;
        assert.ok(typeof msg === "string" && msg.length > 10, `${loc} ${base.join(".")} message`);
        assert.notEqual(msg, node?.offer_currency_seller_mismatch);
        assert.doesNotMatch(msg, /—/, "no em dash");
      }
    }
  });

  it("the scheduling and messaging refusal tables carry the code and its key", async () => {
    const { SCHEDULING_ENGINE_REFUSALS, SCHEDULING_ENGINE_REFUSAL_CODES } = await import("../scheduling/engine-refusals");
    assert.ok((SCHEDULING_ENGINE_REFUSAL_CODES as readonly string[]).includes("offer_currency_unresolved"));
    assert.equal(SCHEDULING_ENGINE_REFUSALS.offer_currency_unresolved, "dashboard.scheduling.engine.refusal.offer_currency_unresolved");
    const { MESSAGING_REFUSAL_CODES, refusalKey, isMessagingRefusal } = await import("../messaging/refusals");
    assert.ok(isMessagingRefusal("offer_currency_unresolved"));
    assert.ok((MESSAGING_REFUSAL_CODES as readonly string[]).includes("offer_currency_unresolved"));
    assert.equal(refusalKey("offer_currency_unresolved"), "dashboard.pos.messages.refusal.offer_currency_unresolved");
  });

  it("the offer send path maps the engine reason to that code, not the generic unavailable", () => {
    const src = readFileSync(new URL("src/lib/server-actions/messaging-offers.ts", WEB), "utf8");
    assert.match(src, /result\.reason === "offer_currency_unresolved"\) return fail\("offer_currency_unresolved"\)/);
  });
});

describe("a read ERROR refuses instead of falling through (fail closed)", () => {
  const solo = { participants: [], workspaceType: "talent", owners: ["u1"], ownerTalentCurrency: "MXN", workspaceDefault: "USD" } as const;
  it("agencies read fails: refuse, never the workspace default", async () =>
    assert.equal(await run({ ...solo, owners: [...solo.owners], participants: [], failTable: "agencies" }), null));
  it("owner memberships read fails: refuse", async () =>
    assert.equal(await run({ ...solo, owners: [...solo.owners], participants: [], failTable: "agency_memberships" }), null));
  it("owner talent read fails: refuse, not USD from the workspace", async () =>
    assert.equal(await run({ ...solo, owners: [...solo.owners], participants: [], failTable: "talent_profiles" }), null));
  it("no error and no solo currency still falls to the workspace default", async () =>
    assert.equal(await run({ participants: [], workspaceType: "business", workspaceDefault: "MXN" }), "MXN"));
});
