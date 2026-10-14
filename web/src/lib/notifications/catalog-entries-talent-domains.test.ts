import assert from "node:assert/strict";
import test from "node:test";

import { findCatalogEntries, findCatalogEntryById } from "./catalog";
import { getEmailCopy } from "./email-copy";

test("talent domain breakage + renewal catalog entries exist", () => {
  const broken = findCatalogEntryById("talent.domain_broken");
  const renewal = findCatalogEntryById("talent.domain_renewal_notice");
  assert.ok(broken);
  assert.ok(renewal);
  assert.deepEqual(broken?.triggers, ["talent.domain_broken"]);
  assert.deepEqual(renewal?.triggers, ["talent.domain_renewal_notice"]);
  assert.equal(broken?.email?.templateId, "talent.domain_broken");
  assert.equal(renewal?.email?.templateId, "talent.domain_renewal_notice");
});

test("talent.domain_* events resolve via findCatalogEntries", () => {
  assert.equal(findCatalogEntries("talent.domain_broken").length, 1);
  assert.equal(findCatalogEntries("talent.domain_renewal_notice").length, 1);
});

test("talent domain email copy has en + es parity keys", () => {
  const en = getEmailCopy("en");
  const es = getEmailCopy("es");
  for (const key of ["talent.domain_broken", "talent.domain_renewal_notice"] as const) {
    assert.ok(en[key], `missing EN ${key}`);
    assert.ok(es[key], `missing ES ${key}`);
    assert.deepEqual(Object.keys(en[key]).sort(), Object.keys(es[key]).sort());
  }
});
