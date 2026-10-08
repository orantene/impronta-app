import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// TUL-179: opening /talent/public-page (-> /talent/site) must never write a
// talent_sites row. Creation is the explicit "Create my own website" click.

const read = (rel: string) => readFileSync(join(process.cwd(), "src", rel), "utf8");

function fnBody(src: string, name: string): string {
  const start = src.indexOf(`export async function ${name}`);
  assert.ok(start >= 0, `${name} not found`);
  const next = src.indexOf("\nexport async function ", start + 1);
  return src.slice(start, next === -1 ? undefined : next);
}

test("the manager load action never provisions", () => {
  const body = fnBody(read("lib/talent-site/server/site-management-actions.ts"), "loadMaxSiteManagerAction");
  assert.equal(body.includes("provisionTalentMaxSite"), false);
  assert.match(body, /siteScaffoldComplete\(siteRes, pagesRes\)/);
});

test("the talent layout dashboard state never provisions", () => {
  const src = read("lib/talent-site/server/dashboard-state.ts");
  assert.equal(src.includes("provisionTalentPersonalSiteIfMissing"), false);
  assert.equal(src.includes(".insert("), false);
});

test("the route file only reads", () => {
  const page = read("app/(workspace)/talent/site/page.tsx");
  assert.equal(page.includes("ensureMaxSiteAction"), false);
  assert.equal(page.includes("provision"), false);
});

test("creation is wired only to the explicit click, with en and es copy", () => {
  const card = read("components/talent/site/CreateMySiteCard.tsx");
  assert.match(card, /onClick=\{create\}/);
  assert.equal(/useEffect/.test(card), false);
  const mgr = read("components/talent/site/TalentMaxSiteManager.tsx");
  assert.match(mgr, /!state\.siteExists/);
  assert.equal(mgr.includes("ensureMaxSiteAction"), false);
  const es = read("components/admin/shell/internal/dashboard-i18n-website.ts");
  for (const key of [
    "Create my own website",
    "Creating your website…",
    "Could not create your website. Try again.",
    "Your profile page stays as it is. A separate website of your own is only created when you choose to.",
  ]) {
    assert.ok(es.includes(`"${key}":`), `missing es for ${key}`);
    assert.ok(card.includes(key), `missing en for ${key}`);
    assert.equal(key.includes("\u2014"), false);
    assert.equal(es.split(`"${key}":`)[1].split("\n")[0].includes("\u2014"), false);
  }
});
