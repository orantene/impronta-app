import { test } from "node:test";
import assert from "node:assert/strict";

import {
  canProposeJoinTerms,
  joinTermsCurrencyOptions,
  joinTermsDefaultModel,
  joinTermsFromFormData,
  joinTermsInputFor,
  parseAmountToCents,
  parseJoinTermsFlag,
  parsePercentToBps,
  joinTermsRedirectFlag,
  readJoinTerms,
  shareFieldFor,
  type JoinTermsInput,
} from "./join-terms";
import { joinTermsCopy, joinTermsLocale, joinTermsOutcomeNotice, joinTermsRestLines, modelLabel } from "./join-terms-copy";
import { defaultTermsForModel, WORK_MODELS } from "./terms";

test("the step starts from the workspace's model defaults and is sent unless skipped", () => {
  for (const m of WORK_MODELS) {
    const input = joinTermsInputFor(m);
    assert.equal(input.send, true);
    assert.equal(input.model, m);
    const d = readJoinTerms(input, m);
    if (m === "rental_studio") {
      // Rent has no default amount (PM): the owner must type it before sending.
      assert.deepEqual(d, { kind: "invalid", reason: "share_amount" });
    } else {
      assert.equal(d.kind, "send");
      if (d.kind === "send") assert.deepEqual(d.terms, defaultTermsForModel(m));
    }
  }
});

test("no model chosen yet falls back to the coordinator model; unknown values never pass", () => {
  assert.equal(joinTermsDefaultModel(null), "coordinator_agency");
  assert.equal(joinTermsDefaultModel("open_network"), "open_network");
  assert.equal(joinTermsDefaultModel("hacker"), "coordinator_agency");
  const input: JoinTermsInput = { ...joinTermsInputFor("open_network"), model: "" };
  const d = readJoinTerms(input, "team_studio");
  assert.equal(d.kind === "send" && d.terms.workModel, "team_studio");
  assert.deepEqual(readJoinTerms({ ...input, model: "nope" }, "open_network"), { kind: "invalid", reason: "work_model" });
});

test("the owner can edit share, model and exclusivity before sending", () => {
  const d = readJoinTerms({ ...joinTermsInputFor("open_network"), sharePercent: "12.5", exclusive: true }, "open_network");
  assert.equal(d.kind, "send");
  if (d.kind === "send") {
    assert.equal(d.terms.shareBps, 1250);
    assert.equal(d.terms.exclusive, true);
    assert.equal(d.terms.shareKind, "percent");
  }
  const rent = readJoinTerms({ ...joinTermsInputFor("rental_studio"), shareAmount: "1,500", currency: "mxn" }, "open_network");
  assert.equal(rent.kind, "send");
  if (rent.kind === "send") {
    assert.equal(rent.terms.shareKind, "rent");
    assert.equal(rent.terms.shareAmountCents, 150000);
    assert.equal(rent.terms.shareCurrency, "MXN");
    assert.equal(rent.terms.shareBps, null);
  }
});

test("bad shares are refused before anything is written", () => {
  const base = joinTermsInputFor("coordinator_agency");
  assert.deepEqual(readJoinTerms({ ...base, sharePercent: "95" }, "coordinator_agency"), { kind: "invalid", reason: "share_bps" });
  assert.deepEqual(readJoinTerms({ ...base, sharePercent: "abc" }, "coordinator_agency"), { kind: "invalid", reason: "share_bps" });
  assert.deepEqual(readJoinTerms({ ...base, sharePercent: "-5" }, "coordinator_agency"), { kind: "invalid", reason: "share_bps" });
  const rent = joinTermsInputFor("rental_studio");
  assert.deepEqual(readJoinTerms({ ...rent, shareAmount: "0" }, "rental_studio"), { kind: "invalid", reason: "share_amount" });
  assert.deepEqual(readJoinTerms({ ...rent, shareAmount: "100", currency: "" }, "rental_studio"), { kind: "invalid", reason: "share_currency" });
  assert.equal(parsePercentToBps("20%"), 2000);
  assert.equal(parsePercentToBps("12,5"), 1250);
  assert.equal(parseAmountToCents("99.50"), 9950);
  assert.equal(parseAmountToCents("1e3"), null);
});

test("skipping, or no step at all, sends nothing", () => {
  assert.deepEqual(readJoinTerms(null, "open_network"), { kind: "skip" });
  assert.deepEqual(readJoinTerms({ ...joinTermsInputFor("open_network"), send: false }, "open_network"), { kind: "skip" });
  const none = new Map<string, string>();
  assert.equal(joinTermsFromFormData(none), null);
});

test("the form fields round-trip (direct add)", () => {
  const fd = new Map<string, string>([
    ["terms_send", "1"],
    ["terms_model", "friends_collective"],
    ["terms_share_percent", "15"],
    ["terms_share_amount", ""],
    ["terms_currency", "USD"],
    ["terms_exclusive", "0"],
  ]);
  const input = joinTermsFromFormData(fd);
  assert.deepEqual(input, { send: true, model: "friends_collective", sharePercent: "15", shareAmount: "", currency: "USD", exclusive: false });
  const skipped = joinTermsFromFormData(new Map([["terms_send", "0"]]));
  assert.equal(skipped?.send, false);
});

test("only an owner or admin may propose (the RPC checks the same)", () => {
  assert.equal(canProposeJoinTerms("owner"), true);
  assert.equal(canProposeJoinTerms("admin"), true);
  for (const r of ["coordinator", "editor", "viewer", "", null, undefined]) assert.equal(canProposeJoinTerms(r), false);
});

test("share field follows the model", () => {
  assert.equal(shareFieldFor("rental_studio"), "amount");
  assert.equal(shareFieldFor("open_network"), "percent");
  assert.equal(shareFieldFor("coordinator_agency"), "percent");
});

test("copy: ES and EN for every line, plain words, no em dashes", () => {
  assert.equal(joinTermsLocale("es-MX"), "es");
  assert.equal(joinTermsLocale("en"), "en");
  assert.equal(joinTermsLocale(undefined), "en");
  const es = joinTermsCopy("es");
  const en = joinTermsCopy("en");
  const flat = (o: unknown): string[] =>
    typeof o === "string" ? [o] : o && typeof o === "object" ? Object.values(o).flatMap(flat) : [];
  assert.deepEqual(Object.keys(es).sort(), Object.keys(en).sort());
  for (const s of [...flat(es), ...flat(en)]) assert.doesNotMatch(s, /—/, `em dash in: ${s}`);
  for (const m of WORK_MODELS) {
    for (const loc of ["es", "en"] as const) {
      assert.ok(modelLabel(m, loc).length > 0);
      for (const line of joinTermsRestLines(defaultTermsForModel(m), loc)) assert.doesNotMatch(line, /—/);
    }
  }
  assert.equal(joinTermsOutcomeNotice("skipped", "es"), null);
  assert.match(joinTermsOutcomeNotice("sent", "es") ?? "", /aceptarlas/);
  assert.match(joinTermsOutcomeNotice("sent", "en") ?? "", /accept/);
  assert.match(en.pendingNote, /Nothing is sold/);
  assert.match(es.pendingNote, /No se vende nada/);
});

test("rent currency: the workspace's explicit currency is the default, otherwise none and the owner must pick", () => {
  assert.equal(joinTermsInputFor("rental_studio", "MXN").currency, "MXN");
  const blank = joinTermsInputFor("rental_studio", null);
  assert.equal(blank.currency, "", "no USD (or any) fallback when the workspace set none");
  assert.equal(joinTermsInputFor("rental_studio").currency, "");
  // Refused until a currency is picked, even with an amount typed.
  assert.deepEqual(readJoinTerms({ ...blank, shareAmount: "1500" }, "rental_studio"), { kind: "invalid", reason: "share_currency" });
  const picked = readJoinTerms({ ...blank, shareAmount: "1500", currency: "EUR" }, "rental_studio");
  assert.equal(picked.kind === "send" && picked.terms.shareCurrency, "EUR");
  // The workspace's own currency is offered first, without repeats.
  assert.deepEqual(joinTermsCurrencyOptions("MXN"), ["MXN", "USD", "EUR"]);
  assert.deepEqual(joinTermsCurrencyOptions("COP"), ["COP", "MXN", "USD", "EUR"]);
  assert.deepEqual(joinTermsCurrencyOptions(null), ["MXN", "USD", "EUR"]);
});

test("direct add: only a terms problem AFTER the save becomes a roster-page flag", () => {
  for (const o of ["not_allowed", "unavailable", "failed"] as const) {
    assert.equal(joinTermsRedirectFlag(o), o);
    assert.equal(parseJoinTermsFlag(o), o);
    assert.ok(joinTermsOutcomeNotice(o, "es"));
    assert.ok(joinTermsOutcomeNotice(o, "en"));
  }
  for (const o of ["sent", "skipped", "invalid"] as const) assert.equal(joinTermsRedirectFlag(o), null);
  for (const raw of ["sent", "skipped", "<script>", "", undefined, null, 3]) assert.equal(parseJoinTermsFlag(raw), null);
  assert.equal(parseJoinTermsFlag(["failed", "x"]), "failed");
});
