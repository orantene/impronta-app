import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { SUPPORT_AGENT, SUPPORT_AGENT_VARS } from "./support-persona";

/**
 * The persona name used to be baked into 33 catalog strings and 6 source files.
 * Renaming meant editing every one, in three locales, and missing a single
 * instance meant a customer met two different people inside one conversation.
 *
 * These tests keep the name in exactly one place.
 */

const SUPPORT_KEYS = [
  "messageOran", "messageOranBody", "aiMicrocopy", "offerHumanTitle",
  "handoffTitle", "humanReplyEta", "callbackConfirmed", "oranOnline",
  "oranTyping", "ideaBlurb", "ideaThanks",
] as const;

const LOCALES = ["en", "es", "fr"] as const;
const MESSAGES_DIR = join(process.cwd(), "messages");

function adminSupport(locale: string): Record<string, unknown> {
  const raw = JSON.parse(readFileSync(join(MESSAGES_DIR, `${locale}.json`), "utf8"));
  return raw.dashboard.adminSupport as Record<string, unknown>;
}

test("no locale hardcodes a support agent name", () => {
  for (const locale of LOCALES) {
    const sup = adminSupport(locale);
    for (const key of SUPPORT_KEYS) {
      const value = sup[key];
      assert.equal(typeof value, "string", `${locale}.${key} missing`);
      assert.equal(
        (value as string).includes(SUPPORT_AGENT.name),
        false,
        `${locale}.${key} hardcodes "${SUPPORT_AGENT.name}" — use the {agent} placeholder`,
      );
      // The previous name, specifically. This is the regression that shipped.
      assert.equal(
        /\bOran\b/.test(value as string),
        false,
        `${locale}.${key} still says "Oran"`,
      );
    }
  }
});

test("every persona string carries the {agent} placeholder in every locale", () => {
  // A translator dropping the placeholder produces copy with no name at all,
  // which reads as a system notice rather than a person.
  for (const locale of LOCALES) {
    const sup = adminSupport(locale);
    for (const key of SUPPORT_KEYS) {
      assert.ok(
        String(sup[key]).includes("{agent}"),
        `${locale}.${key} lost its {agent} placeholder`,
      );
    }
  }
});

test("no support component hardcodes a name instead of interpolating", () => {
  const dir = join(process.cwd(), "src", "components", "support");
  const offenders: string[] = [];
  for (const file of readdirSync(dir)) {
    if (!file.endsWith(".tsx") && !file.endsWith(".ts")) continue;
    if (file.includes(".test.")) continue;
    const src = readFileSync(join(dir, file), "utf8");
    if (/\bOran\b/.test(src)) offenders.push(file);
  }
  assert.deepEqual(offenders, [], `hardcoded agent name in: ${offenders.join(", ")}`);
});

test("the interpolation vars expose the name under the {agent} key", () => {
  assert.equal(SUPPORT_AGENT_VARS.agent, SUPPORT_AGENT.name);
});

test("the avatar has no fabricated photograph by default", () => {
  // Presenting an invented headshot as a real support agent would be a
  // fabricated person. The illustrated fallback is the honest default; a real
  // photo of a real human is a deliberate opt-in.
  assert.equal(SUPPORT_AGENT.photoUrl, null);
});

test("the name is non-empty and the initial matches it", () => {
  assert.ok(SUPPORT_AGENT.name.trim().length > 0);
  assert.equal(SUPPORT_AGENT.initial, SUPPORT_AGENT.name[0]);
});
