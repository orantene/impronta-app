import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

/**
 * /legal/refunds is code-built (DRAFT PENDING LEGAL REVIEW). This static check
 * keeps the EN+ES route files, footer links, footer socket export, sitemap, and
 * marketing copy in step whenever the page is renamed or unlinked.
 */
const read = (p: string) => readFileSync(p, "utf8");

test("refunds route files exist (EN page + ES body)", () => {
  assert.equal(existsSync("src/app/(marketing)/legal/refunds/page.tsx"), true);
  assert.equal(existsSync("src/app/(marketing)/legal/refunds/refunds-es.tsx"), true);
});

test("footer, footer-socket, sitemap, and marketing copy include refunds", () => {
  assert.match(read("src/components/marketing/footer.tsx"), /\/legal\/refunds/);
  assert.match(read("src/app/sitemap.ts"), /\/legal\/refunds/);

  const copy = read("src/lib/marketing/copy.ts");
  assert.match(copy, /"Refunds"/);
  assert.match(copy, /"Reembolsos"/);

  const socket = read("src/lib/talent-site/footer-socket.ts");
  assert.match(socket, /export const TULALA_LEGAL_REFUNDS_URL/);
  assert.match(socket, /tulala-refunds/);
  assert.match(socket, /https:\/\/tulala\.digital\/legal\/refunds/);
});

test("Terms EN+ES Payments section links to /legal/refunds", () => {
  assert.match(read("src/app/(marketing)/legal/terms/page.tsx"), /\/legal\/refunds/);
  assert.match(read("src/app/(marketing)/legal/terms/terms-es.tsx"), /\/legal\/refunds/);
});

test("refunds pages carry the draft-review marker and no em dashes", () => {
  for (const f of [
    "src/app/(marketing)/legal/refunds/page.tsx",
    "src/app/(marketing)/legal/refunds/refunds-es.tsx",
  ]) {
    const s = read(f);
    assert.match(s, /DRAFT PENDING LEGAL REVIEW/);
    assert.doesNotMatch(s, /—/);
  }
});
