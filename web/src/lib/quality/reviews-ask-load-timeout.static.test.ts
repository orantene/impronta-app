import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

const SRC = readFileSync(
  join(process.cwd(), "src/components/admin/shell/internal/talent/pages/ReviewsAskForReviewCard.tsx"),
  "utf8",
);

describe("TUL-981 ask-for-review loader never hangs", () => {
  it("wraps the bookings loader in a timeout that falls into the catch (email path)", () => {
    assert.match(SRC, /withLoadTimeout\(loadReviewAskBookingsAction\(/);
    assert.match(SRC, /review-ask-load-timeout/);
    assert.match(SRC, /setBookings\(\[\]\);\s*setEmailMode\(true\)/);
  });

  it("loads bookings + invites in ONE server action before the picker shows; candidates come from a second action after (actions run in sequence)", () => {
    const ACTION = readFileSync(join(process.cwd(), "src/lib/reviews/review-ask-load-action.ts"), "utf8");
    assert.match(ACTION, /^"use server";/);
    assert.match(ACTION, /Promise\.all\(\[\s*loadClientReviewablesAction\(tenantSlug\),\s*loadReviewRequestsForOwnerAction\(/);
    assert.doesNotMatch(SRC, /loadClientReviewablesAction|loadReviewRequestsForOwnerAction|loadTalentClients|reviewInviteCandidates\(/);
    const ready = SRC.indexOf("setBookings(reviewables)");
    const picks = SRC.indexOf("loadReviewAskPicksAction(tenantSlug, talentProfileId)");
    assert.ok(ready > 0 && picks > ready, "candidates are requested only after the bookings are set");
  });
});
