/**
 * TUL-516 W4-7 — soft-nav between *-demo hosts must force a full document
 * navigation when the hostname changes (was TUL-322 / TUL-208 G2).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "node:test";

import {
  hrefRequiresFullNavigation,
  normalizeHostname,
  servedHostMismatch,
} from "./host-full-navigation";

const ALEX = "alex-trevino-demo.tulala.digital";
const CAMILA = "camila-nails-demo.tulala.digital";

describe("TUL-516 host changes force full navigation", () => {
  test("demo host → other demo host requires a full document navigation", () => {
    assert.equal(
      hrefRequiresFullNavigation(ALEX, `https://${CAMILA}/`),
      true,
    );
    assert.equal(
      hrefRequiresFullNavigation(ALEX, `https://${CAMILA}/politicas`),
      true,
    );
    assert.equal(
      hrefRequiresFullNavigation(ALEX, `//${CAMILA}/`),
      true,
    );
  });

  test("same host absolute and relative paths stay soft-nav safe", () => {
    assert.equal(hrefRequiresFullNavigation(ALEX, `https://${ALEX}/`), false);
    assert.equal(hrefRequiresFullNavigation(ALEX, `https://${ALEX}/en`), false);
    assert.equal(hrefRequiresFullNavigation(ALEX, "/politicas"), false);
    assert.equal(hrefRequiresFullNavigation(ALEX, "/en/politicas"), false);
    assert.equal(hrefRequiresFullNavigation(ALEX, "#services"), false);
    assert.equal(hrefRequiresFullNavigation(ALEX, "?lang=en"), false);
    assert.equal(hrefRequiresFullNavigation(ALEX, ""), false);
    assert.equal(hrefRequiresFullNavigation(ALEX, null), false);
  });

  test("non-http schemes and garbage never force a host hop", () => {
    assert.equal(hrefRequiresFullNavigation(ALEX, "mailto:hi@example.com"), false);
    assert.equal(hrefRequiresFullNavigation(ALEX, "tel:+525555555555"), false);
    assert.equal(hrefRequiresFullNavigation(ALEX, "javascript:void(0)"), false);
    assert.equal(hrefRequiresFullNavigation(ALEX, "not a url"), false);
  });

  test("servedHostMismatch detects the soft-nav stale-talent symptom", () => {
    assert.equal(servedHostMismatch(ALEX, CAMILA), true);
    assert.equal(servedHostMismatch(ALEX, ALEX), false);
    assert.equal(servedHostMismatch(ALEX, ALEX.toUpperCase()), false);
    assert.equal(servedHostMismatch("", CAMILA), false);
    assert.equal(servedHostMismatch(ALEX, ""), false);
    assert.equal(normalizeHostname(` ${ALEX} `), ALEX);
  });

  test("talent host route mounts the full-nav guard and forces location.assign", () => {
    const root = join(process.cwd(), "src");
    const page = readFileSync(
      join(root, "app/%5Ftalent-site/[[...pageSlug]]/page.tsx"),
      "utf8",
    );
    const guard = readFileSync(
      join(root, "components/talent-site/talent-site-host-full-nav.tsx"),
      "utf8",
    );
    assert.match(page, /TalentSiteHostFullNav/);
    assert.match(page, /servedHost=\{/);
    assert.match(guard, /"use client"/);
    assert.match(guard, /hrefRequiresFullNavigation/);
    assert.match(guard, /servedHostMismatch/);
    assert.match(guard, /location\.assign/);
    assert.match(guard, /location\.replace/);
  });
});
