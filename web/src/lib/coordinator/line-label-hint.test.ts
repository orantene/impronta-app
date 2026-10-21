import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { LINE_LABEL_HINT, lineLabelHint } from "./line-label-hint";

test("the hint exists in ES and EN, without em dashes", () => {
  assert.equal(lineLabelHint("en"), "Don't include names or contact details.");
  assert.equal(lineLabelHint("es"), "No incluyas nombres ni datos de contacto.");
  assert.equal(lineLabelHint("es-MX"), LINE_LABEL_HINT.es);
  assert.equal(lineLabelHint("fr"), LINE_LABEL_HINT.en);
  for (const v of Object.values(LINE_LABEL_HINT)) assert.ok(!v.includes("—"));
});

test("the offer line editor shows it under the label field, as a hint (no validation, nothing blocks)", () => {
  const src = readFileSync(join(process.cwd(), "src/components/admin/shell/internal/messages/shared/offer-draft-line-item.tsx"), "utf8");
  assert.match(src, /const labelHint = lineLabelHint\(useDashboardLocale\(\)\)/);
  assert.match(src, /data-testid="line-label-hint"/);
  assert.doesNotMatch(src, /maskContactDetails|disabled=\{.*label/);
});
