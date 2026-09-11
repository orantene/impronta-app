/**
 * The picker's two structural promises, which no unit test of the reducer can
 * reach.
 *
 * "Parent draft preserved" and "focus returned to the trigger" are properties
 * of HOW the component is built, not of what it computes. Both are one line
 * away from being lost — a `router.push` in a create branch, or a hand-rolled
 * overlay instead of the Dialog primitive — and both losses are invisible in
 * review and silent at runtime until an operator loses twenty minutes of work.
 *
 * So they are asserted against the source. That is a blunt instrument and it
 * is the right one here: the failure mode is somebody adding a line, and a
 * source assertion is the only kind of test that notices a line being added.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { WEB_ROOT } from "@/lib/quality/supabase-unchecked-read";

const RAW = readFileSync(
  join(WEB_ROOT, "src", "components", "ui", "search-or-create-picker.tsx"),
  "utf8",
);

/**
 * Comments stripped before the refusals below run.
 *
 * The first version of this file failed on its own subject: the component's
 * header explains that a `router.push` in a create branch would lose the
 * draft, and the guard read the explanation as the offence. A guard that
 * cannot tell code from prose about code punishes the documentation, and the
 * documentation is the part that keeps the rule alive.
 */
const PICKER = RAW.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

test("the picker never navigates, so the parent draft cannot be unmounted", () => {
  assert.doesNotMatch(PICKER, /next\/navigation/, "importing the router is how the draft dies");
  assert.doesNotMatch(PICKER, /router\.(push|replace|refresh)/);
  assert.doesNotMatch(PICKER, /window\.location/);
});

test("focus return comes from the Dialog primitive rather than a hand-rolled overlay", () => {
  assert.match(PICKER, /from "@\/components\/ui\/dialog"/);
  assert.match(PICKER, /<DialogTrigger asChild>/, "the trigger must be the focus-return target");
});

test("create and attach are separate calls", () => {
  // Collapsing them is the shortcut that makes an attach failure invisible:
  // the parent shows the new object and the server has no link.
  assert.match(PICKER, /readonly onCreate\?:/);
  assert.match(PICKER, /readonly onAttach:/);
  assert.match(PICKER, /dispatch\(\{ type: "created", option \}\)/);
});

test("the idempotency key is handed to the create callback", () => {
  assert.match(PICKER, /idempotencyKey: createKey/, "create-once is a server guarantee or it is nothing");
});

test("the key is minted on OPEN, not per attempt", () => {
  // A key minted per press turns a retry into a second row, which is the exact
  // defect the whole machine exists to prevent.
  assert.match(PICKER, /dispatch\(\{ type: "open", createKey: mintKeyRef\.current\(\) \}\)/);
  assert.doesNotMatch(
    PICKER,
    /onCreate\(\{ query, idempotencyKey: mintKey\(\)/,
    "the create call must reuse the session key",
  );
});

test("the minter is reached through a ref, so its identity cannot re-mint", () => {
  // An inline `mintKey` prop gets a new identity every render. Depending on it
  // would re-run the open effect and mint a SECOND key with the drawer still
  // open — a retry would then create a second child, which is the failure the
  // key exists to prevent. The ref keeps the newest function while keeping its
  // identity unobservable, and it replaced a frozen exhaustive-deps disable.
  assert.match(PICKER, /mintKeyRef = React\.useRef\(mintKey\)/, "latest minter is held in a ref");
  assert.match(PICKER, /\}, \[open\]\);/, "the open effect depends on open alone");
  assert.doesNotMatch(
    PICKER,
    /eslint-disable-next-line react-hooks\/exhaustive-deps/,
    "a suppressed dependency array is not a stable callback",
  );
});

test("the search result carries the query it answered", () => {
  // Without the echo the reducer cannot drop a stale response, and a slow
  // answer to an old query repaints the list the operator is selecting from.
  assert.match(PICKER, /dispatch\(\{ type: "results", query, results: found \}\)/);
});

test("the create control is gated on capability, not on an error at press time", () => {
  assert.match(PICKER, /canCreateNew/);
});
