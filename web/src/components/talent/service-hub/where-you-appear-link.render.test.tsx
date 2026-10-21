import assert from "node:assert/strict";
import { describe, it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { WhereYouAppearLink } from "./WhereYouAppearLink";

describe("WhereYouAppearLink", () => {
  it("links to the Where you appear page from Money", () => {
    const html = renderToStaticMarkup(<WhereYouAppearLink />);
    assert.match(html, /data-testid="where-you-appear-link"/);
    assert.match(html, /href="\/talent\/where-you-appear"/);
  });
});
