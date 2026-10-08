import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { splitShell } from "@/lib/talent-site/server/render-max-site-shell";
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
  const meta = readFileSync(join(process.cwd(), "src/components/edit-chrome/inspectors/site-header/tabs/regions-meta.tsx"), "utf8");
  assert.match(meta, /account:\s*\{/);
  const row = readFileSync(join(process.cwd(), "src/components/edit-chrome/inspectors/site-header/tabs/regions-item-row.tsx"), "utf8");
  assert.match(row, /case "account":/);
});

test("withAccountItem adds account right after language once, and is idempotent", () => {
  const header = { id: "h", kind: "section", props: { sectionProps: { regions: { left: [], center: [], right: [{ type: "nav" }, { type: "language" }, { type: "cta" }] } } } } as never;
  const once = withAccountItem(header) as unknown as { props: { sectionProps: { regions: { right: { type: string }[] } } } };
  assert.deepEqual(once.props.sectionProps.regions.right.map((i) => i.type), ["nav", "language", "account", "cta"]);
  const twice = withAccountItem(once as never) as unknown as typeof once;
  assert.deepEqual(twice.props.sectionProps.regions.right.map((i) => i.type), ["nav", "language", "account", "cta"]);
  const parsed = siteHeaderSchemaV1.safeParse({ brand: {}, regions: once.props.sectionProps.regions });
  assert.ok(parsed.success);
});

test("splitShell adds the account item at render time only when the talent flag is on, never baked in", () => {
  const header = { id: "h", kind: "section", props: { layerLabel: "Header", sectionProps: { regions: { left: [], center: [], right: [{ type: "language" }] } } } };
  const footer = { id: "f", kind: "section", props: { layerLabel: "Footer" } };
  const types = (nodes: unknown[]) => JSON.stringify(nodes).includes('"type":"account"');
  const saved = process.env.CLIENT_ACCOUNT_HOSTS;
  try {
    delete process.env.CLIENT_ACCOUNT_HOSTS;
    assert.equal(types(splitShell([header, footer] as never)[0]), false);
    process.env.CLIENT_ACCOUNT_HOSTS = "talent";
    assert.equal(types(splitShell([header, footer] as never)[0]), true);
    assert.equal(types(splitShell([header, footer] as never)[1]), false);
  } finally {
    if (saved === undefined) delete process.env.CLIENT_ACCOUNT_HOSTS;
    else process.env.CLIENT_ACCOUNT_HOSTS = saved;
  }
});
