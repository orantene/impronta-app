/**
 * TUL-124 — "Not shown on your site" copy for live-dropped builder blocks.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  NOT_SHOWN_ON_SITE_EN,
  NOT_SHOWN_ON_SITE_ES,
  notShownOnSiteLabel,
} from "./not-shown-on-site";

test("notShownOnSiteLabel is English by default", () => {
  assert.equal(notShownOnSiteLabel(), NOT_SHOWN_ON_SITE_EN);
  assert.equal(notShownOnSiteLabel("en"), NOT_SHOWN_ON_SITE_EN);
  assert.equal(notShownOnSiteLabel(null), NOT_SHOWN_ON_SITE_EN);
});

test("notShownOnSiteLabel is Mexican Spanish for es locales", () => {
  assert.equal(notShownOnSiteLabel("es"), NOT_SHOWN_ON_SITE_ES);
  assert.equal(notShownOnSiteLabel("es-MX"), NOT_SHOWN_ON_SITE_ES);
  assert.doesNotMatch(NOT_SHOWN_ON_SITE_ES, /—|–/);
});
