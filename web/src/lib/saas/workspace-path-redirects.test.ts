import assert from "node:assert/strict";
import { test } from "node:test";

import {
  freeSubdomainToPathRedirectUrl,
  shouldRedirectMarketingWorkspacePath,
} from "./workspace-path-redirects";

test("onb1-17: Free subdomain redirects to the path-canonical /w URL", () => {
  assert.equal(
    freeSubdomainToPathRedirectUrl({
      hostname: "qa-grok-salon.tulala.digital",
      tenantSlug: "qa-grok-salon",
      planTier: "free",
    }),
    "https://tulala.digital/w/qa-grok-salon",
  );
  assert.equal(
    freeSubdomainToPathRedirectUrl({
      hostname: "qa-grok-salon.tulala.digital",
      tenantSlug: "qa-grok-salon",
      planTier: "free",
      pathname: "/menu",
      search: "?x=1",
    }),
    "https://tulala.digital/w/qa-grok-salon/menu?x=1",
  );
});

test("onb1-17: paid / mismatched hosts do not path-redirect", () => {
  assert.equal(
    freeSubdomainToPathRedirectUrl({
      hostname: "qa-grok-salon.tulala.digital",
      tenantSlug: "qa-grok-salon",
      planTier: "studio",
    }),
    null,
  );
  assert.equal(
    freeSubdomainToPathRedirectUrl({
      hostname: "other.tulala.digital",
      tenantSlug: "qa-grok-salon",
      planTier: "free",
    }),
    null,
  );
});

test("marketing /{slug}/admin redirects to the app origin", () => {
  assert.equal(
    shouldRedirectMarketingWorkspacePath({
      hostKind: "marketing",
      canonicalPath: "/impronta/admin",
    }),
    true,
  );
  assert.equal(
    shouldRedirectMarketingWorkspacePath({
      hostKind: "marketing",
      canonicalPath: "/impronta/admin/roster",
    }),
    true,
  );
});

test("unknown marketing paths and non-marketing hosts do not redirect", () => {
  assert.equal(
    shouldRedirectMarketingWorkspacePath({
      hostKind: "marketing",
      canonicalPath: "/pricing",
    }),
    false,
  );
  assert.equal(
    shouldRedirectMarketingWorkspacePath({
      hostKind: "app",
      canonicalPath: "/impronta/admin",
    }),
    false,
  );
  assert.equal(
    shouldRedirectMarketingWorkspacePath({
      hostKind: "agency",
      canonicalPath: "/impronta/admin",
    }),
    false,
  );
});
