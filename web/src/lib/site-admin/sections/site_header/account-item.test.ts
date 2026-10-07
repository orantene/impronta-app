import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { ITEM_META } from "@/components/edit-chrome/inspectors/site-header/tabs/regions-meta";
import { withAccountItem } from "@/lib/talent-site/theme-catalog/section-kit-shell";

import { HEADER_ITEM_KINDS, defaultItemForKind } from "./regions-editing";
import { siteHeaderSchemaV1 } from "./schema";

test("schema accepts the account item and rejects unknown ones", () => {
  const ok = siteHeaderSchemaV1.safeParse({ brand: {}, regions: { left: [], center: [], right: [{ type: "account" }, { type: "language" }] } });
  assert.ok(ok.success, ok.success ? "" : JSON.stringify(ok.error.issues));
  const bad = siteHeaderSchemaV1.safeParse({ brand: {}, regions: { left: [], center: [], right: [{ type: "acount" }] } });
  assert.equal(bad.success, false);
});

test("four layers: palette, defaults, inspector meta and inspector row all know account", () => {
  assert.ok(HEADER_ITEM_KINDS.includes("account"));
  assert.equal(defaultItemForKind("account").type, "account");
  assert.ok(ITEM_META.account.label && ITEM_META.account.description);
  const row = readFileSync(join(process.cwd(), "src/components/edit-chrome/inspectors/site-header/tabs/regions-item-row.tsx"), "utf8");
  assert.match(row, /case "account":/);
});

test("withAccountItem adds account right after language once, and is idempotent", () => {
  const header = { id: "h", kind: "section", props: { sectionProps: { regions: { left: [], center: [], right: [{ type: "nav" }, { type: "language" }, { type: "cta" }] } } } } as never;
  const once = withAccountItem(header) as { props: { sectionProps: { regions: { right: { type: string }[] } } } };
  assert.deepEqual(once.props.sectionProps.regions.right.map((i) => i.type), ["nav", "language", "account", "cta"]);
  const twice = withAccountItem(once as never) as typeof once;
  assert.deepEqual(twice.props.sectionProps.regions.right.map((i) => i.type), ["nav", "language", "account", "cta"]);
  const parsed = siteHeaderSchemaV1.safeParse({ brand: {}, regions: once.props.sectionProps.regions });
  assert.ok(parsed.success);
});
