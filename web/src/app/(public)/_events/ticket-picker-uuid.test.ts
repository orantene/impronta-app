import { test } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { uuidWire } from "@/lib/events/uuid-wire";

test("seeded Impronta tenant id is accepted by uuidWire and refused by z.uuid", () => {
  const impronta = "00000000-0000-0000-0000-000000000001";
  assert.equal(uuidWire.safeParse(impronta).success, true);
  assert.equal(z.string().uuid().safeParse(impronta).success, false);
});

test("RFC-versioned ids still pass", () => {
  assert.equal(uuidWire.safeParse("48d68b7b-659e-4cec-9871-219c02ba6a9e").success, true);
});

test("non-uuid strings are refused", () => {
  assert.equal(uuidWire.safeParse("impronta").success, false);
  assert.equal(uuidWire.safeParse("").success, false);
});
