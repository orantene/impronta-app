import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

/**
 * talent-site-dock-voice.static.test.ts — D-MSG-430.
 *
 * On a talent vanity host the guest dock used to introduce itself as the
 * PLATFORM. `TalentSiteMessagesDock` passed `agencyName={resolved.tenant
 * .displayName}`, and for a free talent that tenant is the platform hub, so a
 * lash artist's own booking page launched "Message Tulala" and headed the panel
 * "Tulala". It also passed no greeting and no preset, so `GuestDockHomeView`
 * fell through to the catalog opener that asks about an event and a talent
 * lineup, and the catalog tab read "Talent & services" to a client booking a
 * manicure. Her own name and her trade were both already in scope.
 *
 * STATIC, not a render test, on purpose: the whole defect is which VALUES this
 * one caller hands down. A render test would need the hub tenant, the taxonomy
 * and a seeded talent to reproduce it, and would still pass if someone swapped
 * the argument back while the dock kept rendering fine.
 *
 * Read by an un-decoded filesystem path: `new URL(...)` percent-decodes, so
 * "%5Ftalent-site" would resolve to "_talent-site" and miss the real folder.
 */
function dockSource(): string {
  return readFileSync(
    join(process.cwd(), "src/app/%5Ftalent-site/TalentSiteMessagesDock.tsx"),
    "utf8",
  );
}

test("the launcher and header carry the TALENT's name, not the inquiry tenant's", () => {
  const dock = dockSource();
  // `agencyName` drives the launcher label and the panel header.
  assert.match(dock, /agencyName=\{displayName\}/);
  assert.doesNotMatch(
    dock,
    /agencyName=\{resolved\.tenant\.displayName\}/,
    "the hub's name is not the name of the business whose site this is",
  );
});

test("the dock is given a voice, so it cannot reach the catalog fallback", () => {
  const dock = dockSource();
  // Both halves matter: the opener line AND the vocabulary the tabs derive from.
  assert.match(dock, /greeting=\{tradeVoice\}/);
  assert.match(dock, /wordsPresetOverride=\{tradePreset\}/);
  assert.match(dock, /resolveTalentTradePreset\(/);
  // The trade can only be resolved if the column is actually selected.
  assert.match(dock, /service_category_slug/);
});

test("the override reaches the words engine instead of stopping at the mount", () => {
  const mount = readFileSync(
    join(process.cwd(), "src/app/t/[profileCode]/_chat/TalentProfileChatLauncherMount.tsx"),
    "utf8",
  );
  const flags = readFileSync(join(process.cwd(), "src/lib/inquiry/guest-dock-flags.ts"), "utf8");
  const words = readFileSync(join(process.cwd(), "src/lib/words/server.ts"), "utf8");
  // A prop that is accepted and then dropped is the shape of this lane's worst
  // defects (an inert fix that looks load-bearing), so pin the whole chain.
  assert.match(mount, /loadGuestDockFlags\(tenantId, locale, wordsPresetOverride\)/);
  assert.match(flags, /loadTenantWords\(tenantId, locale === "es" \? "es" : "en", presetOverride\)/);
  assert.match(words, /presetOverride \? \{ \.\.\.input, presetId: presetOverride \} : input/);
});

test("the override never poisons the cached tenant read", () => {
  const words = readFileSync(join(process.cwd(), "src/lib/words/server.ts"), "utf8");
  // `loadTenantWordsInput` is the cached half and is keyed on the tenant alone.
  // If the override were applied inside it, one talent's trade could be served
  // from the Data Cache to a different host on the same tenant.
  const cached = words.slice(
    words.indexOf("function loadTenantWordsInput"),
    words.indexOf("export async function loadTenantWords"),
  );
  assert.ok(cached.length > 0, "could not isolate the cached read");
  assert.doesNotMatch(cached, /presetOverride/);
});

test("a talent with no known trade changes nothing", () => {
  const dock = dockSource();
  // "custom" is the pre-preset default and is not a voice; the agency mount makes
  // the same exclusion. Without this guard a null-category talent would get an
  // empty or generic opener where she previously got the tenant's.
  assert.match(dock, /tradePreset && tradePreset !== "custom"/);
  assert.match(dock, /: null;/);
});
