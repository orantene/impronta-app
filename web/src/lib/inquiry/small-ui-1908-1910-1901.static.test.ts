import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";

import { localizeLineupNoteBody } from "./lineup-note-coalesce";

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");

test("TUL-1908: header ES/EN links get a 44x44 hit box on phones", () => {
  const css = read("../../app/token-presets.css");
  assert.match(css, /\.site-header__lang a\.site-header__lang-code \{[^}]*min-width: 44px; min-height: 44px/);
  const render = read("../site-admin/builder-node/render.tsx");
  assert.match(render, /\.site-builder-node--header-language-link\{[^}]*min-width:44px;min-height:44px/);
});

test("TUL-1910: /onboarding/role redirects to /start, so /start carries the footer too", () => {
  // Real cause: with the onboarding module on, the role page redirects pros to /start
  // (legacySignupRedirect), and the /start layout rendered no footer.
  assert.match(read("../../app/onboarding/role/page.tsx"), /legacySignupRedirect\(/);
  const start = read("../../app/start/layout.tsx");
  assert.match(start, /<OnboardingFooter \/>/);
  assert.equal(start.match(/<main\b/g)?.length ?? 0, 1, "still a single main landmark");
  assert.ok(start.indexOf("</main>") < start.indexOf("<OnboardingFooter"), "footer sits outside main");
  // Same component as /onboarding/*, not a copy.
  assert.match(read("../../app/onboarding/layout.tsx"), /<OnboardingFooter \/>/);
  assert.equal(/<footer/.test(start), false);
  assert.match(read("../../components/onboarding/onboarding-footer.tsx"), /export async function OnboardingFooter/);
});

test("TUL-1901: lineup count uses singular for one and plural for many, en and es", () => {
  const en = JSON.parse(read("../../../messages/en.json"));
  const es = JSON.parse(read("../../../messages/es.json"));
  for (const [cat, one, other] of [
    [en, "Selection · {count} talent", "Selection · {count} talents"],
    [es, "Selección · {count} talento", "Selección · {count} talentos"],
  ] as const) {
    const g = cat.public.guestChat;
    assert.equal(g.systemLineupCountOne, one);
    assert.equal(g.systemLineupCount, other);
    const t = (k: string) => g[k.split(".").pop()!] as string; // One key vs plain key
    assert.equal(localizeLineupNoteBody("Lineup · 1 talent", t), one.replace("{count}", "1"));
    assert.equal(localizeLineupNoteBody("Lineup · 3 talent", t), other.replace("{count}", "3"));
  }
});

test("TUL-1901: the note count is the number of distinct talent, not raw ids", () => {
  const src = read("../../app/t/[profileCode]/_actions/guest-detail-chips-actions.ts");
  assert.doesNotMatch(src, /buildLineupNoteBody\(newTalentIds\.length/);
  assert.equal((src.match(/buildLineupNoteBody\(new Set\(newTalentIds\)\.size/g) ?? []).length, 2);
});
