import assert from "node:assert/strict";
import { test } from "node:test";

import type { OfferingDeliveryWhere } from "@/lib/talent/offering-request-detail";
import { SERVICE_ADDRESS_COPY } from "@/components/public-booking/service-address-copy";

import {
  composeLocationText,
  serviceAddressRule,
  validateServiceAddress,
  type ServiceAddressErrorCode,
} from "./service-address";

test("rule: shown only when the client's place is among the delivery settings", () => {
  const cases: Array<[OfferingDeliveryWhere[] | null | undefined, "required" | "hidden"]> = [
    [["client"], "required"],
    [["studio", "client"], "required"],
    [["client", "remote"], "required"],
    [["studio"], "hidden"],
    [["remote"], "hidden"],
    [["agreed"], "hidden"],
    [["studio", "remote"], "hidden"],
    [[], "hidden"],
    [null, "hidden"],
    [undefined, "hidden"],
  ];
  for (const [where, want] of cases) assert.equal(serviceAddressRule(where), want, JSON.stringify(where));
});

test("validate: hidden rule never asks and drops anything typed", () => {
  const r = validateServiceAddress({ address: "", note: "x" }, "hidden");
  assert.deepEqual(r, { ok: true, value: { addressText: null, note: null } });
});

test("validate: required rejects empty, whitespace, too short, too long, long note", () => {
  const err = (a: string, n = "") => {
    const r = validateServiceAddress({ address: a, note: n }, "required");
    return r.ok ? "ok" : r.error;
  };
  assert.equal(err(""), "address_required");
  assert.equal(err("   \n "), "address_required");
  assert.equal(err("abcd"), "address_too_short");
  assert.equal(err("a".repeat(201)), "address_too_long");
  assert.equal(err("Calle 5 #12", "n".repeat(121)), "note_too_long");
  assert.equal(err("abcde"), "ok");
  assert.equal(err("a".repeat(200), "n".repeat(120)), "ok");
});

test("validate: trims and collapses whitespace; empty note becomes null", () => {
  const r = validateServiceAddress({ address: "  Calle   5  #12 ", note: "   " }, "required");
  assert.deepEqual(r, { ok: true, value: { addressText: "Calle 5 #12", note: null } });
  const n = validateServiceAddress({ address: "Calle 5 #12", note: " piso  3 " }, "required");
  assert.deepEqual(n, { ok: true, value: { addressText: "Calle 5 #12", note: "piso 3" } });
});

test("compose: address (note), address only, null, and the 200 cap", () => {
  assert.equal(composeLocationText({ address: "Calle 5 #12", note: "piso 3" }), "Calle 5 #12 (piso 3)");
  assert.equal(composeLocationText({ address: " Calle 5 #12 ", note: "" }), "Calle 5 #12");
  assert.equal(composeLocationText({ address: "", note: "piso 3" }), null);
  assert.equal(composeLocationText({ address: null, note: null }), null);
  const long = "a".repeat(190);
  const out = composeLocationText({ address: long, note: "n".repeat(120) });
  assert.ok(out && out.length <= 200, "never over the event-location cap");
  assert.ok(out.startsWith(long), "the address is never cut");
  assert.equal(composeLocationText({ address: "a".repeat(200), note: "piso" }), "a".repeat(200));
});

test("copy: en and es have the same keys, no empty strings, no em dashes", () => {
  const { en, es } = SERVICE_ADDRESS_COPY;
  assert.deepEqual(Object.keys(en).sort(), Object.keys(es).sort());
  const codes: ServiceAddressErrorCode[] = [
    "address_required",
    "address_too_short",
    "address_too_long",
    "note_too_long",
  ];
  for (const c of codes) {
    assert.ok(en.errors[c].length > 0 && es.errors[c].length > 0, c);
    assert.notEqual(en.errors[c], es.errors[c]);
  }
  assert.deepEqual(Object.keys(en.errors).sort(), Object.keys(es.errors).sort());
  const all = JSON.stringify([en, es]);
  assert.ok(!all.includes("—") && !all.includes("–"), "no em/en dashes");
  assert.equal(en.privacy, "Only your provider sees this address");
  assert.equal(es.privacy, "Solo tu profesional ve esta dirección");
  assert.equal(es.visitHeading, "Vamos a tu domicilio");
  assert.equal(en.visitHeading, "We'll come to your place");
  assert.match(es.addressPlaceholder, /colonia/i);
  assert.match(es.noteLabel, /Referencias/i);
});
