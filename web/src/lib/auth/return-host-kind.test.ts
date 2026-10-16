import { test } from "node:test";
import assert from "node:assert/strict";

import {
  classifyReturnHost,
  isSsoHandoffHostKind,
  type ReturnHostLookups,
} from "./return-host-kind";

function lookups(over: Partial<ReturnHostLookups> = {}): ReturnHostLookups {
  return {
    agencyDomainKind: async () => null,
    isLiveTalentCustomDomain: async () => false,
    isLiveTalentSubdomain: async () => false,
    talentSubdomainsEnabled: true,
    ...over,
  };
}

test("agency_domains rows classify by kind (custom vs platform)", async () => {
  assert.equal(
    await classifyReturnHost("impronta.tulala.digital", lookups({ agencyDomainKind: async () => "subdomain" })),
    "agency",
  );
  assert.equal(
    await classifyReturnHost("agency.com", lookups({ agencyDomainKind: async () => "custom" })),
    "agency_custom",
  );
});

test("a live talent custom domain classifies as talent_custom", async () => {
  assert.equal(
    await classifyReturnHost("jorgelina.com", lookups({ isLiveTalentCustomDomain: async (h) => h === "jorgelina.com" })),
    "talent_custom",
  );
});

test("a live talent subdomain classifies as talent_subdomain when the switch is on", async () => {
  const l = lookups({ isLiveTalentSubdomain: async (h) => h === "jor.tulala.digital" });
  assert.equal(await classifyReturnHost("jor.tulala.digital", l), "talent_subdomain");
  assert.equal(await classifyReturnHost("nobody.tulala.digital", l), null);
});

test("talent subdomains are not trusted while the subdomain switch is off", async () => {
  let called = false;
  const l = lookups({
    talentSubdomainsEnabled: false,
    isLiveTalentSubdomain: async () => {
      called = true;
      return true;
    },
  });
  assert.equal(await classifyReturnHost("jor.tulala.digital", l), null);
  assert.equal(called, false);
});

test("host is normalized (case, port) and empty hosts fail closed", async () => {
  const seen: string[] = [];
  const l = lookups({
    agencyDomainKind: async (h) => {
      seen.push(h);
      return null;
    },
  });
  await classifyReturnHost("JorGelina.com:443", l);
  assert.deepEqual(seen, ["jorgelina.com"]);
  assert.equal(await classifyReturnHost("", l), null);
  assert.equal(await classifyReturnHost(":443", l), null);
});

test("a lookup error fails closed", async () => {
  const l = lookups({
    agencyDomainKind: async () => {
      throw new Error("db down");
    },
    isLiveTalentCustomDomain: async () => true,
  });
  assert.equal(await classifyReturnHost("jorgelina.com", l), null);
});

test("only custom domains (agency or talent) need the SSO session hand-off", () => {
  assert.equal(isSsoHandoffHostKind("agency_custom"), true);
  assert.equal(isSsoHandoffHostKind("talent_custom"), true);
  assert.equal(isSsoHandoffHostKind("agency"), false);
  assert.equal(isSsoHandoffHostKind("talent_subdomain"), false);
  assert.equal(isSsoHandoffHostKind(null), false);
});
