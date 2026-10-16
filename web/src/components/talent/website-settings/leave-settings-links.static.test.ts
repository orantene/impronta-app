import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (f: string) => readFileSync(new URL(f, import.meta.url), "utf8");

test("TUL-722: the Personal site row does not replace the Settings page", () => {
  const src = read("./WebsiteSettingsScreen.tsx");
  assert.doesNotMatch(src, /window\.location\.assign\(PERSONAL_SITE_BUILDER_HREF\)/);
  assert.match(src, /window\.open\(PERSONAL_SITE_BUILDER_HREF, "_blank", "noopener,noreferrer"\)/);
});

test("TUL-722: the Policies 'Services' link opens beside Settings, not over it", () => {
  const src = read("./PoliciesView.tsx");
  assert.match(src, /<Link href="\/talent\/services" target="_blank" rel="noopener noreferrer"/);
});
