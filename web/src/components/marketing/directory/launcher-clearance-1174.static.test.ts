import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import {
  GUEST_CHAT_LAUNCHER_CLEARANCE_CSS,
  GUEST_CHAT_LAUNCHER_CLEARANCE_MAX_WIDTH_PX,
  GUEST_CHAT_LAUNCHER_CLEARANCE_PX,
  GUEST_CHAT_LAUNCHER_GAP_PX,
  GUEST_CHAT_LAUNCHER_HEIGHT_PX,
  GUEST_CHAT_LAUNCHER_LAST_ROW_PAD_CSS,
} from "@/app/t/[profileCode]/_chat/launcher-clearance";
import { FLOATING_CHROME_STACK_CSS } from "@/lib/talent-site/floating-chrome-stack";

const read = (p: string) => readFileSync(join(process.cwd(), "src", p), "utf8");

// TUL-1174 / TUL-1790: below 640px the guest launcher covered directory card
// links and the profile's last row. The reserve stopped at 480px.
test("TUL-1174: clearance covers every width below 640px, not just 480", () => {
  assert.equal(GUEST_CHAT_LAUNCHER_CLEARANCE_MAX_WIDTH_PX, 639);
  assert.match(GUEST_CHAT_LAUNCHER_CLEARANCE_CSS, /@media \(max-width: 639px\)/);
  assert.ok(FLOATING_CHROME_STACK_CSS.includes("@media (max-width:639px){body:has([data-guest-chat-launcher]){--floating-launcher-clearance"));
  assert.ok(GUEST_CHAT_LAUNCHER_CLEARANCE_PX >= GUEST_CHAT_LAUNCHER_HEIGHT_PX + GUEST_CHAT_LAUNCHER_GAP_PX);
});

test("TUL-1174: directory mount reserves launcher height + gap under the last row", () => {
  const shell = read("components/marketing/directory/MarketingDirectoryShell.tsx");
  assert.match(shell, /className="tulala-dir-shell pb-\[calc\(8rem\+env\(safe-area-inset-bottom\)\)\]"/);
  assert.match(shell, /body:has\(\[data-guest-chat-launcher\]\) \.tulala-dir-shell\{padding-bottom:\$\{GUEST_CHAT_LAUNCHER_LAST_ROW_PAD_CSS\}\}/);
  assert.match(GUEST_CHAT_LAUNCHER_LAST_ROW_PAD_CSS, new RegExp(`calc\\(${GUEST_CHAT_LAUNCHER_CLEARANCE_PX + GUEST_CHAT_LAUNCHER_GAP_PX}px`));
});

test("TUL-1174: hub profile mount reserves body padding and lifts the launcher above the sticky bar", () => {
  assert.match(FLOATING_CHROME_STACK_CSS, /body\{padding-bottom:var\(--floating-chrome-bottom\)\}/);
  assert.match(FLOATING_CHROME_STACK_CSS, /--floating-chrome-bottom:max\(var\(--cb-bar-h\),var\(--floating-launcher-clearance\)/);
  const chrome = read("app/t/[profileCode]/_light/floating-chrome.ts");
  assert.match(chrome, /data-profile-sticky-bar=\\"visible\\"\]\) \[data-guest-chat-launcher\]\{bottom:calc\(88px/);
});
