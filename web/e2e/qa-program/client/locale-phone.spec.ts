import { expect, test } from "../_harness";

test.describe("QA 6.3 client locale/phone (deferred deep)", () => {
  test.skip(true, "Run after client thread render is green");
  test("placeholder", async () => {
    expect(true).toBe(true);
  });
});
