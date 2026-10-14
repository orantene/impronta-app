import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { rosterlessDirectoryRedirectHref } from "./directory-nav-href";

const settings = { defaultLocale: "es", publicLocales: ["es", "en"] } as never;

describe("rosterlessDirectoryRedirectHref (TUL-711)", () => {
  it("keeps the /w/<slug> prefix on a path-addressed workspace", () => {
    assert.equal(
      rosterlessDirectoryRedirectHref({ pathPrefix: "/w/qa-grok-workspace", locale: "es", settings }),
      "/w/qa-grok-workspace/book",
    );
  });

  it("stays on /book for hostname-addressed workspaces", () => {
    assert.equal(
      rosterlessDirectoryRedirectHref({ pathPrefix: "", locale: "es", settings }),
      "/book",
    );
  });
});
