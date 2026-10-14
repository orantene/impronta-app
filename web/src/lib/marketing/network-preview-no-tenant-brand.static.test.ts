/** TUL-860: marketing network preview must show the Tulala brand, never a tenant's. */
import assert from "node:assert/strict";
import test from "node:test";

import { networkPreviewCopy } from "@/components/marketing/network-preview-copy";

test("network preview cards carry no tenant brand", () => {
  for (const locale of ["en", "es"]) {
    const text = JSON.stringify(networkPreviewCopy(locale).cards);
    assert.doesNotMatch(text, /impronta/i);
  }
});
