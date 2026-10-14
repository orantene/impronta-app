import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const root = join(process.cwd(), "src");
const read = (p: string) => readFileSync(join(root, p), "utf8");

test("TUL-879: directory list clears the chat bubble", () => {
  const s = read("components/marketing/directory/MarketingDirectoryShell.tsx");
  assert.match(s, /pb-\[calc\(8rem\+env\(safe-area-inset-bottom\)\)\]/);
});

test("TUL-880: mobile Free badge is inset from the right edge", () => {
  const s = read("components/marketing/header.tsx");
  assert.match(s, /absolute right-3 -top-1\.5/);
});

test("TUL-886: small controls expose a 44px hit area", () => {
  assert.match(read("components/marketing/hero-section.tsx"), /min-h-11 min-w-11/);
  assert.match(read("components/marketing/marketing-language-toggle.tsx"), /before:-inset-y-\[13px\]/);
  assert.match(read("components/marketing/currency-picker.tsx"), /before:-inset-y-2\.5/);
  assert.match(read("app/t/[profileCode]/_shared/OfferingCta.tsx"), /before:-inset-y-2/);
});

test("TUL-888: card badge, availability and name no longer hard-truncate", () => {
  const parts = read("components/talent-cards/talent-card-parts.tsx");
  assert.doesNotMatch(parts, /max-w-full items-center truncate/);
  const card = read("components/talent-cards/TalentCard.tsx");
  assert.match(card, /line-clamp-2 break-words/);
  assert.doesNotMatch(card, /<span className="truncate">\{data\.availabilityLabel\}/);
  assert.match(read("components/marketing/directory/directory-copy.ts"), /Disp\. \$\{days\} de 30 días/);
});
