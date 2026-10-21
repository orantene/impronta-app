/**
 * TUL-1633: moderation, featured and visibility on a service save are server-owned.
 * Behavioural tests on the resolver with a typed FakeQuery (no `any`), plus the
 * row the save actually writes (offeringToRowPatch then the server fields), plus
 * static pins that both save actions route through it in the right mode.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  NEW_OFFERING_SERVER_OWNED,
  OFFERING_CURATION_CAPABILITY,
  resolveServerOwnedOfferingFields,
  type OfferingCuration,
} from "./offering-server-owned";
import { blankOffering, offeringToRowPatch, type TalentOffering } from "./offerings-types";

const here = fileURLToPath(new URL(".", import.meta.url));
const read = (rel: string) => readFileSync(join(here, rel), "utf8");

type Stored = { moderation_state: string; is_featured: boolean; visibility: string };
type Outcome = { data: Stored | null; error: { message: string } | null };

/** Records every filter; resolves to the configured row or error. */
class FakeQuery {
  table = "";
  columns = "";
  filters: Array<[string, string]> = [];
  constructor(private readonly outcome: Outcome) {}
  select(columns: string) { this.columns = columns; return this; }
  eq(col: string, value: string) { this.filters.push([col, value]); return this; }
  async maybeSingle(): Promise<Outcome> { return this.outcome; }
}

function fakeDb(outcome: Outcome, seen: FakeQuery[]): SupabaseClient {
  return {
    from(table: string) {
      const q = new FakeQuery(outcome);
      q.table = table;
      seen.push(q);
      return q;
    },
  } as unknown as SupabaseClient;
}

const REJECTED_HIDDEN: Stored = { moderation_state: "rejected", is_featured: false, visibility: "agency_only" };
const CRAFTED = { moderation_state: "approved", is_featured: true, visibility: "public" } as const;

function craftedOffering(id: string): TalentOffering {
  return {
    ...blankOffering({ kind: "talent", talentProfileId: "tp-1" }, "USD", 0),
    id,
    title: "Cut",
    amountCents: 5000,
    moderationState: "approved",
    isFeatured: true,
    visibility: "public",
  };
}

async function resolve(opts: {
  id: string | null;
  curation: OfferingCuration;
  outcome?: Outcome;
  requested?: { moderation_state?: unknown; is_featured?: unknown; visibility?: unknown };
}) {
  const seen: FakeQuery[] = [];
  const db = fakeDb(opts.outcome ?? { data: REJECTED_HIDDEN, error: null }, seen);
  const res = await resolveServerOwnedOfferingFields(db, {
    offeringId: opts.id,
    scope: { talent_profile_id: "tp-1" },
    requested: opts.requested ?? CRAFTED,
    curation: opts.curation,
  });
  return { res, seen };
}

test("create: crafted approved / featured / visibility are ignored, the policy default is written", async () => {
  const { res, seen } = await resolve({ id: null, curation: "ignore", requested: { ...CRAFTED, visibility: "agency_only" } });
  assert.equal(res.ok, true);
  if (res.ok) assert.deepEqual(res.fields, NEW_OFFERING_SERVER_OWNED);
  assert.equal(seen.length, 0, "a new row needs no read");
});

test("update: crafted values are ignored and the stored values are kept", async () => {
  const { res, seen } = await resolve({ id: "off-1", curation: "ignore" });
  assert.equal(res.ok, true);
  if (res.ok) assert.deepEqual(res.fields, REJECTED_HIDDEN);
  assert.equal(seen[0]?.table, "talent_offerings");
  assert.deepEqual(seen[0]?.filters, [["id", "off-1"], ["talent_profile_id", "tp-1"]]);
});

test("update: the row the talent save writes carries the stored values, not the crafted ones", async () => {
  const { res } = await resolve({ id: "off-1", curation: "ignore" });
  assert.ok(res.ok);
  const patch = { ...offeringToRowPatch(craftedOffering("off-1")), ...res.fields };
  assert.equal(patch.moderation_state, "rejected");
  assert.equal(patch.is_featured, false);
  assert.equal(patch.visibility, "agency_only");
});

test("create: the row the talent save writes is the default even with a crafted payload", async () => {
  const { res } = await resolve({ id: null, curation: "ignore" });
  assert.ok(res.ok);
  const patch = { ...offeringToRowPatch({ ...craftedOffering(""), visibility: "on_request" }), ...res.fields };
  assert.equal(patch.moderation_state, "approved");
  assert.equal(patch.is_featured, false);
  assert.equal(patch.visibility, "public");
});

test("duplicate: a server-read seed keeps the source's moderation and visibility", async () => {
  const db = fakeDb({ data: null, error: null }, []);
  const res = await resolveServerOwnedOfferingFields(db, {
    offeringId: null,
    scope: { talent_profile_id: "tp-1" },
    requested: CRAFTED,
    curation: "ignore",
    insertSeed: { moderation_state: "rejected", visibility: "agency_only", is_featured: false },
  });
  assert.ok(res.ok);
  assert.deepEqual(res.fields, REJECTED_HIDDEN);
});

test("admin path: a curator can set featured and visibility; moderation stays server-owned", async () => {
  const { res } = await resolve({ id: "off-1", curation: "curator" });
  assert.ok(res.ok);
  assert.deepEqual(res.fields, { moderation_state: "rejected", is_featured: true, visibility: "public" });
  const created = await resolve({ id: null, curation: "curator", requested: { ...CRAFTED, visibility: "on_request" } });
  assert.ok(created.res.ok);
  assert.deepEqual(created.res.fields, { moderation_state: "approved", is_featured: true, visibility: "on_request" });
});

test("admin path: a non-admin changing featured or visibility is refused", async () => {
  const featured = await resolve({ id: "off-1", curation: "refuse_change", requested: { ...REJECTED_HIDDEN, is_featured: true } });
  assert.equal(featured.res.ok, false);
  if (!featured.res.ok) assert.equal(featured.res.code, "forbidden");
  const shown = await resolve({ id: "off-1", curation: "refuse_change", requested: { ...REJECTED_HIDDEN, visibility: "public" } });
  assert.equal(shown.res.ok, false);
  const created = await resolve({ id: null, curation: "refuse_change", requested: { is_featured: true } });
  assert.equal(created.res.ok, false);
});

test("admin path: a non-admin saving unchanged values still saves, and a crafted moderation is ignored", async () => {
  const { res } = await resolve({ id: "off-1", curation: "refuse_change", requested: { ...REJECTED_HIDDEN, moderation_state: "approved" } });
  assert.ok(res.ok);
  assert.deepEqual(res.fields, REJECTED_HIDDEN);
});

test("fail closed: a failed read of the current row refuses the save", async () => {
  for (const curation of ["ignore", "refuse_change", "curator"] as const) {
    const { res } = await resolve({ id: "off-1", curation, outcome: { data: null, error: { message: "boom" } } });
    assert.equal(res.ok, false);
    if (!res.ok) assert.equal(res.code, "read_failed");
  }
});

test("fail closed: a row outside the save's scope (not found) refuses the save", async () => {
  const { res } = await resolve({ id: "off-1", curation: "ignore", outcome: { data: null, error: null } });
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.code, "not_found");
});

test("wiring: the talent save writes the server fields after the client patch, in ignore mode", () => {
  const src = read("offerings-actions.ts");
  assert.match(src, /offeringToRowPatch\(\{ \.\.\.offering, ownerKind: "talent"[^\n]*\n\s*\.\.\.owned\.fields,/);
  assert.match(src, /curation: "ignore"/);
  assert.match(src, /if \(!owned\.ok\)/);
  assert.match(src, /export async function upsertTalentOffering\([^)]*\): Promise<SaveResult> \{\s*const readOnly = await assertNotImpersonating\(\);\s*if \(!readOnly\.ok\) return readOnly;\s*return saveTalentOffering\(talentProfileId, offering\);/);
  assert.doesNotMatch(src, /export async function saveTalentOffering/);
});

test("wiring: the workspace save gates curation on the admin capability and writes the server fields", () => {
  const src = read("menu-offerings-actions.ts");
  assert.equal(OFFERING_CURATION_CAPABILITY, "manage_storefront_settings");
  assert.match(src, /userHasCapability\(OFFERING_CURATION_CAPABILITY, tenantId\)/);
  assert.match(src, /curation: curator \? "curator" : "refuse_change"/);
  assert.match(src, /primaryLocale\), \/\/[^\n]*\n\s*\.\.\.owned\.fields,/);
  assert.match(src, /if \(!owned\.ok\)/);
});
