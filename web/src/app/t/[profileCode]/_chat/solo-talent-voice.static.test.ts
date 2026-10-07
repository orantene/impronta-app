import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");

// QA on Jor 2026-10-01: a solo talent's dock opened with "I'll line up the
// right talent for you" under a "Tulala" header.
test("talent launcher marks the brand solo and the body picks the solo greeting", () => {
  assert.match(read("./TalentProfileChatLauncherMount.tsx"), /soloTalent: true/);
  assert.match(read("./GuestConversationBody.tsx"), /brand\.soloTalent \? "public\.guestChat\.greetingSolo"/);
  for (const l of ["en", "es", "fr"]) {
    const m = JSON.parse(read(`../../../../../messages/${l}.json`));
    const g = m.public.guestChat.greetingSolo as string;
    assert.ok(g.includes("{name}"), l);
    assert.doesNotMatch(g, /talent|talento/i, l);
  }
});

test("platform-host dock header uses the talent's name, never the hub brand", () => {
  const view = read("../profile-view.tsx");
  // chatBrandName: agency host -> the agency; platform host -> THIS talent's
  // public name (the hub is a routing detail, not a brand the guest talks to).
  const brand = view.slice(view.indexOf("const chatBrandName ="), view.indexOf("const chatBrandName =") + 400);
  assert.match(brand, /hostCtx\.kind === "agency"/);
  assert.match(brand, /: [^]*?publicNameOrGeneric\(displayName\(profile as TalentProfile\), locale \?\? "en"\)/);
  assert.doesNotMatch(brand, /chatHub/, "the hub's display name must not reach the dock header");
  // ...and that name is what the launcher is handed as the brand.
  assert.match(view, /agencyName: chatBrandName/);
});
