import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  SUPPORT_DESK_HOST_PATH,
  SUPPORT_DESK_LOCAL_PATH,
  supportDeskHref,
  supportDeskOpenFromHqHref,
  supportDeskPortalRedirectHref,
} from "./desk-url";

describe("desk-url", () => {
  it("local path carries ticket query", () => {
    assert.equal(
      supportDeskHref({ ticketId: "abc" }),
      `${SUPPORT_DESK_LOCAL_PATH}?ticket=abc`,
    );
  });

  it("support host uses /desk", () => {
    assert.equal(
      supportDeskHref({ host: "support.tulala.digital", ticketId: "x" }),
      `${SUPPORT_DESK_HOST_PATH}?ticket=x`,
    );
  });

  it("absoluteHost always points at primary Desk host", () => {
    assert.match(
      supportDeskHref({ absoluteHost: true }),
      /^https:\/\/support\.tulala\.digital\/desk$/,
    );
  });

  it("HQ open link is /desk in development", () => {
    // NODE_ENV is development in unit tests / local agent runs.
    if (process.env.NODE_ENV === "development") {
      assert.equal(supportDeskOpenFromHqHref(), SUPPORT_DESK_HOST_PATH);
    } else {
      assert.match(supportDeskOpenFromHqHref(), /^https:\/\/support\.tulala\.digital\/desk$/);
    }
  });

  it("portal redirect preserves ticket + view on the open-from-HQ base", () => {
    const href = supportDeskPortalRedirectHref({ ticketId: "t1", view: "ideas" });
    assert.match(href, /[?&]ticket=t1/);
    assert.match(href, /[?&]view=ideas/);
    if (process.env.NODE_ENV === "development") {
      assert.ok(href.startsWith(SUPPORT_DESK_HOST_PATH));
    } else {
      assert.match(href, /^https:\/\/support\.tulala\.digital\/desk\?/);
    }
  });
});
