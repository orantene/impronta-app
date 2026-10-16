/**
 * TUL-966: after "Send to coordinator" the page re-rendered into a skeleton and the
 * in-place confirmation never showed. The submit action revalidated the client
 * pages the drawer is open on; the refresh now waits until the confirmation closes.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const drawer = readFileSync(join(here, "InquiryDrawer.tsx"), "utf8");
const hook = readFileSync(join(here, "use-refresh-on-close.ts"), "utf8");
const actions = readFileSync(
  join(here, "..", "..", "app", "(workspace)", "[tenantSlug]", "client", "_actions", "inquiry-intent-actions.ts"),
  "utf8",
);

test("the submit action does not revalidate the page the drawer is open on", () => {
  assert.doesNotMatch(actions, /\brevalidatePath\(/);
  assert.doesNotMatch(actions, /from "next\/cache"/);
});

test("the drawer refreshes the page only after a submitted inquiry's confirmation is closed", () => {
  assert.match(drawer, /const \[onClose, noteSubmitted\] = useRefreshOnClose\(onCloseProp\);/);
  assert.match(drawer, /useEffect\(\(\) => noteSubmitted\(submitted\), \[noteSubmitted, submitted\]\);/);
  assert.match(hook, /if \(submittedRef\.current\) router\.refresh\(\);/);
  assert.doesNotMatch(drawer, /submittedRef\.current = /);
});
