import assert from "node:assert/strict";
import { test } from "node:test";

import { buildVerifiedMark, formatVerifiedLine, type TrustBadgeRow } from "./verified-mark";

const NOW = new Date("2026-09-06T00:00:00Z");

const badge = (over: Partial<TrustBadgeRow>): TrustBadgeRow => ({
  badge_kind: "identity",
  status: "verified",
  scope: "platform",
  verified_at: "2026-03-14T10:00:00Z",
  expires_at: null,
  ...over,
});

/**
 * The fixtures below are production's real rows, because the brief for this
 * work was wrong in a way tidy fixtures would have hidden. The brief said 45
 * admin skill checks were being counted as trust; measured, they are
 * `scope='agency'` and were never counted at all.
 */

test("the 45 agency skill badges confer nothing — that is the brief's premise, and it was false", () => {
  const nalea = [
    badge({ badge_kind: "identity", scope: "platform" }),
    badge({ badge_kind: "skills_verified", scope: "agency" }),
  ];
  const mark = buildVerifiedMark(nalea, NOW);
  assert.equal(mark.verified, true, "she is verified on her identity badge");
  assert.equal(mark.lines.length, 1, "the agency skill badge must not appear");
  assert.equal(mark.lines[0]?.kind, "identity");
});

test("a profile holding ONLY agency skill badges is not verified", () => {
  const mark = buildVerifiedMark(
    [badge({ badge_kind: "skills_verified", scope: "agency" })],
    NOW,
  );
  assert.equal(mark.verified, false);
  assert.deepEqual(mark.lines, []);
});

test("media_authentic buys nothing — this is the defect that IS real", () => {
  // Tina holds identity + media_authentic and reads "silver" today because the
  // tier counts any platform badge. Under the rule she is simply Verified, on
  // her identity check, and the photo-provenance badge is not a trust signal.
  const tina = [
    badge({ badge_kind: "identity" }),
    badge({ badge_kind: "media_authentic" }),
    badge({ badge_kind: "skills_verified", scope: "agency" }),
  ];
  const mark = buildVerifiedMark(tina, NOW);
  assert.equal(mark.verified, true);
  assert.deepEqual(mark.lines.map((l) => l.kind), ["identity"]);

  // ...and media_authentic ALONE is not verification of a person.
  assert.equal(
    buildVerifiedMark([badge({ badge_kind: "media_authentic" })], NOW).verified,
    false,
  );
});

test("identity alone verifies", () => {
  assert.equal(buildVerifiedMark([badge({})], NOW).verified, true);
});

test("phone AND social verify; either alone does not", () => {
  const phone = badge({ badge_kind: "phone" });
  const social = badge({ badge_kind: "social" });
  assert.equal(buildVerifiedMark([phone], NOW).verified, false, "phone alone");
  assert.equal(buildVerifiedMark([social], NOW).verified, false, "social alone");

  const both = buildVerifiedMark([phone, social], NOW);
  assert.equal(both.verified, true);
  assert.deepEqual(both.lines.map((l) => l.kind), ["phone", "social"], "ladder order");
});

test("a pending or rejected badge counts for nothing", () => {
  for (const status of ["pending", "rejected", "revoked"]) {
    assert.equal(buildVerifiedMark([badge({ status })], NOW).verified, false, status);
  }
});

test("an expired badge stops counting the minute it expires", () => {
  // The spec: "a profile that loses a badge loses the mark the same minute."
  const expired = badge({ expires_at: "2026-09-05T23:59:00Z" });
  assert.equal(buildVerifiedMark([expired], NOW).verified, false);

  const future = badge({ expires_at: "2027-01-01T00:00:00Z" });
  assert.equal(buildVerifiedMark([future], NOW).verified, true);
});

test("an agency-scoped IDENTITY badge does not confer the platform mark", () => {
  // The scope check is the load-bearing one: an agency vouching for its own
  // talent must never mint a platform trust signal.
  assert.equal(
    buildVerifiedMark([badge({ badge_kind: "identity", scope: "agency" })], NOW)
      .verified,
    false,
  );
});

test("no badges, null, and undefined are all simply not verified", () => {
  assert.equal(buildVerifiedMark([], NOW).verified, false);
  assert.equal(buildVerifiedMark(null, NOW).verified, false);
  assert.equal(buildVerifiedMark(undefined, NOW).verified, false);
});

test("the hover keeps the EARLIEST date, so a re-check does not look new", () => {
  const mark = buildVerifiedMark(
    [
      badge({ verified_at: "2026-08-01T00:00:00Z" }),
      badge({ verified_at: "2026-03-14T00:00:00Z" }),
    ],
    NOW,
  );
  assert.equal(mark.lines[0]?.verifiedAt, "2026-03-14T00:00:00Z");
});

test("the hover line is month precision, never a timestamp", () => {
  const [line] = buildVerifiedMark([badge({})], NOW).lines;
  const text = formatVerifiedLine(line!, "en");
  assert.match(text, /^ID verified · \w+ 2026$/);
  assert.doesNotMatch(text, /\d{2}:\d{2}/, "a visitor does not need the hour");
});

test("a badge with no date still renders its label", () => {
  const [line] = buildVerifiedMark([badge({ verified_at: null })], NOW).lines;
  assert.equal(formatVerifiedLine(line!, "en"), "ID verified");
});
