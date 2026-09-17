import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

/**
 * D-153: a scan whose action threw ended with NO verdict; the gate stayed
 * "Ready to scan" and silence at a door reads as "go in". Both admit paths
 * must catch and render the engine_error verdict.
 */
const src = readFileSync(join(process.cwd(), "src/app/(workspace)/[tenantSlug]/admin/pos/door-client.tsx"), "utf8");

test("onScan and onAdmitRow never end without a verdict", () => {
  const onScan = src.slice(src.indexOf("const onScan = useCallback("), src.indexOf("const onAdmitRow = useCallback("));
  const onAdmit = src.slice(src.indexOf("const onAdmitRow = useCallback("), src.indexOf("const { tonight, later }"));
  for (const [name, body] of [["onScan", onScan], ["onAdmitRow", onAdmit]] as const) {
    assert.match(body, /\} catch \(err\) \{/, `${name} has no catch`);
    assert.match(body, /showOutcome\(\{ kind: "engine_error", detail: "[a-z_]+" \}/, `${name} does not render a verdict on failure`);
    assert.match(body, /Sentry\.captureException\(err/, `${name} swallows the error`);
  }
});
