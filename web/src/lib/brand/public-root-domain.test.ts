import assert from "node:assert/strict";
import test from "node:test";

import {
  publicSubdomainHost,
  rehomeToPublicRoot,
  resolvePublicRootDomain,
  resolvePublicRootOrigin,
} from "./public-root-domain";
import { platformSelfProfileUrl } from "@/lib/talent/agency-roster-profile-url";
import { talentPublicProfileHref } from "@/lib/talent/public-profile-href";

const STAGING = {
  VERCEL_ENV: "preview",
  NEXT_PUBLIC_APP_URL: "https://app.staging.tulala.digital",
  NEXT_PUBLIC_SITE_URL: "https://staging.tulala.digital",
  TALENT_SITE_ROOT_DOMAIN: "staging.tulala.digital",
} as const;
const PROD = {
  VERCEL_ENV: "production",
  NEXT_PUBLIC_APP_URL: "https://app.tulala.digital",
  NEXT_PUBLIC_SITE_URL: "https://tulala.digital",
  TALENT_SITE_ROOT_DOMAIN: "staging.tulala.digital",
} as const;

test("staging env -> staging root, origin and subdomain hosts", () => {
  assert.equal(resolvePublicRootDomain(STAGING), "staging.tulala.digital");
  assert.equal(resolvePublicRootOrigin(STAGING), "https://staging.tulala.digital");
  assert.equal(publicSubdomainHost("acme", STAGING), "acme.staging.tulala.digital");
});

test("staging without TALENT_SITE_ROOT_DOMAIN falls back to NEXT_PUBLIC_SITE_URL", () => {
  const env = { VERCEL_ENV: "preview", NEXT_PUBLIC_SITE_URL: "https://staging.tulala.digital" };
  assert.equal(resolvePublicRootDomain(env), "staging.tulala.digital");
});

test("prod env -> tulala.digital, and a stray staging variable cannot move it", () => {
  assert.equal(resolvePublicRootDomain(PROD), "tulala.digital");
  assert.equal(resolvePublicRootOrigin(PROD), "https://tulala.digital");
  assert.equal(publicSubdomainHost("acme", PROD), "acme.tulala.digital");
});

test("unset, local and surface-style site urls fall back to tulala.digital", () => {
  assert.equal(resolvePublicRootDomain({}), "tulala.digital");
  assert.equal(resolvePublicRootDomain({ NEXT_PUBLIC_SITE_URL: "http://localhost:3000" }), "tulala.digital");
  assert.equal(resolvePublicRootDomain({ NEXT_PUBLIC_SITE_URL: "https://www.tulala.digital" }), "tulala.digital");
  assert.equal(resolvePublicRootDomain({ NEXT_PUBLIC_SITE_URL: "not a url" }), "tulala.digital");
});

test("rehomeToPublicRoot moves production-pattern hosts on staging only", () => {
  assert.equal(rehomeToPublicRoot("ambas-r6a-amdkhv.tulala.digital", STAGING), "ambas-r6a-amdkhv.staging.tulala.digital");
  assert.equal(rehomeToPublicRoot("tulala.digital", STAGING), "staging.tulala.digital");
  assert.equal(rehomeToPublicRoot("x.staging.tulala.digital", STAGING), "x.staging.tulala.digital");
  assert.equal(rehomeToPublicRoot("improntamodels.com", STAGING), "improntamodels.com");
  assert.equal(rehomeToPublicRoot("ambas-r6a-amdkhv.tulala.digital", PROD), "ambas-r6a-amdkhv.tulala.digital");
});

function withEnv<T>(vars: Record<string, string | undefined>, fn: () => T): T {
  const saved: Record<string, string | undefined> = {};
  for (const k of Object.keys(vars)) {
    saved[k] = process.env[k];
    if (vars[k] === undefined) delete process.env[k];
    else process.env[k] = vars[k];
  }
  try {
    return fn();
  } finally {
    for (const k of Object.keys(saved)) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  }
}

test("talent self page url (Dónde apareces) follows the environment", () => {
  withEnv({ VERCEL_ENV: "preview", TALENT_SITE_ROOT_DOMAIN: "staging.tulala.digital", NEXT_PUBLIC_SITE_URL: "https://staging.tulala.digital" }, () => {
    assert.equal(platformSelfProfileUrl("TAL-97110"), "https://staging.tulala.digital/t/TAL-97110");
    assert.equal(talentPublicProfileHref("TAL-97110"), "https://staging.tulala.digital/t/TAL-97110");
  });
  withEnv({ VERCEL_ENV: "production", TALENT_SITE_ROOT_DOMAIN: undefined, NEXT_PUBLIC_SITE_URL: "https://tulala.digital" }, () => {
    assert.equal(platformSelfProfileUrl("TAL-97110"), "https://tulala.digital/t/TAL-97110");
    assert.equal(talentPublicProfileHref("TAL-97110"), "https://tulala.digital/t/TAL-97110");
  });
});

test("Get Found links and website addresses follow the environment, never a production literal", () => {
  withEnv({ VERCEL_ENV: "preview", TALENT_SITE_ROOT_DOMAIN: "staging.tulala.digital", NEXT_PUBLIC_SITE_URL: "https://staging.tulala.digital" }, () => {
    assert.equal(talentPublicProfileHref("TAL-1"), "https://staging.tulala.digital/t/TAL-1");
    assert.equal(publicSubdomainHost("jor"), "jor.staging.tulala.digital");
  });
});
