/**
 * Symptom 9: the open dock had a header X and a large Close pill at once.
 * The pill is the opener. When the panel is open, only the header closes it.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";

const SRC = path.join(process.cwd(), "src/app/t/[profileCode]/_chat/TalentProfileChatLauncher.tsx");

test("open launcher does not render a second Close pill", () => {
  const src = readFileSync(SRC, "utf8");
  assert.match(
    src,
    /\{!open && \(\s*<button/,
    "the launcher pill must be hidden while the panel is open",
  );
  assert.doesNotMatch(
    src,
    /open \? t\("public\.guestChat\.closeAria"\)/,
    "a Close label on the pill is the second close control",
  );
});
