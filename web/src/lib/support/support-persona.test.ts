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

/**
 * Walk EVERY directory that can produce customer-facing support copy.
 *
 * The first version of this test scanned only src/components/support, passed,
 * and gave false confidence: the rename shipped to production still saying
 * "Talk to Oran", because the marketing panel has its own copy module and the
 * guest AI corpus has its own sales entries. A guard that covers one of three
 * trees is worse than no guard, because it is believed.
 */
const PERSONA_ROOTS = [
  join(process.cwd(), "src", "components", "support"),
  join(process.cwd(), "src", "components", "marketing", "support"),
  join(process.cwd(), "src", "lib", "support"),
  join(process.cwd(), "src", "lib", "marketing"),
  // The email tree. Left out of the first widening, and it cost exactly what
  // the earlier miss cost: the product said Orlando everywhere while the one
  // customer-facing email that names the agent still said "Oran replied". A
  // guard that covers four of five trees reports green on the tree it skips.
  join(process.cwd(), "emails"),
] as const;

function walkSourceFiles(dir: string, out: string[] = []): string[] {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out; // a root that does not exist is not a failure
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      walkSourceFiles(full, out);
      continue;
    }
    if (!/\.tsx?$/.test(entry.name)) continue;
    if (entry.name.includes(".test.")) continue;
    out.push(full);
  }
  return out;
}

test("no support or marketing source hardcodes the agent name", () => {
  const offenders: string[] = [];
  for (const root of PERSONA_ROOTS) {
    for (const file of walkSourceFiles(root)) {
      const src = readFileSync(file, "utf8");
      // Strip comments: prose about the persona is fine, shipped copy is not.
      const code = src
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/(^|[^:])\/\/.*$/gm, "$1");
      if (/\bOran\b/.test(code)) offenders.push(file.replace(process.cwd() + "/", ""));
    }
  }
  assert.deepEqual(
    offenders,
    [],
    `hardcoded agent name in: ${offenders.join(", ")}`,
  );
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
