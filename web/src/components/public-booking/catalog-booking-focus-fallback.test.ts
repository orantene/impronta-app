/** TUL-841: a failed submit never ends silently, even when the invalid field is not on screen. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { focusBookingField } from "./catalog-booking-validation";

const HERE = dirname(fileURLToPath(import.meta.url));
const read = (f: string) => readFileSync(join(HERE, f), "utf8");

test("focusBookingField reports false when the field is not rendered", () => {
  const root = { querySelector: () => null } as unknown as ParentNode;
  assert.equal(focusBookingField("cb-service-address", root), false);
});

test("focusBookingField scrolls to and focuses a rendered field and reports true", () => {
  const calls: string[] = [];
  const el = {
    scrollIntoView: () => calls.push("scroll"),
    focus: () => calls.push("focus"),
  };
  const root = { querySelector: () => el } as unknown as ParentNode;
  assert.equal(focusBookingField("cb-email", root), true);
  assert.deepEqual(calls, ["scroll", "focus"]);
});

test("both booking surfaces show an en + es message when the invalid field cannot be focused", () => {
  for (const f of ["use-catalog-booking-confirm.ts", "BookableComposer.tsx"]) {
    const src = read(f);
    assert.match(src, /if \(!focusBookingField\(firstInvalid\)\)/, f);
    assert.match(src, /Revisa los datos marcados antes de confirmar\./, f);
    assert.match(src, /Check the highlighted details before confirming\./, f);
  }
});
