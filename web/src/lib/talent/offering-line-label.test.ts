import assert from "node:assert/strict";
import { test } from "node:test";

import { composeTalentOfferingLabel } from "./offering-line-label";

test("a length option that already names the service stays, and extras stack with plus", () => {
  assert.equal(
    composeTalentOfferingLabel({
      title: "Soft Gel Largo",
      variantLabel: "Soft Gel Largo #3",
      addonLabels: ["ojo de gato"],
    }),
    "Soft Gel Largo #3 + ojo de gato",
  );
});

test("a short option is joined with a space, and several extras stay in order", () => {
  assert.equal(
    composeTalentOfferingLabel({
      title: "Soft Gel Largo",
      variantLabel: "#3",
      addonLabels: ["ojo de gato", "french"],
    }),
    "Soft Gel Largo #3 + ojo de gato + french",
  );
});

test("no option and no extras is the service name", () => {
  assert.equal(composeTalentOfferingLabel({ title: "Soft Gel Largo" }), "Soft Gel Largo");
});
