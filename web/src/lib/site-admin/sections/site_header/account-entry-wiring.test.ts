import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { splitShell } from "@/lib/talent-site/server/render-max-site-shell";
import { withHeaderSiteChrome } from "@/lib/talent-site/server/render-max-site-demo";
import { withAccountItem } from "@/lib/talent-site/theme-catalog/section-kit-shell";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const header = (right: unknown[]) => ({ id: "h", kind: "section", props: { layerLabel: "Header", sectionProps: { regions: { left: [], center: [], right } } } }) as never;
const types = (n: unknown) => JSON.stringify(n).includes('"type":"account"');

test("a header with no language item still gets the account item (appended to the last region)", () => {
  const out = withAccountItem(header([{ type: "nav" }, { type: "cta" }]));
  assert.ok(types(out));
  const again = withAccountItem(out);
  assert.equal(JSON.stringify(again).split('"type":"account"').length - 1, 1);
});

test("splitShell honours the per-site switch: accountEntry false adds nothing", () => {
  const saved = process.env.CLIENT_ACCOUNT_HOSTS;
  process.env.CLIENT_ACCOUNT_HOSTS = "talent";
  try {
    const footer = { id: "f", kind: "section", props: { layerLabel: "Footer" } } as never;
    assert.equal(types(splitShell([header([{ type: "language" }]), footer], { accountEntry: false })[0]), false);
    assert.equal(types(splitShell([header([{ type: "language" }]), footer], { accountEntry: true })[0]), true);
  } finally {
    if (saved === undefined) delete process.env.CLIENT_ACCOUNT_HOSTS;
    else process.env.CLIENT_ACCOUNT_HOSTS = saved;
  }
});

test("siteChrome.account is false when the site switch is off, even with the flag on (hides a Builder Lab placed item)", () => {
  const saved = process.env.CLIENT_ACCOUNT_HOSTS;
  process.env.CLIENT_ACCOUNT_HOSTS = "talent";
  try {
    const on = withHeaderSiteChrome({}, "site_header", false, [], undefined, [], true) as { siteChrome: { account?: boolean } };
    const off = withHeaderSiteChrome({}, "site_header", false, [], undefined, [], false) as { siteChrome: { account?: boolean } };
    assert.equal(on.siteChrome.account, true);
    assert.equal(off.siteChrome.account, undefined);
  } finally {
    if (saved === undefined) delete process.env.CLIENT_ACCOUNT_HOSTS;
    else process.env.CLIENT_ACCOUNT_HOSTS = saved;
  }
});

test("container-header themes (Gridline, legacy kits) get the one shared overlay slot", () => {
  const doc = read("src/lib/talent-site/server/render-max-site-document.tsx");
  assert.match(doc, /HeaderAccountOverlay/);
  assert.match(doc, /accountEntry/);
  const render = read("src/lib/talent-site/server/render-max-site.tsx");
  assert.match(render, /resolveTalentAccountEntry/);
  assert.match(read("src/lib/talent-site/server/account-entry.server.ts"), /resolveClientAccountEntry/);
});

test("the signed-in panel renders the four quick links from the shared module", () => {
  const btn = read("src/components/client-account/ClientAccountButton.tsx");
  assert.match(btn, /accountQuickLinks/);
  const en = JSON.parse(read("messages/en.json"));
  const es = JSON.parse(read("messages/es.json"));
  for (const k of ["quickBookings", "quickMessages", "quickReceipts"]) {
    assert.ok(en.public.clientAccount[k], `en ${k}`);
    assert.ok(es.public.clientAccount[k], `es ${k}`);
  }
});

test("Website settings carries the ES/EN client account switch", () => {
  const ui = read("src/components/talent/website-settings/WebsiteSettingsSwitchGroups.tsx");
  assert.match(ui, /Client account on your site/);
  const es = read("src/components/admin/shell/internal/dashboard-i18n-website-settings.ts");
  assert.match(es, /"Client account on your site":/);
});
