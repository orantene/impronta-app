import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { blankComments } from "@/lib/quality/supabase-unchecked-read";
import { SUPPORT_EMAIL_CAN_RECEIVE } from "./support-contact";

/**
 * The support pages argue that a promise which gets missed is worse than no
 * promise. On 2026-09-03 those pages were breaking their own rule: /support
 * told readers to email hello@tulala.digital while the domain had NO MX
 * RECORD, so every one of those readers got a bounce from the page promising
 * a human would answer.
 *
 * This pins the rule rather than the wording: while the mailbox cannot
 * receive, no marketing page may hand a reader a mailto for it.
 */

const PAGES = [
  "src/app/(marketing)/support/page.tsx",
  "src/app/(marketing)/help/page.tsx",
  // Added after /about was found still shipping a live mailto for the dead
  // mailbox, three weeks of "we reply the same day" alongside it. The first
  // fix only covered the two pages its author had looked at, and the claim
  // that nothing said "email us" was made from that scope rather than checked
  // across the tree.
  "src/app/(marketing)/about/page.tsx",
];

test("no marketing page offers the support mailbox while it cannot receive mail", () => {
  if (SUPPORT_EMAIL_CAN_RECEIVE) return; // Mail works; the channel is allowed.

  for (const page of PAGES) {
    const src = blankComments(readFileSync(page, "utf8"));
    const mailtos = src.match(/`mailto:\$\{SUPPORT_EMAIL\}`/g) ?? [];
    if (mailtos.length === 0) continue;

    // A mailto is only acceptable when it sits behind the capability flag.
    assert.ok(
      src.includes("SUPPORT_EMAIL_CAN_RECEIVE"),
      `${page} builds a mailto for the support address without checking ` +
        `SUPPORT_EMAIL_CAN_RECEIVE. The domain has no MX record, so that link ` +
        `bounces every reader who follows it.`,
    );
  }
});

test("the capability flag is documented with how to restore it", () => {
  const src = readFileSync("src/lib/platform/support-contact.ts", "utf8");
  assert.match(
    src,
    /TO RESTORE/,
    "A temporary flag with no restore instructions becomes permanent by accident.",
  );
  assert.match(
    src,
    /MX/,
    "Say WHY it is off, or the next person flips it back without checking DNS.",
  );
});
