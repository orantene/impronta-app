import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { PROMO_COPY_EN, PROMO_COPY_ES } from "@/lib/promos/copy/talent";

// QA Martina build 6 (TUL-938): "Compartir" only closed the detail sheet when the promo had no
// link slug (the share sheet needs one). It must explain instead and keep the sheet open.

const page = readFileSync(join(__dirname, "PromosPage.tsx"), "utf8");

test("Compartir without a link slug shows a message and does not open the share state", () => {
  assert.match(page, /if \(!it\.link_slug\) toast\(copy\.t\("page\.share_no_link"\)\);\s*else setShareId\(it\.id\)/);
});

test("share_no_link exists in es and en without em dashes", () => {
  for (const c of [PROMO_COPY_ES, PROMO_COPY_EN] as Array<Record<string, string>>) {
    assert.ok(c["page.share_no_link"]);
    assert.doesNotMatch(c["page.share_no_link"]!, /—/);
  }
});
