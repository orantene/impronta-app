import assert from "node:assert/strict";
import { test } from "node:test";

import { shouldRedirectMarketingWorkspacePath } from "./workspace-path-redirects";

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
