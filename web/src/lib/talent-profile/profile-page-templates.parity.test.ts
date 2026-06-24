import { test } from "node:test";
import assert from "node:assert/strict";

import {
  PROFILE_PAGE_TEMPLATES,
  PROFILE_PAGE_TEMPLATE_ORDER,
  DEFAULT_PROFILE_PAGE_TEMPLATE,
  resolveProfilePageTemplateKey,
} from "@/lib/talent-profile/profile-page-templates";
import { getToken } from "@/lib/site-admin/tokens/registry";

// Guards against drift between the three places a profile template is declared:
// the chooser catalog (this registry), the design-token validator (which the
// save server action checks against), and the render-path dispatcher.

test("every ordered key has a matching catalog entry", () => {
  for (const key of PROFILE_PAGE_TEMPLATE_ORDER) {
    const def = PROFILE_PAGE_TEMPLATES[key];
    assert.ok(def, `no catalog entry for ordered key "${key}"`);
    assert.equal(def.key, key, `entry.key mismatch for "${key}"`);
  }
});

test("default template is present in the catalog", () => {
  assert.ok(
    PROFILE_PAGE_TEMPLATES[DEFAULT_PROFILE_PAGE_TEMPLATE],
    "default template missing from catalog",
  );
});

test("every catalog tokenValue is accepted by the profile-layout-family token validator", () => {
  // If a template is offered in the chooser but its tokenValue isn't a valid
  // value for `template.profile-layout-family`, the save server action would
  // reject the user's pick. This locks the two in sync.
  const spec = getToken("template.profile-layout-family");
  assert.ok(spec, "template.profile-layout-family token is not registered");
  for (const key of PROFILE_PAGE_TEMPLATE_ORDER) {
    const value = PROFILE_PAGE_TEMPLATES[key].tokenValue;
    const result = spec!.validator.safeParse(value);
    assert.ok(
      result.success,
      `tokenValue "${value}" (template "${key}") is rejected by the token validator`,
    );
  }
});

test("resolveProfilePageTemplateKey maps known values and falls back for the rest", () => {
  for (const key of PROFILE_PAGE_TEMPLATE_ORDER) {
    assert.equal(resolveProfilePageTemplateKey(key), key);
  }
  // Registry values that don't (yet) have a distinct template fall back to default.
  assert.equal(resolveProfilePageTemplateKey("editorial-bridal"), DEFAULT_PROFILE_PAGE_TEMPLATE);
  assert.equal(resolveProfilePageTemplateKey("service-professional"), DEFAULT_PROFILE_PAGE_TEMPLATE);
  assert.equal(resolveProfilePageTemplateKey(null), DEFAULT_PROFILE_PAGE_TEMPLATE);
  assert.equal(resolveProfilePageTemplateKey(undefined), DEFAULT_PROFILE_PAGE_TEMPLATE);
  assert.equal(resolveProfilePageTemplateKey("nonsense"), DEFAULT_PROFILE_PAGE_TEMPLATE);
});
