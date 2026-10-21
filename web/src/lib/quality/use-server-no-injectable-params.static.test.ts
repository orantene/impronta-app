import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, it } from "node:test";

import {
  clientChosenTenant,
  exportStatements,
  exportedActions,
  forbiddenExports,
  isUseServerFile,
  SCOPE_RESOLVER,
  walkSource,
} from "./use-server-scan";
import baseline from "./use-server-tenant-param.baseline.json";

/**
 * The "use server" guards.
 *
 * TUL-1744: an exported function in a "use server" file is a public endpoint, and its ARGUMENTS come from the
 * client. So it must not take things that decide trust: a test seam (`deps`), a database client, a clock
 * (`now`), or a function. Those belong in a plain (non-"use server") module that the action calls with no
 * arguments, or in a non-exported helper.
 *
 * TUL-1763: a "use server" file may export only async functions (plus erased type-only exports). A bare
 * `export type { X };` passes tsc but broke the Turbopack production build (batch 10). The lanes catch it in
 * seconds instead of at the 45-minute gate.
 *
 * TUL-1758: the same scan now also covers the `export const x = async (...) =>` form, and flags actions that
 * take a CLIENT-CHOSEN tenantId/tenantSlug unless they show a scope-resolving call (membership, capability,
 * platform admin). Existing actions without that evidence are listed in a shrink-only baseline, UNREVIEWED.
 */

const SRC = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(SRC, rel), "utf8");

const INJECTABLE = [
  [/\bdeps\b|Deps\b|\bseams?\b/i, "a test seam / deps parameter"],
  [/SupabaseClient|createServiceRoleClient|\b(?:admin|supabase|client|db)\??\s*:/, "a database client"],
  [/\bnow\??\s*:|\bclock\??\s*:|:\s*Date\b/, "a clock"],
  [/=>\s*(?:Promise|void|boolean|string|number)\b|\bFunction\b/, "a function"],
] as const;

/** Exports that are allowed to look like this, with the reason. Keep empty unless a reason is real. */
const ALLOWED: Record<string, string> = {};
/** Files allowed a forbidden export shape, with the reason. Keep empty unless a reason is real. */
const ALLOWED_SHAPE: Record<string, string> = {};

const files = walkSource(SRC)
  .map((f) => ({ rel: relative(SRC, f), src: readFileSync(f, "utf8") }))
  .filter((f) => isUseServerFile(f.src));

describe('the "use server" scan itself', () => {
  it("finds the use-server files (the scan is not empty)", () => {
    assert.ok(files.length > 100, `only ${files.length} use-server files found; detection is broken`);
  });

  it("classifies export shapes", () => {
    const shapes = (src: string) => exportStatements(src).map((e) => e.shape);
    assert.deepEqual(shapes("export async function a() {}\nexport default async function () {}\nexport const b = async () => {};"), ["async-function", "default-async-function", "const-async"]);
    assert.deepEqual(shapes('export type X = { a: 1 };\nexport interface Y {}\nexport type { Z } from "./z";'), ["type-declaration", "type-declaration", "type-reexport-from"]);
    assert.deepEqual(shapes('export type { Z } from\n  "./z";'), ["type-reexport-from"]);
    assert.deepEqual(shapes("export type {\n  A,\n  B,\n};"), ["type-reexport-bare"]);
    assert.deepEqual(shapes("export type { A };"), ["type-reexport-bare"]);
    for (const bad of ["export { a };", 'export * from "./a";', "export function sync() {}", "export const n = 5;", "export const f = () => 1;", "export let v = 1;", "export class C {}", "export enum E { A }", "export default function () {}", "export default 5;"]) {
      assert.deepEqual(shapes(bad), ["other"], bad);
    }
  });

  it("comments never read as code", () => {
    assert.deepEqual(forbiddenExports("// export const n = 5;\n/* export class C {} */\nexport async function ok() {}"), []);
  });

  it("reads exported actions of every async form, with params and body", () => {
    const a = exportedActions(
      'export async function one(a: string, { b }: { b: number }): Promise<{ ok: true }> {\n  return doIt();\n}\nexport const two = async (x: number): Promise<void> => {\n  await go(x);\n};\nexport default async function three(c: string) {\n  return c;\n}',
    );
    assert.deepEqual(a.map((x) => x.name).sort(), ["one", "three", "two"]);
    assert.match(a.find((x) => x.name === "one")!.body, /doIt\(\)/);
    assert.match(a.find((x) => x.name === "two")!.body, /go\(x\)/);
    assert.match(a.find((x) => x.name === "two")!.params, /x: number/);
  });

  it("finds a client-chosen tenant: direct, destructured, inline object, named type, zod schema", () => {
    assert.ok(clientChosenTenant("tenantId: string, id: string", ""));
    assert.ok(clientChosenTenant("tenantSlug?: string", ""));
    assert.ok(clientChosenTenant("input: { tenantId: string; id: string }", ""));
    assert.ok(clientChosenTenant("{ tenantId, id }: Input", ""));
    assert.ok(clientChosenTenant("input: Foo", "type Foo = { tenantId: string };"));
    assert.ok(clientChosenTenant("input: Foo", "interface Foo { tenantSlug: string }"));
    assert.ok(clientChosenTenant("raw: z.infer<typeof fooSchema>", "const fooSchema = z.object({ tenantId: z.string() });"));
    assert.equal(clientChosenTenant("id: string, locale: string", ""), null);
    // A `type X = {` block must start AFTER its `{`, or it runs into later code and picks up an unrelated tenantId.
    assert.equal(clientChosenTenant("input: Foo", "type Foo = { id: string };\nexport async function other(a: { tenantId: string }) {}"), null);
    assert.equal(clientChosenTenant("input: Foo", "type Foo = {\n  id: string;\n  nested: { x: number };\n};\nconst later = { tenantId: 1 };"), null);
    assert.ok(clientChosenTenant("input: Foo", "type Foo = {\n  nested: { x: number };\n  tenantId: string;\n};"));
    assert.equal(clientChosenTenant("input: Bar", "type Bar = { id: string };"), null);
  });

  it("recognises scope evidence, and does not count requireNotImpersonating", () => {
    for (const ok of ["await requireWorkspaceStaffAction()", "gate(tenantSlug, cap)", "guardCatalogScope()", "await ownTenantId(slug)", "isPlatformAdmin(p)", "userHasCapability(a, b)", "await authorize(slug)", "getTenantScopeBySlug(s)"]) {
      assert.match(ok, SCOPE_RESOLVER, ok);
    }
    for (const no of ["await requireNotImpersonating()", "assertNotImpersonating()", "createServiceRoleClient()", "supabase.from('x')"]) {
      assert.doesNotMatch(no, SCOPE_RESOLVER, no);
    }
  });
});

describe('a "use server" file exports only async functions (TUL-1763)', () => {
  it("no use-server file has a bare `export type { X };`, `export { x }`, `export *`, a sync function, a non-async const, a class, an enum or let/var", () => {
    const bad: string[] = [];
    for (const { rel, src } of files) {
      if (ALLOWED_SHAPE[rel]) continue;
      for (const head of forbiddenExports(src)) bad.push(`${rel}: ${head}`);
    }
    assert.deepEqual(
      bad,
      [],
      'a "use server" file may export only async functions and erased type exports. A bare `export type { X };` passes tsc but breaks the Turbopack build (batch 10): import the type from its home, or re-export it with `export type { X } from "..."`. Move values and sync helpers to a plain module.',
    );
  });
});

describe('exported "use server" functions take no injectable parameters (TUL-1744, now incl. the const form)', () => {
  it("none exports an action that takes a seam, a client, a clock or a function", () => {
    const bad: string[] = [];
    for (const { rel, src } of files) {
      for (const a of exportedActions(src)) {
        const hit = INJECTABLE.find(([re]) => re.test(a.params));
        if (hit && !ALLOWED[`${rel}:${a.name}`]) bad.push(`${rel}: ${a.name}(${a.params.replace(/\s+/g, " ").slice(0, 90)}) takes ${hit[1]}`);
      }
    }
    assert.deepEqual(
      bad,
      [],
      'exported "use server" functions take their arguments from the client. Move the implementation into a plain module (import "server-only") and have the action call it with no injectable argument, or make the helper non-exported.',
    );
  });

  it("the earlier fixes still hold", () => {
    assert.ok(!isUseServerFile(read("lib/site-admin/edit-mode/new-page-starter.ts")));
    assert.ok(!/export async function applyParsedMenu/.test(read("lib/menu-import/import-actions.ts")));
    assert.ok(!/export async function processRosterImportRow/.test(read("lib/server-actions/roster-import.ts")));
    for (const plain of ["lib/menu-import/apply-parsed-menu.ts", "lib/server-actions/roster-import-row.ts", "lib/server-actions/engine-audit.ts"]) {
      const s = read(plain);
      assert.ok(!isUseServerFile(s), plain);
      assert.match(s, /^import "server-only";/, plain);
    }
    const booking = read("lib/talent-agenda/booking-actions.ts");
    const fn = booking.slice(booking.indexOf("export async function markBookingNoShow"), booking.indexOf("export async function completeBooking"));
    assert.ok(!/now\??:/.test(fn.split("{")[1] ?? ""));
    assert.match(fn, /const now = new Date\(\);/);
    assert.ok(!/input\.now/.test(fn));
  });
});

/**
 * REVIEWED exceptions: actions that take a client-chosen tenant BY DESIGN and are proven scoped by a helper the
 * SCOPE_RESOLVER pattern cannot see. Unlike the baseline (unreviewed, may only shrink), every entry here carries
 * the review that proved it. Key = "rel:action", value = the proof.
 */
const REVIEWED_CLIENT_TENANT_ACTIONS: Record<string, string> = {
  "app/(workspace)/[tenantSlug]/talent/settings/payouts/manual-bank-actions.ts:addMyManualPayoutAccount":
    "Reviewed TUL-1743 (#4376): tenantId is the talent's chosen workspace; connectTalentPayoutAccount requires own talent_profile + agency_talent_roster row in that tenant (not_rostered otherwise).",
  "lib/talent/fulfillment-actions.ts:markBookingFulfillment":
    "Reviewed TUL-1756 (#4373) in integ b14: scope is re-resolved in markBookingFulfillmentCore via deps.authorize (authorizeForBooking derives the tenant from agency_bookings and requires owner or requireWorkspaceStaffAction on that tenant) and the handoff gate; input.tenantId is never used for scoping.",
};

describe('exported "use server" actions do not trust a client-chosen tenant (TUL-1758)', () => {
  const found = new Map<string, string>(); // "rel:name" -> why
  for (const { rel, src } of files) {
    for (const a of exportedActions(src)) {
      const tenant = clientChosenTenant(a.params, src);
      if (tenant && !SCOPE_RESOLVER.test(a.body)) found.set(`${rel}:${a.name}`, tenant);
    }
  }
  const baselined = new Set(baseline.entries);
  const reviewed = new Set(Object.keys(REVIEWED_CLIENT_TENANT_ACTIONS));

  it("a new action with a client-chosen tenantId/tenantSlug must re-resolve scope (membership, capability, platform admin)", () => {
    const fresh = [...found].filter(([k]) => !baselined.has(k) && !reviewed.has(k)).map(([k, why]) => `${k} (takes ${why})`);
    assert.deepEqual(
      fresh,
      [],
      "an exported action takes a workspace chosen by the CLIENT and shows no scope-resolving call in its body. Resolve the workspace through the caller's own membership (requireWorkspaceStaffAction, a gate/guard helper, getTenantScopeBySlug ...) and compare it, or, for a public/guest action that takes a tenant by design, say so in the review and add it to use-server-tenant-param.baseline.json with the reason in the PR.",
    );
  });

  it("the baseline only shrinks: an entry whose action now re-resolves scope, or no longer exists, must be deleted", () => {
    const stale = baseline.entries.filter((k) => !found.has(k));
    assert.deepEqual(stale, [], "delete these from use-server-tenant-param.baseline.json (they are fixed or gone)");
  });

  it("every REVIEWED exception still exists, still takes a client tenant, and is not also baselined", () => {
    const stale = [...reviewed].filter((k) => !found.has(k) || baselined.has(k));
    assert.deepEqual(stale, [], "remove these from REVIEWED_CLIENT_TENANT_ACTIONS (gone, now re-resolve scope, or duplicated in the baseline)");
  });

  it("the baseline is sorted and has no duplicates", () => {
    assert.deepEqual([...baseline.entries], [...new Set(baseline.entries)].sort());
  });

  it("the two holes the sweep found are closed (not baselined)", () => {
    assert.ok(!baselined.has("lib/server-actions/engine-audit.ts:logEngineAudit"));
    const usage = read("lib/site-admin/builder-core/templates/template-usage-actions.ts");
    const fn = usage.slice(usage.indexOf("export async function recordTemplateUsage"), usage.indexOf("export type TemplateUsageResult"));
    assert.ok(!/input\.tenantId/.test(fn));
    assert.match(fn, /requireEditSurfaceTenantScope\(\)/);
    assert.ok(!/tenantId\??:/.test(usage.slice(usage.indexOf("export interface RecordTemplateUsageInput"), usage.indexOf("export async function recordTemplateUsage"))));
  });
});
