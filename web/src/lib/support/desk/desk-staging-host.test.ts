import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";

import {
  isSupportDeskHost,
  supportDeskPrimaryHostFor,
} from "@/lib/support/desk-hosts";
import { cookieDomainForHost } from "@/lib/supabase/cookie-domain";
import {
  supportDeskHref,
  supportDeskPortalRedirectHref,
} from "./desk-url";

describe("supportDeskPrimaryHostFor", () => {
  const cases: Array<[string | null | undefined, string]> = [
    ["app.tulala.digital", "support.tulala.digital"],
    ["support.tulala.digital", "support.tulala.digital"],
    ["staging.tulala.digital", "support.staging.tulala.digital"],
    ["app.staging.tulala.digital", "support.staging.tulala.digital"],
    ["pay.staging.tulala.digital:443", "support.staging.tulala.digital"],
    ["hub.staging.tulala.digital", "support.staging.tulala.digital"],
    ["support.staging.tulala.digital", "support.staging.tulala.digital"],
    ["staging-qa-journeys.tulala.digital", "support.staging.tulala.digital"],
    ["APP.STAGING.TULALA.DIGITAL", "support.staging.tulala.digital"],
    ["example.com", "support.tulala.digital"],
    ["notstaging.tulala.digital", "support.tulala.digital"],
    ["", "support.tulala.digital"],
    [null, "support.tulala.digital"],
    [undefined, "support.tulala.digital"],
  ];
  for (const [host, want] of cases) {
    it(`${String(host)} -> ${want}`, () => {
      assert.equal(supportDeskPrimaryHostFor(host), want);
    });
  }
});

describe("staging desk host gating", () => {
  it("support.staging is a desk host with host-scoped cookies", () => {
    assert.equal(isSupportDeskHost("support.staging.tulala.digital"), true);
    assert.equal(cookieDomainForHost("support.staging.tulala.digital"), undefined);
  });
  it("prod and staging app hosts keep their own cookie scope", () => {
    assert.equal(cookieDomainForHost("app.tulala.digital"), ".tulala.digital");
  });
});

describe("desk URLs on staging", () => {
  const env = process.env as Record<string, string | undefined>;
  let prev: string | undefined;
  beforeEach(() => {
    prev = env.NODE_ENV;
    env.NODE_ENV = "production";
  });
  afterEach(() => {
    env.NODE_ENV = prev;
  });

  it("portal redirect on a staging host opens the staging desk", () => {
    assert.equal(
      supportDeskPortalRedirectHref({
        ticketId: "t1",
        host: "app.staging.tulala.digital",
      }),
      "https://support.staging.tulala.digital/desk?ticket=t1",
    );
  });
  it("portal redirect without a host stays on prod", () => {
    assert.equal(
      supportDeskPortalRedirectHref(),
      "https://support.tulala.digital/desk",
    );
  });
  it("absoluteHost follows the staging host", () => {
    assert.equal(
      supportDeskHref({ absoluteHost: true, host: "staging.tulala.digital" }),
      "https://support.staging.tulala.digital/desk",
    );
  });
});
