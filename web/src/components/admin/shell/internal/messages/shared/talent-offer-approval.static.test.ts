import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (p: string) => readFileSync(join(root, p), "utf8");

test("respondToInquiryOffer wraps talentRespondToOffer behind the not-impersonating guard", () => {
  const src = read("src/lib/server-actions/talent-pipeline.ts");
  const start = src.indexOf("export async function respondToInquiryOffer");
  assert.ok(start > 0);
  const body = src.slice(start, src.indexOf("export async function", start + 10));
  assert.match(body, /assertNotImpersonating\(\)/);
  assert.match(body, /talentRespondToOffer\(/);
  assert.match(body, /withInquiryContext\(/);
});

test("the Oferta tab card calls respondToInquiryOffer and OfferTab renders it", () => {
  const card = read("src/components/admin/shell/internal/messages/shared/talent-offer-approval-card.tsx");
  assert.match(card, /respondToInquiryOffer\(inquiryId, decision\)/);
  assert.match(card, /"accepted"/);
  assert.match(card, /"rejected"/);
  const tab = read("src/components/admin/shell/internal/messages/shared/machinery-12.tsx");
  assert.match(tab, /<TalentOfferApprovalCard/);
  assert.match(tab, /selectTalentOfferView\(/);
});
