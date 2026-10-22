import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const dir = join(process.cwd(), "src/app/t/[profileCode]");
const read = (p: string) => readFileSync(join(dir, p), "utf8");

// TUL-1790: at 390 the fixed chat launcher covered the right end of the
// 'Consultar sobre ...' CTA while it scrolled through the bottom corner.
test("TUL-1790: the launcher steps aside while a marked profile CTA is in its band", () => {
  const hook = read("_chat/use-yield-booking-bar.ts");
  assert.match(hook, /export function useCtaUnderLauncher/);
  assert.match(hook, /IntersectionObserver/);
  const launcher = read("_chat/TalentProfileChatLauncher.tsx");
  assert.match(launcher, /useCtaUnderLauncher\(mounted && narrowLauncher\)/);
  assert.match(launcher, /ctaUnderLauncher/);
});

test("TUL-1790: both profile CTAs carry the data-profile-cta marker", () => {
  assert.match(read("talent-profile-inquire-button.tsx"), /data-profile-cta=""/);
  assert.match(read("hub-profile-book-cta.tsx"), /data-profile-cta=""/);
});
