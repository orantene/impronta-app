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
    assert.match(SRC, /withLoadTimeout\(\s*Promise\.all/);
    assert.match(SRC, /review-ask-load-timeout/);
    assert.match(SRC, /setBookings\(\[\]\);\s*setEmailMode\(true\)/);
  });
});
