import assert from "node:assert/strict";
import { describe, it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { CatalogServiceHubLink } from "./CatalogServiceHubLink";

describe("CatalogServiceHubLink", () => {
  it("links to the owner service hub under the admin root", () => {
    const html = renderToStaticMarkup(<CatalogServiceHubLink />);
    assert.match(html, /data-testid="catalog-service-hub-link"/);
    assert.match(html, /href="\/admin\/catalog\/service-hub"/);
  });
});
