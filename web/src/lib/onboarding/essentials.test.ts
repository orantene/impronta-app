import assert from "node:assert/strict";
import test from "node:test";

import {
  currencyForCountry,
  defaultWeeklyHours,
  essentialsReady,
  packKeyForTrade,
  parseEssentials,
  planOfferingWrites,
  runEssentialsWrites,
  servicesFromFacts,
  suggestedEssentials,
  suggestedServices,
  type Essentials,
  type EssentialsStore,
  type ExistingOffering,
  type OfferingOwnerRef,
  type OfferingRowDraft,
} from "./essentials";
import { resolveEssentialsForBuild } from "./essentials-resolve";
import { parsePersistedModuleState } from "./module-state";

type Db = {
  offerings: Array<ExistingOffering & { ownerKey: string; row: OfferingRowDraft }>;
  hours: Record<string, unknown>;
  bookable: Set<string>;
  apptEnabled: Set<string>;
  providers: Set<string>;
  invites: string[];
  businessInfo: Set<string>;
};
const fresh = (): Db => ({ offerings: [], hours: {}, bookable: new Set(), apptEnabled: new Set(), providers: new Set(), invites: [], businessInfo: new Set() });
const key = (o: OfferingOwnerRef) => (o.kind === "talent" ? `t:${o.talentProfileId}` : `w:${o.tenantId}`);

function fakeStore(db: Db, tz = true): EssentialsStore {
  let n = 0;
  return {
    async listOfferings(o) { return db.offerings.filter((r) => r.ownerKey === key(o)).map(({ id, title, status }) => ({ id, title, status })); },
    async insertOfferings(o, rows) { for (const row of rows) db.offerings.push({ id: `o${++n}`, title: row.title, status: row.status, ownerKey: key(o), row }); },
    async updateOffering(id, patch) { const r = db.offerings.find((x) => x.id === id)!; r.status = patch.status; r.row = patch; },
    async upsertTalentHours({ talentProfileId, weekly }) { if (!tz) return false; db.hours[talentProfileId] = weekly; return true; },
    async setTalentBookable(id) { db.bookable.add(id); },
    async setTalentPlace() {},
    async setWorkspaceBusinessInfo(t) { db.businessInfo.add(t); },
    async enableWorkspaceAppointments(t) { db.apptEnabled.add(t); },
    async hasActiveProvider(t) { return db.providers.has(t); },
    async inviteFirstProvider({ email }) { if (db.invites.includes(email)) return "already"; db.invites.push(email); return "invited"; },
  };
}

const ess = (over: Partial<Essentials> = {}): Essentials => ({
  ...suggestedEssentials({ trade: "lashes", country: "Mexico", locale: "en", name: "Valeria" }),
  confirmed: true,
  ...over,
});
const talent = { talentProfileId: "tp1", tenantId: "hub" };
const workspace = { tenantId: "ws1", tenantSlug: "studio" };

test("beauty pack: Mexico gets MXN prices, others get quotes; trade detection covers the five trades", () => {
  assert.equal(currencyForCountry("México"), "MXN");
  assert.equal(currencyForCountry("Spain"), "USD");
  for (const t of ["lashes", "nails", "brows", "hair", "makeup"]) assert.ok(suggestedServices({ trade: t, country: "MX", locale: "en" }).length > 0, t);
  const mx = suggestedServices({ trade: "lash artist", country: "Mexico", locale: "es" });
  assert.ok(mx.every((s) => s.currency === "MXN" && s.priceCents && s.durationMin && !s.quote));
  assert.equal(mx[0].name, "Pestañas clásicas");
  assert.ok(suggestedServices({ trade: "nails", country: "Spain", locale: "en" }).every((s) => s.quote && s.priceCents === null));
  assert.equal(packKeyForTrade("pestañas", null), "lashes");
  assert.equal(packKeyForTrade("dentist"), null);
});

test("myself: services published+bookable, hours written, owner bookable, retry changes nothing", async () => {
  const db = fresh();
  const input = { choice: "myself" as const, essentials: ess(), talent, workspace: null };
  const a = await runEssentialsWrites(fakeStore(db), input);
  assert.equal(a.offeringsCreated, 4);
  assert.ok(db.offerings.every((o) => o.status === "published" && o.row.booking_mode === "instant" && o.row.currency === "MXN"));
  assert.ok(db.hours.tp1);
  assert.ok(db.bookable.has("tp1") && a.ownerBookable);
  const b = await runEssentialsWrites(fakeStore(db), input);
  assert.equal(b.offeringsCreated, 0);
  assert.equal(db.offerings.length, 4);
});

test("an existing AI draft with the same title is published in place, not duplicated", async () => {
  const db = fresh();
  db.offerings.push({ id: "d1", title: "classic lash set", status: "draft", ownerKey: "t:tp1", row: {} as OfferingRowDraft });
  const r = await runEssentialsWrites(fakeStore(db), { choice: "myself", essentials: ess(), talent, workspace: null });
  assert.equal(r.offeringsUpdated, 1);
  assert.equal(r.offeringsCreated, 3);
  assert.equal(db.offerings.find((o) => o.id === "d1")!.status, "published");
});

test("quote service is request-to-book with no number", () => {
  const plan = planOfferingWrites([], [{ name: "Custom set", durationMin: 90, priceCents: null, quote: true, currency: "MXN" }]);
  assert.equal(plan.insert[0].price_display, "quote");
  assert.equal(plan.insert[0].booking_mode, "request");
  assert.equal(plan.insert[0].amount_cents, null);
});

test("both: her offerings and hours under the workspace, bookable, workspace appointments ON, no invite", async () => {
  const db = fresh();
  const r = await runEssentialsWrites(fakeStore(db), { choice: "both", essentials: ess({ firstProviderEmail: "x@y.com" }), talent, workspace });
  assert.ok(db.offerings.every((o) => o.ownerKey === "t:tp1"));
  assert.ok(db.bookable.has("tp1") && db.apptEnabled.has("ws1") && r.appointmentsEnabled);
  assert.equal(db.invites.length, 0);
});

test("studio: house offerings, opening hours, invite once; appointments ON only once a provider is linked", async () => {
  const db = fresh();
  const input = { choice: "studio" as const, essentials: ess({ firstProviderEmail: "pro@studio.com" }), talent: null, workspace };
  const a = await runEssentialsWrites(fakeStore(db), input);
  assert.ok(db.offerings.length === 4 && db.offerings.every((o) => o.ownerKey === "w:ws1"));
  assert.ok(db.businessInfo.has("ws1"));
  assert.equal(a.providerInvite, "invited");
  assert.equal(a.appointmentsEnabled, false);
  db.providers.add("ws1");
  const b = await runEssentialsWrites(fakeStore(db), input);
  assert.equal(b.providerInvite, "already");
  assert.equal(b.offeringsCreated, 0);
  assert.ok(b.appointmentsEnabled && db.apptEnabled.has("ws1"));
});

test("no timezone known: hours skipped with a warning, the rest still written", async () => {
  const db = fresh();
  const r = await runEssentialsWrites(fakeStore(db, false), { choice: "myself", essentials: ess({ timezone: null }), talent, workspace: null });
  assert.equal(r.hoursWritten, false);
  assert.ok(r.warnings.includes("essentials:hours:no_timezone"));
  assert.ok(db.bookable.has("tp1"));
});

test("a failing step is a warning, not a throw", async () => {
  const db = fresh();
  const store = { ...fakeStore(db), async insertOfferings() { throw new Error("boom"); } };
  const r = await runEssentialsWrites(store, { choice: "myself", essentials: ess(), talent, workspace: null });
  assert.ok(r.warnings.some((w) => w.startsWith("essentials:offerings")));
  assert.ok(db.bookable.has("tp1"));
});

test("manual path: confirmed essentials alone are buildable; unconfirmed or empty are not", () => {
  assert.equal(essentialsReady(ess()), true);
  assert.equal(essentialsReady(ess({ confirmed: false })), false);
  assert.equal(essentialsReady(ess({ services: [] })), false);
  assert.equal(essentialsReady(null), false);
});

test("module state round-trips essentials and drops junk", () => {
  const s = parsePersistedModuleState({ essentials: { ...ess(), services: [{ name: " Gel " , priceCents: 35000, currency: "mxn" }, { name: "" }, 7], place: { mode: "boat" } } });
  assert.equal(s.essentials?.services.length, 1);
  assert.equal(s.essentials?.services[0].currency, "MXN");
  assert.equal(s.essentials?.place, null);
  assert.equal(parseEssentials("nope"), null);
  assert.deepEqual(s.essentials?.hours?.["1"], [{ startMin: 540, endMin: 1140 }]);
});

test("AI facts are kept: names stay as said, pack match adds duration/price, never the email prefix", () => {
  const e = resolveEssentialsForBuild({ essentials: null, serviceFacts: ["Gel manicure", "Nail art"], discipline: "nails", tradeSlug: null, country: "Mexico", locale: "en" });
  assert.deepEqual(e!.services.map((s) => s.name), ["Gel manicure", "Nail art"]);
  assert.equal(e!.services[0].priceCents, 35000);
  assert.equal(e!.services[1].quote, true);
  assert.equal(e!.name, null);
  assert.equal(resolveEssentialsForBuild({ essentials: null, serviceFacts: [], discipline: "nails", tradeSlug: null, country: "Mexico", locale: "en" }), null);
  assert.equal(servicesFromFacts(["a", "A", " "], { locale: "en" }).length, 1);
  assert.ok(defaultWeeklyHours()["0"].length === 0);
});

// ── #178: solo studio owner's own booking hours ────────────────────────────

function ownerStore(db: Db, owner: { talentProfileId: string; providerCount: number } | null, tz = true): EssentialsStore {
  return {
    ...fakeStore(db, tz),
    async ownerProvider() { return owner; },
    async talentHasOpenHours(id) { const w = db.hours[id] as Record<string, unknown[]> | undefined; return !!w && Object.values(w).some((d) => d.length > 0); },
  };
}
const studioInput = (over: Partial<Essentials> = {}) => ({ choice: "studio" as const, essentials: ess(over), talent: null, workspace });

test("solo studio: the owner-provider's booking hours are written with the typed hours", async () => {
  const db = fresh();
  const typed = { ...defaultWeeklyHours(), "0": [], "6": [{ startMin: 600, endMin: 840 }] };
  const r = await runEssentialsWrites(ownerStore(db, { talentProfileId: "own1", providerCount: 1 }), studioInput({ hours: typed }));
  assert.equal(r.ownerHoursWritten, true);
  assert.deepEqual(db.hours.own1, typed);
  assert.ok(db.businessInfo.has("ws1"));
});

test("studio with several providers (or a pending invite): no owner hours", async () => {
  for (const [owner, over] of [
    [{ talentProfileId: "own1", providerCount: 2 }, {}],
    [{ talentProfileId: "own1", providerCount: 1 }, { firstProviderEmail: "pro@studio.com" }],
    [null, {}],
  ] as const) {
    const db = fresh();
    const r = await runEssentialsWrites(ownerStore(db, owner), studioInput(over));
    assert.equal(r.ownerHoursWritten, false);
    assert.deepEqual(db.hours, {});
  }
});

test("solo studio with no timezone known: skipped and reported, the rest still written", async () => {
  const db = fresh();
  const r = await runEssentialsWrites(ownerStore(db, { talentProfileId: "own1", providerCount: 1 }, false), studioInput({ timezone: null }));
  assert.equal(r.ownerHoursWritten, false);
  assert.ok(r.warnings.includes("essentials:ownerHours:no_timezone"));
  assert.deepEqual(db.hours, {});
  assert.ok(db.businessInfo.has("ws1"));
});

test("solo studio: second run is idempotent and owner-edited hours are never overwritten", async () => {
  const db = fresh();
  const s = ownerStore(db, { talentProfileId: "own1", providerCount: 1 });
  await runEssentialsWrites(s, studioInput());
  const edited = { ...defaultWeeklyHours(), "1": [{ startMin: 720, endMin: 780 }] };
  db.hours.own1 = edited;
  const again = await runEssentialsWrites(s, studioInput());
  assert.equal(again.ownerHoursWritten, false);
  assert.equal(db.hours.own1, edited);
  assert.equal(Object.keys(db.hours).length, 1);
});

test("solo studio: an existing row with no open day is filled in", async () => {
  const db = fresh();
  db.hours.own1 = { "0": [], "1": [], "2": [], "3": [], "4": [], "5": [], "6": [] };
  const r = await runEssentialsWrites(ownerStore(db, { talentProfileId: "own1", providerCount: 1 }), studioInput());
  assert.equal(r.ownerHoursWritten, true);
  assert.ok(Object.values(db.hours.own1 as Record<string, unknown[]>).some((d) => d.length > 0));
});
