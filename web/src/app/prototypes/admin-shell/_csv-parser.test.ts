/**
 * Unit tests for CSV parser helpers (WS-24.1 first scaffolding).
 *
 * Run with: npx tsx --test src/app/prototypes/admin-shell/_csv-parser.test.ts
 *
 * Lives next to the source per the prototype's "no test infra yet"
 * convention — `src/lib/*` does the same. When test count grows,
 * collect into `__tests__/` and add a glob to package.json.
 */

import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import {
  findColumn,
  parseTalentCsv,
  parseClientCsv,
  isValidTalentRow,
  isValidClientRow,
} from "./_csv-parser";

describe("findColumn", () => {
  it("matches exact header (case-insensitive)", () => {
    assert.equal(findColumn(["First", "Last", "Email"], "first"), 0);
    assert.equal(findColumn(["First", "Last", "Email"], "EMAIL"), 2);
  });

  it("matches prefix on column side (column starts with alias)", () => {
    // "firstname" starts with "first" → match
    assert.equal(findColumn(["firstname", "lastname"], "first"), 0);
    // "lastname" starts with "last" → match
    assert.equal(findColumn(["firstname", "lastname"], "last"), 1);
    // "full name" does NOT start with "name" → no match. Real callers
    // pass "full name" as one of the explicit aliases instead.
    assert.equal(findColumn(["full name", "email"], "name"), -1);
    assert.equal(findColumn(["full name", "email"], "full"), 0);
  });

  it("falls back through alias list", () => {
    assert.equal(findColumn(["surname"], "last", "lastname", "surname"), 0);
  });

  it("returns -1 when no alias matches", () => {
    assert.equal(findColumn(["foo", "bar"], "baz"), -1);
  });
});

describe("parseTalentCsv", () => {
  it("returns [] for empty input", () => {
    assert.deepEqual(parseTalentCsv(""), []);
    assert.deepEqual(parseTalentCsv("   \n  "), []);
  });

  it("parses header + rows", () => {
    const raw = "firstName,lastName,email\nSofia,Lupo,sofia@example.com\nCarlos,Pérez,carlos@example.com";
    const rows = parseTalentCsv(raw);
    assert.equal(rows.length, 2);
    assert.equal(rows[0].firstName, "Sofia");
    assert.equal(rows[0].lastName, "Lupo");
    assert.equal(rows[0].email, "sofia@example.com");
    assert.equal(rows[1].firstName, "Carlos");
  });

  it("splits a single 'name' column into first/last", () => {
    const raw = "name,email\nMarta Reyes,marta@example.com\nKai Lin,kai@example.com";
    const rows = parseTalentCsv(raw);
    assert.equal(rows[0].firstName, "Marta");
    assert.equal(rows[0].lastName, "Reyes");
    assert.equal(rows[1].firstName, "Kai");
    assert.equal(rows[1].lastName, "Lin");
  });

  it("tolerates header aliases", () => {
    const raw = "Given,Family,Mobile,E-mail\nLina,Park,+44 700,lina@example.com";
    const rows = parseTalentCsv(raw);
    assert.equal(rows[0].firstName, "Lina");
    assert.equal(rows[0].lastName, "Park");
    assert.equal(rows[0].phone, "+44 700");
    assert.equal(rows[0].email, "lina@example.com");
  });

  it("drops fully-empty rows", () => {
    const raw = "first,last,email\nSofia,Lupo,s@x.com\n,,\n";
    const rows = parseTalentCsv(raw);
    assert.equal(rows.length, 1);
  });

  it("survives Windows-style line endings", () => {
    const raw = "first,last,email\r\nSofia,Lupo,s@x.com\r\n";
    const rows = parseTalentCsv(raw);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].firstName, "Sofia");
  });
});

describe("parseClientCsv", () => {
  it("parses name + contact + email", () => {
    const raw = "name,contact,email\nVogue Italia,Sara Bianchi,sara@vogue.it";
    const rows = parseClientCsv(raw);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].name, "Vogue Italia");
    assert.equal(rows[0].contact, "Sara Bianchi");
  });

  it("accepts 'company' or 'brand' as name aliases", () => {
    const raw = "company,buyer,email\nMango,Joana,joana@mango.com";
    const rows = parseClientCsv(raw);
    assert.equal(rows[0].name, "Mango");
    assert.equal(rows[0].contact, "Joana");
  });
});

describe("validation", () => {
  it("isValidTalentRow requires first name + email", () => {
    assert.equal(isValidTalentRow({ firstName: "Sofia", lastName: "", email: "s@x.com", phone: "", type: "", city: "" }), true);
    assert.equal(isValidTalentRow({ firstName: "Sofia", lastName: "", email: "", phone: "", type: "", city: "" }), false);
    assert.equal(isValidTalentRow({ firstName: "", lastName: "Lupo", email: "s@x.com", phone: "", type: "", city: "" }), false);
  });

  it("isValidClientRow requires name + at least one of contact/email", () => {
    assert.equal(isValidClientRow({ name: "Mango", contact: "", email: "j@m.com" }), true);
    assert.equal(isValidClientRow({ name: "Mango", contact: "Joana", email: "" }), true);
    assert.equal(isValidClientRow({ name: "Mango", contact: "", email: "" }), false);
    assert.equal(isValidClientRow({ name: "", contact: "Joana", email: "j@m.com" }), false);
  });
});
