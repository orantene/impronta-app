import assert from "node:assert/strict";
import { test } from "node:test";

import { internalWebsiteSubnavItems, type WebsiteSubnavItem } from "./website-nav-types";

function item(partial: Partial<WebsiteSubnavItem> & Pick<WebsiteSubnavItem, "id">): WebsiteSubnavItem {
  return {
    label: partial.label ?? partial.id,
    i18nKey: partial.i18nKey ?? `dashboard.adminWebsite.nav.${partial.id}Label`,
    descriptionI18nKey: partial.descriptionI18nKey ?? `dashboard.adminWebsite.nav.${partial.id}Description`,
    href: partial.href ?? `/website/${partial.id}`,
    external: partial.external,
    icon: partial.icon ?? "globe",
    id: partial.id,
  };
}

test("internalWebsiteSubnavItems: drops external items (Design)", () => {
  const items = [
    item({ id: "overview" }),
    item({ id: "design", external: true }),
    item({ id: "card-design" }),
  ];
  const result = internalWebsiteSubnavItems(items);
  assert.deepEqual(
    result.map((i) => i.id),
    ["overview", "card-design"],
  );
});

test("internalWebsiteSubnavItems: no-op when nothing is external", () => {
  const items = [item({ id: "overview" }), item({ id: "card-design" })];
  assert.equal(internalWebsiteSubnavItems(items).length, 2);
});

test("internalWebsiteSubnavItems: empty list stays empty", () => {
  assert.deepEqual(internalWebsiteSubnavItems([]), []);
});
