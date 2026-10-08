/**
 * TUL-76 regression: a freshly composed business site (real Looks, real
 * business components, a Spanish lash studio) must pass the tree checks the
 * Publish button runs: validateBuilderNodeTree on the home page and on the
 * site shell (header/footer landmarks), and the H1 check. Legacy shell
 * anchors saved with `{}` props are healed by the preflight, not blocked.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { validateBuilderNodeTree } from "@/lib/site-admin/builder-node/validate";
import { validateSectionProps } from "@/lib/site-admin/forms/sections";
import { builderTreeHasH1, withShellDefaults } from "@/lib/site-admin/edit-mode/shell-default-props";

import { LOOKS, buildComponentsForType, exampleContext, fixtureImageResolver, instantiateSite } from "./index";
import { buildShellLandmarks } from "./write-site-shell.server";

const ANCHORS = {
  header: { sectionId: "11111111-1111-4111-8111-111111111111", sortOrder: 0 },
  footer: { sectionId: "22222222-2222-4222-8222-222222222222", sortOrder: 1 },
};

test("every Look composes a home page and shell that validate and carry an H1", () => {
  for (const look of LOOKS) {
    const ctx = exampleContext("beauty", "lash-studio", "es");
    const site = instantiateSite({ look, locale: "es", identity: ctx.identity, images: fixtureImageResolver, components: buildComponentsForType("lash-studio", ctx) });
    const home = validateBuilderNodeTree(site.pages.home);
    assert.equal(home.ok, true, `${look.id} home: ${JSON.stringify(home.ok ? [] : home.issues.slice(0, 2))}`);
    const shell = validateBuilderNodeTree(buildShellLandmarks({ header: site.shell.header, footer: site.shell.footer, anchors: ANCHORS }));
    assert.equal(shell.ok, true, `${look.id} shell: ${JSON.stringify(shell.ok ? [] : shell.issues.slice(0, 2))}`);
    assert.equal(builderTreeHasH1(site.pages.home), true, `${look.id}: composed home has an H1`);
  }
});

test("legacy header/footer anchors saved with empty props pass after the preflight heal; a truly invalid prop still fails", () => {
  for (const type of ["site_header", "site_footer"]) {
    assert.equal(validateSectionProps(type, 1, withShellDefaults(type, {})).ok, true);
    assert.equal(validateSectionProps(type, 1, withShellDefaults(type, { brand: { label: 42 } })).ok, false);
  }
});
