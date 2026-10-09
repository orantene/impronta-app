/**
 * TUL-516 H5: the marketing shell must skip discovery/account IO on /legal/*.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

test("MarketingShell gates heavy work behind isMarketingLegalPath", () => {
  const src = readFileSync(join(process.cwd(), "src/components/marketing/shell.tsx"), "utf8");
  assert.match(src, /isMarketingLegalPath/);
  assert.match(src, /legalFast/);
  assert.match(src, /data-marketing-legal-fast/);
  assert.match(src, /getSavedTalentIds/);
  // Discovery reads only run when not on a legal path.
  assert.match(src, /if\s*\(\s*!legalFast\s*\)/);
});

test("TalentSiteSocket uses next/link and never target=_blank", () => {
  const src = readFileSync(join(process.cwd(), "src/components/talent-site/talent-site-socket.tsx"), "utf8");
  assert.match(src, /from "next\/link"/);
  assert.equal(src.includes('target="_blank"'), false);
  assert.equal(src.includes("<a "), false);
});
