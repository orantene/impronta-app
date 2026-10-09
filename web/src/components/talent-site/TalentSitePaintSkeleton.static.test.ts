/**
 * TUL-495 — public talent site first-paint skeleton.
 *
 * Soft-nav / streaming must never sit on a blank white page. The host and
 * `/t/site` loading.tsx files mount TalentSitePaintSkeleton with en+es copy.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import React from "react";

import { TalentSitePaintSkeleton } from "./TalentSitePaintSkeleton";

const webRoot = path.resolve(process.cwd());

test("skeleton paints structure with English and Spanish labels (no em dash)", () => {
  const en = renderToStaticMarkup(
    React.createElement(TalentSitePaintSkeleton, { locale: "en" }),
  );
  const es = renderToStaticMarkup(
    React.createElement(TalentSitePaintSkeleton, { locale: "es-MX" }),
  );
  assert.match(en, /data-talent-site-paint-skeleton=""/);
  assert.match(en, /Loading the site/);
  assert.match(es, /Cargando el sitio/);
  assert.doesNotMatch(en, /\u2014/);
  assert.doesNotMatch(es, /\u2014/);
  assert.match(en, /role="status"/);
  assert.match(en, /aria-busy="true"/);
});

test("talent host and /t/site loading.tsx mount the paint skeleton", () => {
  const hostLoading = readFileSync(
    path.join(webRoot, "src/app/%5Ftalent-site/loading.tsx"),
    "utf8",
  );
  const siteLoading = readFileSync(
    path.join(webRoot, "src/app/t/site/[siteSlug]/loading.tsx"),
    "utf8",
  );
  assert.match(hostLoading, /TalentSitePaintSkeleton/);
  assert.match(siteLoading, /TalentSitePaintSkeleton/);
});
