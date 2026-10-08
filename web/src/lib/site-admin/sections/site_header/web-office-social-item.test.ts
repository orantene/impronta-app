import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { withSocialItem } from "@/lib/talent-site/server/header-social-item";
import { splitShell } from "@/lib/talent-site/server/render-max-site-shell";
import { webOfficeCtxFor, webOfficeHeaderSocial } from "@/lib/talent-site/server/web-office-footer";
import { webOfficeSocialEnabled } from "@/lib/talent-site/web-office-social";

import { withHeaderSiteChrome } from "@/lib/talent-site/server/render-max-site-demo";
import { siteHeaderSchemaV1 } from "./schema";

const ig = { platform: "instagram", href: "https://instagram.com/jor" };
const tt = { platform: "tiktok", href: "https://www.tiktok.com/@jor" };
const wa = { platform: "whatsapp", href: "https://wa.me/525512345678" };

const header = () =>
  ({ id: "h", kind: "section", props: { layerLabel: "Header", sectionProps: { regions: { left: [], center: [], right: [{ type: "nav" }, { type: "language" }, { type: "cta" }] } } } }) as never;
const footer = { id: "f", kind: "section", props: { layerLabel: "Footer" } };
const rightTypes = (h: unknown) =>
  (h as { props: { sectionProps: { regions: { right: { type: string }[] } } } }).props.sectionProps.regions.right.map((i) => i.type);

const ctx = webOfficeCtxFor(true, { canonicalOrigin: "https://jor.example.com" });
const links = (records: { platform: string; href: string }[], c = ctx, locale = "en") => webOfficeHeaderSocial(c, records, locale);

test("which links render: none, partial, all three; Free renders none", () => {
  assert.deepEqual(links([]), []);
  assert.deepEqual(links([tt]).map((l) => l.platform), ["tiktok"]);
  assert.deepEqual(links([wa, tt, ig]).map((l) => l.platform), ["instagram", "tiktok", "whatsapp"]);
  assert.deepEqual(links([ig, tt, wa], webOfficeCtxFor(webOfficeSocialEnabled("talent_basic"), {})), []);
  assert.deepEqual(links([ig, tt, wa], null), []);
  assert.equal(webOfficeCtxFor(webOfficeSocialEnabled("talent_portfolio"), {}) !== null, true);
});

test("urls and labels: https only, wa.me with the came-from line, es and en aria labels", () => {
  const en = links([ig, tt, wa]);
  assert.equal(en[0].href, "https://instagram.com/jor");
  assert.equal(en[0].label, "See my Instagram");
  assert.match(en[2].href, /^https:\/\/wa\.me\/525512345678\?text=/);
  assert.match(decodeURIComponent(en[2].href), /found you on your website \(jor\.example\.com\)/);
  const es = links([ig, wa], ctx, "es");
  assert.equal(es[0].label, "Mira mi Instagram");
  assert.match(decodeURIComponent(es[1].href), /vengo de tu sitio web/);
  assert.deepEqual(links([{ platform: "instagram", href: "http://insecure.example" }]), []);
  assert.ok(![...en, ...es].some((l) => /—/.test(l.label + decodeURIComponent(l.href))));
});

test("withSocialItem adds social right after language once, idempotent, schema-valid, never overfills", () => {
  const once = withSocialItem(header());
  assert.deepEqual(rightTypes(once), ["nav", "language", "social", "cta"]);
  assert.deepEqual(rightTypes(withSocialItem(once)), ["nav", "language", "social", "cta"]);
  const regions = (once as unknown as { props: { sectionProps: { regions: unknown } } }).props.sectionProps.regions;
  assert.ok(siteHeaderSchemaV1.safeParse({ brand: {}, regions }).success);
  const full = { id: "h", kind: "section", props: { sectionProps: { regions: { right: [{ type: "language" }, ...Array.from({ length: 7 }, () => ({ type: "spacer" }))] } } } } as never;
  assert.equal(withSocialItem(full), full);
});

test("splitShell: social item only for Web Office, language and account order untouched", () => {
  const has = (nodes: unknown[]) => JSON.stringify(nodes).includes('"type":"social"');
  assert.equal(has(splitShell([header(), footer] as never)[0]), false);
  assert.equal(has(splitShell([header(), footer] as never, { webOfficeSocial: false })[0]), false);
  const wo = splitShell([header(), footer] as never, { webOfficeSocial: true });
  assert.equal(has(wo[0]), true);
  assert.equal(has(wo[1]), false);
  assert.ok(rightTypes(wo[0][0]).indexOf("social") === rightTypes(wo[0][0]).indexOf("language") + 1);
});

test("siteChrome carries social only when there are links, and the schema accepts it", () => {
  const props = { brand: {}, regions: { right: [{ type: "language" }, { type: "social" }] } };
  const free = withHeaderSiteChrome(props, "site_header", false, ["en", "es"], undefined, []) as { siteChrome: Record<string, unknown> };
  assert.equal("social" in free.siteChrome, false);
  const paid = withHeaderSiteChrome(props, "site_header", false, ["en", "es"], undefined, links([ig, wa])) as { siteChrome: { social: unknown[] } };
  assert.equal(paid.siteChrome.social.length, 2);
  assert.ok(siteHeaderSchemaV1.safeParse(paid).success);
});

test("static: no design payload or theme seed injects the social item (render time only)", () => {
  const root = join(process.cwd(), "src/lib/talent-site");
  const kit = readFileSync(join(root, "theme-catalog/section-kit-shell.ts"), "utf8");
  assert.doesNotMatch(kit, /withSocialItem|type:\s*"social"/);
  const render = readFileSync(join(root, "server/render-max-site.tsx"), "utf8");
  assert.match(render, /webOfficeSocial:\s*Boolean\(args\.webOffice\)/);
  const shell = readFileSync(join(root, "server/render-max-site-shell.ts"), "utf8");
  assert.match(shell, /opts\.webOfficeSocial \? raw\.map\(withSocialItem\) : raw/);
});
