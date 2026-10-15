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

test("TUL-879: support launcher moves left of card actions on the directory at phone width", () => {
  const s = read("components/marketing/support/MarketingSupportLauncher.tsx");
  assert.match(s, /\[body:has\(\[data-directory-card\]\)_&\]:max-sm:right-auto/);
  assert.match(s, /\[body:has\(\[data-directory-card\]\)_&\]:max-sm:left-\[max\(16px,env\(safe-area-inset-left\)\)\]/);
  assert.match(s, /data-marketing-support-fab/);
  // Position lives in classes (an inline right/bottom would beat the override).
  assert.doesNotMatch(s, /right: "max\(16px/);
});

test("TUL-888: cinematic availability pill wraps instead of clipping", () => {
  const card = read("components/talent-cards/TalentCard.tsx");
  assert.doesNotMatch(card, /h-\[26px\] max-w-full items-center gap-1\.5 overflow-hidden/);
  assert.doesNotMatch(card, /hidden truncate @\[220px\]:inline/);
  assert.match(card, /min-h-\[26px\] max-w-full/);
  const parts = read("components/talent-cards/talent-card-parts.tsx");
  assert.doesNotMatch(parts, /data-card-ownership[\s\S]{0,200}(truncate|overflow-hidden|w-\d)/);
});

test("TUL-886: hit areas reach 44px (visual size stays small)", () => {
  // Currency picker: ~33px chip + 2 x 10px pseudo-element = 53px tall.
  assert.match(read("components/marketing/currency-picker.tsx"), /before:-inset-y-2\.5/);
  // Language links: ~19px + 2 x 13px = 45px tall; px-3 gives a 36px+ wide target.
  assert.match(read("components/marketing/marketing-language-toggle.tsx"), /before:-inset-y-\[13px\]/);
  // Hero dots: whole button is 44x44 around a 6px dot.
  assert.match(read("components/marketing/hero-section.tsx"), /min-h-11 min-w-11 items-center justify-center/);
});
