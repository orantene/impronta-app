import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildTermsCardLines,
  defaultTermsForModel,
  exclusiveNotice,
  resolveTalentTermsState,
  validateProposedTerms,
  type WorkspaceTalentTermsRow,
} from "./terms";
import en from "../../../messages/en.json";
import es from "../../../messages/es.json";

function row(over: Partial<WorkspaceTalentTermsRow>): WorkspaceTalentTermsRow {
  return {
    id: "t1",
    tenantId: "w1",
    talentProfileId: "p1",
    version: 1,
    workModel: "coordinator_agency",
    shareKind: "percent",
    shareBps: 2000,
    shareAmountCents: null,
    shareCurrency: null,
    clientPriceMode: "talent_plus_margin",
    showIdentity: "portfolio",
    showContact: false,
    clientContact: "workspace",
    exclusive: false,
    noPoaching: true,
    status: "pending",
    proposedAt: "2026-10-19T00:00:00Z",
    ...over,
  };
}

test("first terms: pending version is shown, nothing in force yet", () => {
  const s = resolveTalentTermsState([row({ version: 1, status: "pending" })]);
  assert.equal(s.inForce, null);
  assert.equal(s.pending?.version, 1);
});

test("changed terms ask again; the old accepted version stays in force until accepted", () => {
  const s = resolveTalentTermsState([
    row({ id: "a", version: 1, status: "accepted" }),
    row({ id: "b", version: 2, status: "pending", shareBps: 3000 }),
  ]);
  assert.equal(s.inForce?.version, 1);
  assert.equal(s.pending?.version, 2);
});

test("a declined change leaves the old terms in force and nothing pending", () => {
  const s = resolveTalentTermsState([
    row({ id: "a", version: 1, status: "accepted" }),
    row({ id: "b", version: 2, status: "declined" }),
  ]);
  assert.equal(s.inForce?.version, 1);
  assert.equal(s.pending, null);
});

test("a stale pending older than the accepted version is ignored", () => {
  const s = resolveTalentTermsState([
    row({ id: "a", version: 2, status: "accepted" }),
    row({ id: "b", version: 1, status: "pending" }),
  ]);
  assert.equal(s.pending, null);
});

test("no-poaching is on by default only for coordinator models (agency and collective)", () => {
  assert.equal(defaultTermsForModel("coordinator_agency").noPoaching, true);
  assert.equal(defaultTermsForModel("friends_collective").noPoaching, true);
  assert.equal(defaultTermsForModel("open_network").noPoaching, false);
  assert.equal(defaultTermsForModel("team_studio").noPoaching, false);
  assert.equal(defaultTermsForModel("rental_studio").noPoaching, false);
});

test("who talks to the client follows the model: workspace in A, C, E; talent in B, D", () => {
  assert.equal(defaultTermsForModel("coordinator_agency").clientContact, "workspace");
  assert.equal(defaultTermsForModel("team_studio").clientContact, "workspace");
  assert.equal(defaultTermsForModel("friends_collective").clientContact, "workspace");
  assert.equal(defaultTermsForModel("open_network").clientContact, "talent");
  assert.equal(defaultTermsForModel("rental_studio").clientContact, "talent");
});

test("validation: percent needs a rate, fixed/per hour/rent need amount and currency", () => {
  assert.equal(validateProposedTerms({ ...defaultTermsForModel("open_network"), shareKind: "percent", shareBps: null }).ok, false);
  assert.equal(
    validateProposedTerms({ ...defaultTermsForModel("rental_studio"), shareKind: "rent", shareAmountCents: 50000, shareCurrency: null }).ok,
    false,
  );
  assert.equal(
    validateProposedTerms({ ...defaultTermsForModel("rental_studio"), shareKind: "rent", shareAmountCents: 50000, shareCurrency: "MXN" }).ok,
    true,
  );
  assert.equal(validateProposedTerms({ ...defaultTermsForModel("open_network"), shareBps: 10001 }).ok, false);
});

test("card lines: every required item is present, no-poaching only where it applies", () => {
  const lines = buildTermsCardLines(row({}), "en");
  const keys = lines.map((l) => l.key);
  assert.deepEqual(keys, ["model", "share", "clientPrice", "identity", "contact", "clientContact", "exclusive", "noPoaching"]);
  const noPoach = buildTermsCardLines(row({ workModel: "open_network", noPoaching: false }), "en").map((l) => l.key);
  assert.equal(noPoach.includes("noPoaching"), false);
});

test("card lines render the share as a percent and as money in the talent's currency", () => {
  const pct = buildTermsCardLines(row({ shareKind: "percent", shareBps: 1550 }), "en").find((l) => l.key === "share");
  assert.match(pct!.value, /15\.5%/);
  const rent = buildTermsCardLines(
    row({ shareKind: "rent", shareBps: null, shareAmountCents: 250000, shareCurrency: "MXN" }),
    "es",
  ).find((l) => l.key === "share");
  assert.match(rent!.value, /2,500|2\.500/);
  assert.match(rent!.value, /MXN|\$/);
});

test("every string the card uses exists in EN and ES, with no em dashes", () => {
  const enBlock = (en as { dashboard: Record<string, Record<string, string>> }).dashboard.serviceHubTerms;
  const esBlock = (es as { dashboard: Record<string, Record<string, string>> }).dashboard.serviceHubTerms;
  assert.ok(enBlock && esBlock, "dashboard.serviceHubTerms block missing");
  assert.deepEqual(Object.keys(enBlock).sort(), Object.keys(esBlock).sort());
  assert.equal(enBlock.accept, "Accept");
  assert.equal(enBlock.decline, "Decline");
  assert.equal(esBlock.accept, "Aceptar");
  assert.equal(esBlock.decline, "Rechazar");
  for (const v of [...Object.values(enBlock), ...Object.values(esBlock)]) {
    assert.equal(String(v).includes("—"), false, `em dash in ${v}`);
  }
  for (const locale of ["en", "es"] as const) {
    for (const l of buildTermsCardLines(row({}), locale)) {
      assert.ok(l.label && !l.label.startsWith("dashboard."), `missing label ${l.key} (${locale})`);
      assert.ok(l.value && !l.value.startsWith("dashboard."), `missing value ${l.key} (${locale})`);
    }
  }
});

test("exclusive terms carry a plain notice shown before Accept (EN + ES)", () => {
  assert.equal(
    exclusiveNotice(row({ exclusive: true }), "en"),
    "Only this workspace and your own site can sell your services",
  );
  assert.equal(
    exclusiveNotice(row({ exclusive: true }), "es"),
    "Solo este espacio y tu propio sitio pueden vender tus servicios",
  );
  assert.equal(exclusiveNotice(row({ exclusive: false }), "en"), null);
});
