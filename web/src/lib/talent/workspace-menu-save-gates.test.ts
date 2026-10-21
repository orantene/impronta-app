/**
 * TUL-1634: a workspace Menu save goes through the same publish-readiness +
 * plan gate, MXN/USD rule, site cache bust and AI search rebuild as a talent
 * service save. Delete, archive and reorder bust + rebuild too; a side-effect
 * failure never loses the stored write.
 * Run: cd web && npm run test:wt -- src/lib/talent/workspace-menu-save-gates.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";

import { INSTANT_PLAN_REFUSAL_EN } from "@/lib/talent/instant-plan-gate";
import {
  OFFERING_CURRENCY_REFUSAL_EN,
  OFFERING_CURRENCY_REFUSAL_ES,
  offeringCurrencyRefusal,
  offeringSaveGate,
  workspaceOfferingSaveGate,
  type OfferingSaveGateDeps,
} from "@/lib/talent/offering-save-gate.server";
import { blankOffering, type TalentOffering } from "@/lib/talent/offerings-types";
import { runMenuWriteSideEffects, type MenuSideEffectDeps, type MenuWriteKind } from "@/lib/talent/workspace-menu-side-effects";

// ---- typed in-memory fake (FakeQuery shape) ---------------------------------

type Row = Record<string, unknown>;
type Reply = { data: Row | null; error: { message: string } | null };
type Filter = { col: string; val: unknown };
type FakeQuery = {
  select: (cols?: string) => FakeQuery;
  eq: (col: string, val: unknown) => FakeQuery;
  maybeSingle: () => Promise<Reply>;
};

function fakeDb(rows: Row[], fail = false) {
  const reads: Filter[][] = [];
  const client = {
    from(table: string): FakeQuery {
      assert.equal(table, "talent_offerings");
      const filters: Filter[] = [];
      const q: FakeQuery = {
        select: () => q,
        eq: (col, val) => {
          filters.push({ col, val });
          return q;
        },
        maybeSingle: async () => {
          reads.push(filters);
          if (fail) return { data: null, error: { message: "boom" } };
          return { data: rows.find((r) => filters.every((f) => r[f.col] === f.val)) ?? null, error: null };
        },
      };
      return q;
    },
  };
  return { client, reads };
}

function gateDeps(opts: { planAllowsInstant?: boolean; posture?: string } = {}): OfferingSaveGateDeps & { planReads: string[][] } {
  const planReads: string[][] = [];
  return {
    planReads,
    loadPosture: async () => opts.posture ?? "request",
    loadPlanAllowsInstant: async (_admin: SupabaseClient, ids: readonly string[]) => {
      planReads.push([...ids]);
      const out = new Map<string, boolean>();
      if (opts.planAllowsInstant !== undefined) for (const id of ids) out.set(id, opts.planAllowsInstant);
      return out;
    },
  };
}

function menuItem(over: Partial<TalentOffering> = {}): TalentOffering {
  return {
    ...blankOffering({ kind: "workspace", tenantId: "t1" }, "MXN", 0),
    title: "Tacos al pastor",
    kind: "product",
    amountCents: 12000,
    bookingMode: "request",
    status: "published",
    ...over,
  };
}

// ---- the publish + plan gate ------------------------------------------------

test("a menu item that is not publish-ready is refused with the same message a service gets", async () => {
  const notReady = menuItem({ kind: "service", amountCents: null, durationMinutes: null });
  const ws = await workspaceOfferingSaveGate(fakeDb([]).client, "t1", "owner-1", notReady, gateDeps());
  const svc = await offeringSaveGate(fakeDb([]).client, "owner-1", { ...notReady, ownerKind: "talent", tenantId: null }, gateDeps());
  assert.equal(ws.ok, false);
  assert.equal(svc.ok, false);
  assert.ok(!ws.ok && !svc.ok);
  assert.equal(ws.error, svc.error);
  assert.match(ws.error, /is not ready to publish\. It still needs a price and a length\./);
});

test("publishing a stored draft is gated; saving an already-live item is not re-gated (same as services)", async () => {
  const row = { id: "m1", tenant_id: "t1", owner_kind: "workspace", status: "draft", booking_mode: "request" };
  const draftToLive = await workspaceOfferingSaveGate(fakeDb([row]).client, "t1", null, menuItem({ id: "m1", amountCents: null }), gateDeps());
  assert.equal(draftToLive.ok, false);
  const live = { ...row, status: "published" };
  const quickEdit = await workspaceOfferingSaveGate(fakeDb([live]).client, "t1", null, menuItem({ id: "m1", amountCents: null }), gateDeps());
  assert.deepEqual(quickEdit, { ok: true });
});

test("the stored-row read is pinned to this workspace's house rows, never a talent filter", async () => {
  const db = fakeDb([]);
  await workspaceOfferingSaveGate(db.client, "t1", "owner-1", menuItem({ id: "m1" }), gateDeps());
  assert.deepEqual(db.reads[0], [
    { col: "id", val: "m1" },
    { col: "tenant_id", val: "t1" },
    { col: "owner_kind", val: "workspace" },
  ]);
  // A same-id row of another tenant (or a talent row) is not the prior: the save is treated as new.
  const foreign = fakeDb([{ id: "m1", tenant_id: "t2", owner_kind: "workspace", status: "published", booking_mode: "request" }]);
  const res = await workspaceOfferingSaveGate(foreign.client, "t1", null, menuItem({ id: "m1", amountCents: null }), gateDeps());
  assert.equal(res.ok, false);
});

test("a failed stored-row read refuses the save (fails closed, same as services)", async () => {
  const res = await workspaceOfferingSaveGate(fakeDb([], true).client, "t1", "owner-1", menuItem({ id: "m1" }), gateDeps());
  assert.deepEqual(res, { ok: false, error: "Failed to save." });
});

test("newly picking instant on the owner's plan without instant is refused like a service", async () => {
  const instant = menuItem({ bookingMode: "instant" });
  const deps = gateDeps({ planAllowsInstant: false });
  const ws = await workspaceOfferingSaveGate(fakeDb([]).client, "t1", "owner-1", instant, deps);
  assert.deepEqual(ws, { ok: false, error: INSTANT_PLAN_REFUSAL_EN });
  assert.deepEqual(deps.planReads, [["owner-1"]], "the plan is the workspace owner's");
  const svc = await offeringSaveGate(fakeDb([]).client, "owner-1", instant, gateDeps({ planAllowsInstant: false }));
  assert.deepEqual(svc, ws);
  // A stored instant row keeps saving; a plan that includes instant passes.
  const stored = fakeDb([{ id: "m1", tenant_id: "t1", owner_kind: "workspace", status: "published", booking_mode: "instant" }]);
  assert.deepEqual(await workspaceOfferingSaveGate(stored.client, "t1", "owner-1", { ...instant, id: "m1" }, gateDeps({ planAllowsInstant: false })), { ok: true });
  assert.deepEqual(await workspaceOfferingSaveGate(fakeDb([]).client, "t1", "owner-1", instant, gateDeps({ planAllowsInstant: true })), { ok: true });
});

test("a workspace with no owner talent has an unknown plan, which never refuses (the loader's rule)", async () => {
  const deps = gateDeps({ planAllowsInstant: false });
  const res = await workspaceOfferingSaveGate(fakeDb([]).client, "t1", null, menuItem({ bookingMode: "instant" }), deps);
  assert.deepEqual(res, { ok: true });
  assert.deepEqual(deps.planReads, []);
});

// ---- the MXN/USD rule -------------------------------------------------------

test("a currency other than MXN or USD is refused, never defaulted", async () => {
  for (const currency of ["EUR", "GBP", "", "usdx"]) {
    const res = await workspaceOfferingSaveGate(fakeDb([]).client, "t1", null, menuItem({ status: "draft", currency }), gateDeps());
    assert.deepEqual(res, { ok: false, error: OFFERING_CURRENCY_REFUSAL_EN }, currency);
  }
  for (const currency of ["MXN", "USD", " usd "]) {
    const res = await workspaceOfferingSaveGate(fakeDb([]).client, "t1", null, menuItem({ status: "draft", currency }), gateDeps());
    assert.deepEqual(res, { ok: true }, currency);
  }
  assert.equal(offeringCurrencyRefusal(null), OFFERING_CURRENCY_REFUSAL_EN);
  assert.equal(OFFERING_CURRENCY_REFUSAL_EN, "Set the price in Mexican pesos (MXN) or US dollars (USD).");
});

// ---- TUL-1634 follow-up: the Spanish text, picked by locale ----------------

test("offeringCurrencyRefusal picks EN for en/undefined and ES for a locale starting with 'es'", () => {
  assert.equal(OFFERING_CURRENCY_REFUSAL_ES, "Pon el precio en pesos mexicanos (MXN) o dólares (USD).");
  for (const locale of [undefined, "en", "en-US", "fr", ""]) {
    assert.equal(offeringCurrencyRefusal("EUR", locale), OFFERING_CURRENCY_REFUSAL_EN, String(locale));
  }
  for (const locale of ["es", "es-MX", "es-ES"]) {
    assert.equal(offeringCurrencyRefusal("EUR", locale), OFFERING_CURRENCY_REFUSAL_ES, locale);
  }
  // A valid currency is still null regardless of locale.
  assert.equal(offeringCurrencyRefusal("MXN", "es-MX"), null);
});

test("workspaceOfferingSaveGate threads the locale param into the currency refusal", async () => {
  const en = await workspaceOfferingSaveGate(fakeDb([]).client, "t1", null, menuItem({ status: "draft", currency: "EUR" }), gateDeps(), "en");
  assert.deepEqual(en, { ok: false, error: OFFERING_CURRENCY_REFUSAL_EN });
  const es = await workspaceOfferingSaveGate(fakeDb([]).client, "t1", null, menuItem({ status: "draft", currency: "EUR" }), gateDeps(), "es-MX");
  assert.deepEqual(es, { ok: false, error: OFFERING_CURRENCY_REFUSAL_ES });
  const noLocale = await workspaceOfferingSaveGate(fakeDb([]).client, "t1", null, menuItem({ status: "draft", currency: "EUR" }), gateDeps());
  assert.deepEqual(noLocale, { ok: false, error: OFFERING_CURRENCY_REFUSAL_EN });
});

// ---- side effects -----------------------------------------------------------

function effects(fail: { bust?: boolean; rebuild?: boolean; revalidate?: boolean } = {}) {
  const calls: string[] = [];
  const logged: string[] = [];
  const deps: MenuSideEffectDeps = {
    revalidatePath: (path) => {
      calls.push(`revalidate:${path}`);
      if (fail.revalidate) throw new Error("revalidate outside a request");
    },
    bustTalentSiteCache: (id, code) => {
      calls.push(`bust:${id}:${String(code)}`);
      if (fail.bust) throw new Error("tag store down");
    },
    scheduleRebuildAiSearchDocument: async (_admin, id) => {
      calls.push(`rebuild:${id}`);
      if (fail.rebuild) throw new Error("rebuild failed");
    },
    logServerError: (scope) => {
      logged.push(scope);
    },
  };
  return { deps, calls, logged };
}

test("a successful save revalidates, busts the site cache and schedules the AI search rebuild", async () => {
  const fx = effects();
  await runMenuWriteSideEffects({}, { kind: "save", ownerTalentId: "owner-1" }, fx.deps);
  assert.deepEqual(fx.calls, ["revalidate:/", "bust:owner-1:null", "rebuild:owner-1"]);
});

test("delete, archive and reorder also bust the cache and rebuild search", async () => {
  for (const kind of ["delete", "archive", "reorder"] as MenuWriteKind[]) {
    const fx = effects();
    await runMenuWriteSideEffects({}, { kind, ownerTalentId: "owner-1" }, fx.deps);
    assert.deepEqual(fx.calls, ["revalidate:/", "bust:owner-1:null", "rebuild:owner-1"], kind);
  }
});

test("options and photos bust the cache only, like setOfferingOptions / setOfferingImages", async () => {
  const opts = effects();
  await runMenuWriteSideEffects({}, { kind: "options", ownerTalentId: "owner-1" }, opts.deps);
  assert.deepEqual(opts.calls, ["revalidate:/", "bust:owner-1:null"]);
  const photos = effects();
  await runMenuWriteSideEffects({}, { kind: "photos", ownerTalentId: "owner-1" }, photos.deps);
  assert.deepEqual(photos.calls, ["revalidate:/admin/menu", "bust:owner-1:null"]);
});

test("no owner talent: only the path is revalidated (no talent site, no AI document)", async () => {
  const fx = effects();
  await runMenuWriteSideEffects({}, { kind: "save", ownerTalentId: null }, fx.deps);
  assert.deepEqual(fx.calls, ["revalidate:/"]);
});

test("a side-effect failure is logged and never undoes or blocks the save", async () => {
  const fx = effects({ revalidate: true, bust: true, rebuild: true });
  await assert.doesNotReject(runMenuWriteSideEffects({}, { kind: "save", ownerTalentId: "owner-1" }, fx.deps));
  // Every effect still ran even though the earlier ones threw.
  assert.deepEqual(fx.calls, ["revalidate:/", "bust:owner-1:null", "rebuild:owner-1"]);
  assert.deepEqual(fx.logged, [
    "menu.offerings.sideEffects.save.revalidate",
    "menu.offerings.sideEffects.save.cache",
    "menu.offerings.sideEffects.save.search",
  ]);
});

// ---- wiring in the server actions ------------------------------------------

const ACTIONS = readFileSync(join(process.cwd(), "src/lib/talent/menu-offerings-actions.ts"), "utf8");
const TALENT = readFileSync(join(process.cwd(), "src/lib/talent/offerings-actions.ts"), "utf8");

function body(name: string): string {
  const start = ACTIONS.indexOf(`export async function ${name}(`);
  assert.ok(start > -1, name);
  const next = ACTIONS.indexOf("\nexport async function ", start + 1);
  return ACTIONS.slice(start, next === -1 ? undefined : next);
}

test("upsertWorkspaceMenuItem gates before any write and runs the side effects only after the row is stored", () => {
  const upsert = body("upsertWorkspaceMenuItem");
  const gate = upsert.indexOf("await workspaceOfferingSaveGate(admin, tenantId, ownerTalentId, offering, undefined, primaryLocale)");
  assert.ok(gate > -1);
  assert.ok(gate < upsert.indexOf(".update(patch)") && gate < upsert.indexOf(".insert(patch)"));
  assert.match(upsert, /if \(!gate\.ok\) return gate;/);
  const after = upsert.indexOf('await afterMenuWrite(admin, tenantId, "save", ownerTalentId);');
  assert.ok(after > upsert.indexOf('if (!saved) return { ok: false, error: "Failed to save." };'));
  assert.ok(after < upsert.indexOf("return { ok: true, item:"));
  assert.doesNotMatch(upsert, /revalidatePath\("\/"\)/);
});

test("delete, archive, reorder, options and photos run their side effects after a successful write", () => {
  // [action, kind, the last refusal of the write that must come first]
  const cases: [string, MenuWriteKind, string][] = [
    ["deleteWorkspaceMenuItem", "delete", "gone.length === 0"],
    ["setWorkspaceMenuItemArchived", "archive", "data.length === 0"],
    ["reorderWorkspaceMenuItems", "reorder", 'error: "Failed to reorder."'],
    ["setWorkspaceMenuItemOptions", "options", "if (!saved.ok) return saved;"],
    ["setWorkspaceItemPhotos", "photos", 'logServerError("menu.offerings.photoClear"'],
  ];
  for (const [name, kind, write] of cases) {
    const b = body(name);
    const at = b.indexOf(`await afterMenuWrite(admin, tenantId, "${kind}");`);
    assert.ok(at > -1, `${name} runs the ${kind} side effects`);
    assert.ok(b.indexOf(write) > -1 && at > b.indexOf(write), `${name}: only after the write succeeded`);
  }
});

test("afterMenuWrite wires the talent helpers and swallows failures", () => {
  assert.match(ACTIONS, /bustTalentSiteCache,\n\s+scheduleRebuildAiSearchDocument,/);
  const helper = ACTIONS.slice(ACTIONS.indexOf("async function afterMenuWrite("), ACTIONS.indexOf("/** The workspace's primary language"));
  assert.match(helper, /try \{[\s\S]*runMenuWriteSideEffects\([\s\S]*\} catch \(err\) \{\s*logServerError/);
});

test("the talent save uses the same currency rule (one refusal text), locale resolved from auth", () => {
  assert.match(TALENT, /const currencyRefusal = offeringCurrencyRefusal\(offering\.currency, auth\.primaryLocale\);/);
  assert.doesNotMatch(TALENT, /isTalentCurrency/);
});
