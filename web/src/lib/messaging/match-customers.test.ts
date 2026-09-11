import assert from "node:assert/strict";
import { test } from "node:test";

import { matchCustomers } from "./match-customers";

const rows = [
  { id: "c1", display_name: "Marco Ruiz", email: "marco@casa.test", phone_e164: "+525511112222" },
  { id: "c2", display_name: "Ana Perez", email: "ana@casa.test", phone_e164: "+525533334444" },
];

test("phone match wins over name", () => {
  const hits = matchCustomers({ name: "Marco", phone: "+52 55 1111 2222", customers: rows });
  assert.equal(hits[0]?.level, "phone");
  assert.equal(hits[0]?.customerId, "c1");
});

test("name-only similarity is a distinct level", () => {
  const hits = matchCustomers({ name: "Marco Ruiz", customers: rows });
  assert.equal(hits[0]?.level, "name_only");
  assert.equal(hits[0]?.customerId, "c1");
});

test("no overlap is a new customer", () => {
  const hits = matchCustomers({ name: "Nobody", email: "new@casa.test", customers: rows });
  assert.equal(hits[0]?.level, "new");
  assert.equal(hits[0]?.customerId, null);
});
