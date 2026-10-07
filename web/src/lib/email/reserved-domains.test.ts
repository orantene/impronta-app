/**
 * UNIT TEST — reserved-domain guard in the email sender (2026-09-28).
 *
 * Demo and QA accounts use reserved domains (@impronta.test). Those can never
 * receive mail, so a real send is a guaranteed hard bounce that hurts the
 * sending domain. The sender must drop them and never call the provider for
 * them, while real recipients in the same send still get the email.
 *
 * Run: npx tsx --test src/lib/email/reserved-domains.test.ts
 */

import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import { isReservedDomainAddress, partitionReservedRecipients } from "./reserved-domains";

describe("isReservedDomainAddress", () => {
  it("flags every reserved TLD", () => {
    for (const a of [
      "demo-renata@impronta.test",
      "someone@example",
      "x@mail.example",
      "x@foo.invalid",
      "x@localhost",
      "x@app.localhost",
    ]) {
      assert.equal(isReservedDomainAddress(a), true, a);
    }
  });

  it("is case-insensitive and reads display-name form", () => {
    assert.equal(isReservedDomainAddress("Renata <Demo@Impronta.TEST>"), true);
    assert.equal(isReservedDomainAddress("x@impronta.test."), true);
  });

  it("leaves real domains alone, including look-alikes", () => {
    for (const a of [
      "orantene@gmail.com",
      "a@tulala.digital",
      "a@test.com",
      "a@myexample.com",
      "a@example.com.au",
      "a@notexample.org",
      "a@testing.io",
      "Name <a@contest.mx>",
    ]) {
      assert.equal(isReservedDomainAddress(a), false, a);
    }
  });

  it("flags RFC 2606 reserved second-level domains and their subdomains (TUL-108)", () => {
    for (const a of [
      "a@example.com",
      "A@Example.COM",
      "x@mail.example.com",
      "x@example.net",
      "x@example.org",
      "Name <a@example.com>",
      "a@example.com.",
    ]) {
      assert.equal(isReservedDomainAddress(a), true, a);
    }
  });

  it("returns false for strings with no address", () => {
    assert.equal(isReservedDomainAddress("not-an-email"), false);
  });
});

describe("partitionReservedRecipients", () => {
  it("splits a mixed list", () => {
    assert.deepEqual(partitionReservedRecipients(["a@tulala.digital", "b@impronta.test"]), {
      deliverable: ["a@tulala.digital"],
      reserved: ["b@impronta.test"],
    });
  });

  it("handles a single string", () => {
    assert.deepEqual(partitionReservedRecipients("b@impronta.test"), {
      deliverable: [],
      reserved: ["b@impronta.test"],
    });
  });
});

describe("sendEmailResult", () => {
  it("skips a reserved-only send without calling the provider", async () => {
    // A key is set, so without the guard this would reach Resend.
    process.env.RESEND_API_KEY = "re_test_guard_should_not_be_used";
    const { sendEmailResult } = await import("./index");
    const res = await sendEmailResult({
      to: ["demo-renata@impronta.test"],
      subject: "Guard test",
      html: "<p>x</p>",
    });
    assert.deepEqual(res, { status: "skipped", reason: "reserved_domain" });
  });
});
