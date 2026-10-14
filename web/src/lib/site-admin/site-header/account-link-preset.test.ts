/**
 * TUL-695: the simplest "Mi cuenta" entry is a link preset in the existing
 * header navigation editor, not a new block kind.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { accountLinkPreset, hasAccountLink } from "./account-link-preset";

test("preset label follows the editor locale, href is the account page", () => {
  assert.deepEqual(accountLinkPreset("es"), { label: "Mi cuenta", href: "/account" });
  assert.deepEqual(accountLinkPreset("en"), { label: "My account", href: "/account" });
});

test("detects an existing account link so the preset is not added twice", () => {
  assert.equal(hasAccountLink([{ href: "/" }, { href: "/account" }]), true);
  assert.equal(hasAccountLink([{ href: "/account?tab=settings" }]), true);
  assert.equal(hasAccountLink([{ href: "/accounts" }, { href: "/" }]), false);
});

test("navigation editor offers the preset", () => {
  const src = readFileSync(
    join(process.cwd(), "src/components/edit-chrome/inspectors/site-header/tabs/NavigationTab.tsx"),
    "utf8",
  );
  assert.ok(src.includes("accountLinkPreset("), "NavigationTab must use the preset");
  const es = readFileSync(join(process.cwd(), "src/components/edit-chrome/editor-i18n-es-inspectors-2.ts"), "utf8");
  assert.ok(es.includes('"Add My account link"'), "ES copy for the preset button");
});
