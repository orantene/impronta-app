import assert from "node:assert/strict";
import test from "node:test";

import { parseGuestOrderQuery } from "./guest-order-resume";

test("parseGuestOrderQuery accepts a uuid", () => {
  assert.equal(
    parseGuestOrderQuery("33330031-0000-4000-8000-0000000000b1"),
    "33330031-0000-4000-8000-0000000000b1",
  );
});

test("parseGuestOrderQuery rejects junk", () => {
  assert.equal(parseGuestOrderQuery(null), null);
  assert.equal(parseGuestOrderQuery(""), null);
  assert.equal(parseGuestOrderQuery("not-a-uuid"), null);
  assert.equal(parseGuestOrderQuery("abc"), null);
  assert.equal(parseGuestOrderQuery("  "), null);
});
