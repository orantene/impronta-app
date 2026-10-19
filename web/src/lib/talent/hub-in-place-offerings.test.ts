import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { listBookableOfferings } from "@/lib/talent-site/book-entry";
import { hubProfileBookEntry } from "@/lib/talent-site/hub-profile-book-entry";
import { filterInPlaceBookOfferings } from "./hub-profile-offerings";
import { rowToOffering, type TalentOffering, type TalentOfferingRow } from "./offerings-types";

// TUL-1272 money guard, part 2: the hub Book button, `#book` and `#book-<id8>`
// are built from the offerings handed to hubProfileBookEntry and open the
// booking sheet mounted under the HUB tenant. Only rows that book IN PLACE
// (sold by a hub tenant) may reach them; another workspace's row only links out.

const HUB = "00000000-0000-0000-0000-000000000002";
const WORKSPACE = "33333333-3333-4333-8333-333333333333";

function offering(id: string, over: Partial<TalentOfferingRow> = {}): TalentOffering {
  const row = {
    id,
    talent_profile_id: "33330003-0000-4000-8000-000000000001",
    owner_kind: "talent",
    tenant_id: WORKSPACE,
    kind: "service",
    title: `Service ${id}`,
    description: null,
    status: "published",
    moderation_state: "approved",
    visibility: "public",
    price_type: "fixed",
    amount_cents: 45000,
    currency: "MXN",
    duration_minutes: 60,
    booking_mode: "instant",
    sort_order: 0,
    is_featured: false,
    ...over,
  } as unknown as TalentOfferingRow;
  return rowToOffering(row, "en", []);
}

const kinds = new Map<string, string | null>([
  [HUB, "hub"],
  [WORKSPACE, "agency"],
]);

test("fixture sanity: a published instant service is bookable", () => {
  assert.equal(listBookableOfferings({ offerings: [offering("ws-row")] }).length, 1);
});

test("hub host: a talent-owned row on a workspace tenant never reaches the hub Book entry", () => {
  const foreign = offering("ws-row");
  for (const hostKind of ["marketing", "app", "hub"]) {
    const inPlace = filterInPlaceBookOfferings([foreign], { hostKind, tenantKinds: kinds });
    assert.deepEqual(inPlace, [], hostKind);
    assert.deepEqual(hubProfileBookEntry(inPlace, "premium"), { kind: "inquire" }, hostKind);
  }
});

test("hub host: Book / #book target the hub-sold row, never the workspace row", () => {
  const foreign = offering("ws-row", { is_featured: true } as Partial<TalentOfferingRow>);
  const own = offering("hub-row", { tenant_id: HUB } as Partial<TalentOfferingRow>);
  const inPlace = filterInPlaceBookOfferings([foreign, own], { hostKind: "marketing", tenantKinds: kinds });
  assert.deepEqual(inPlace.map((o) => o.id), ["hub-row"]);
  const entry = hubProfileBookEntry(inPlace, "premium");
  assert.equal(entry.kind, "sheet");
  assert.equal(entry.kind === "sheet" ? entry.offeringId : null, "hub-row");
  const targets = (entry as { targets?: Record<string, unknown> }).targets ?? {};
  assert.ok(!Object.keys(targets).some((k) => "ws-row".startsWith(k)), "no #book-<id8> target for the workspace row");
});

test("workspace-owned and agency_only rows never target the hub Book entry", () => {
  const ws = offering("biz-row", { owner_kind: "workspace", talent_profile_id: null, tenant_id: HUB } as Partial<TalentOfferingRow>);
  const hidden = offering("hidden-row", { visibility: "agency_only", tenant_id: HUB } as Partial<TalentOfferingRow>);
  const pending = offering("pending-row", { moderation_state: "pending", tenant_id: HUB } as Partial<TalentOfferingRow>);
  assert.deepEqual(filterInPlaceBookOfferings([ws, hidden, pending], { hostKind: "marketing", tenantKinds: kinds }), []);
});

test("unknown tenant kind fails closed (not in place)", () => {
  assert.deepEqual(filterInPlaceBookOfferings([offering("x")], { hostKind: "hub", tenantKinds: new Map() }), []);
});

test("non-hub hosts are unchanged: every offering stays in place", () => {
  const rows = [offering("a"), offering("b", { tenant_id: HUB } as Partial<TalentOfferingRow>)];
  for (const hostKind of ["agency", "talent_site"]) {
    assert.deepEqual(filterInPlaceBookOfferings(rows, { hostKind, tenantKinds: kinds }), rows, hostKind);
  }
});

test("profile-view feeds the hub Book entry and slot picker only in-place rows", () => {
  const src = readFileSync(join(process.cwd(), "src/app/t/[profileCode]/profile-view.tsx"), "utf8");
  assert.match(src, /hubProfileBookEntry\(\s*hubInPlaceOfferings\s*,/);
  assert.match(src, /offerings=\{hubInPlaceOfferings\}/);
  assert.match(src, /loadHubInPlaceOfferings\(storefrontOfferings\)/);
});
