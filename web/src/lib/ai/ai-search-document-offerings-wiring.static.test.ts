import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// F1 (TUL-1273 deferred): the rebuild reads offerings through the D-10 guest-sellable
// filter, and every talent offering write path schedules a rebuild (no new cron).
const src = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

test("F1: rebuild loads offerings via the guest-sellable loader and passes them to the builder", () => {
  const rebuild = src("src/lib/ai/rebuild-ai-search-document.ts");
  assert.match(rebuild, /loadAiSearchDocumentOfferings\(supabase, talentProfileId\)/);
  assert.match(rebuild, /\bofferings,/);
});

test("F1 D-10a: the loader scopes to listable talent offerings, reads no price, checks the read error", () => {
  const loader = src("src/lib/ai/load-ai-search-document-offerings.ts");
  // D1: published + approved + (public | on_request) is the shared "guest_request" scope.
  assert.match(loader, /scopeToSellableOfferings\([\s\S]{0,300}"guest_request"/);
  assert.doesNotMatch(loader, /amount_cents|price_display|price_type/);
  assert.match(loader, /\.eq\("owner_kind", "talent"\)/);
  assert.match(loader, /\{ data, error \}/);
  assert.match(loader, /\.order\("sort_order"/);
});

test("F1: talent offering writes schedule an AI search document rebuild", () => {
  const actions = src("src/lib/talent/offerings-actions.ts");
  const calls = actions.match(/scheduleRebuildAiSearchDocument\(admin, talentProfileId\)/g) ?? [];
  // upsert (covers publish/unpublish/duplicate), delete (covers delete forever), reorder, legacy import.
  assert.ok(calls.length >= 4, `expected >= 4 rebuild hooks, got ${calls.length}`);
});
