/**
 * TUL-314: both guest-chat mounts resolve dock identity from the session
 * (password / Google / email-code), never hardcode ctaIdentity="guest" alone.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const read = (rel: string) => readFileSync(join(HERE, rel), "utf8");

const mounts = [
  "TalentProfileChatLauncherMount.tsx",
  join("..", "..", "..", "(public)", "_chat", "AgencyChatLauncherMount.tsx"),
] as const;

for (const file of mounts) {
  test(`${file} resolves dock identity from the session`, () => {
    const src = read(file);
    assert.match(src, /resolveDockViewerIdentityTier/);
    assert.match(src, /dockViewerCtaIdentity/);
    // Agency mount uses viewerIdentity — public branding already binds `identity`.
    assert.match(src, /identity=\{(?:identity|viewerIdentity)\}/);
    assert.match(src, /ctaIdentity=\{ctaIdentity\}/);
    assert.doesNotMatch(src, /ctaIdentity="guest"/);
  });
}

test("GuestNextStep surfaces accept refusals (no silent dead button)", () => {
  const src = read("GuestNextStep.tsx");
  assert.match(src, /phase === "refused"/);
  assert.match(src, /data-guest-next-step-refusal/);
  assert.match(src, /kit\.refusal/);
});
