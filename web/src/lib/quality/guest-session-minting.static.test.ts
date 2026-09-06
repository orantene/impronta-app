import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

/**
 * A READ must not mint a row, and the WRITE that needs one must create it.
 *
 * Measured on production 2026-09-06: `public.guest_sessions` held 40,241 rows.
 * Exactly TWELVE were referenced by any of the seven tables with a foreign key
 * to them (inquiries, inquiry_messages, inquiry_reports, saved_talent,
 * support_tickets, tulala_briefs, user_blocks). 99.97% orphans, oldest
 * 2026-04-09, 1,060 minted in the last 24 hours.
 *
 * The cause was one line in `loadSavedTalentIds`, which runs on RENDER of every
 * public talent profile: it called `ensure_guest_session` before the visitor
 * had done anything, to read a saved list that is empty for a first-time
 * visitor. It sat before the signed-in branch too, so a logged-in user with a
 * guest cookie minted one as well. Crawlers carry no cookie, so every crawl hit
 * minted a fresh row — which is where 40k came from.
 *
 * ─── THE HALF THAT IS EASY TO GET WRONG ─────────────────────────────────────
 *
 * Deleting that call ALONE would have broken guest saving, silently, on the one
 * action we most want a guest to take. The RPCs are asymmetric and only reading
 * their bodies shows it:
 *
 *   guest_list_saved_talent_ids    IF gid IS NULL THEN RETURN;            -> [] 
 *   guest_remove_saved_talent      IF gid IS NULL THEN RETURN;            -> no-op
 *   guest_add_saved_talent         IF gid IS NULL THEN RAISE EXCEPTION;   -> THROWS
 *
 * `guest_add_saved_talent` does not create the session. Until this change the
 * save action worked only as a SIDE EFFECT of rendering: the profile page had
 * already minted the row by the time anyone clicked.
 *
 * So the ensure MOVED to the first write of the interaction rather than being
 * removed. Both halves are asserted here, because either alone is a defect:
 * the read minting is a 40k-row leak, and the write not ensuring is a broken
 * save button.
 */

const web = process.cwd();
const read = (p: string) => readFileSync(join(web, p), "utf8");
const stripComments = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/**
 * BOTH render paths, not one. The first version of this guard covered only
 * `public-discovery.ts`, because I reasoned that the inquiry payload loader
 * "runs when a guest opens the sheet". It does not: `DirectoryInquirySheet`
 * calls `refreshPayload()` from a `useEffect` with NO `if (!open) return`
 * guard, so it fires on MOUNT wherever the sheet is mounted — the
 * `if (!open) return null` below it skips the render, not the fetch. Reasoning
 * about a function's name instead of reading its caller would have left the
 * leak running after the other path stopped.
 */
const RENDER_PATHS = [
  "src/lib/public-discovery.ts",
  "src/lib/load-directory-inquiry-payload.ts",
];

for (const file of RENDER_PATHS) {
  test(`${file} never mints a guest session`, () => {
    const src = stripComments(read(file));
    assert.doesNotMatch(
      src,
      /rpc\(\s*["'`]ensure_guest_session["'`]/,
      "this runs on render; minting here created 40,229 orphan rows, and a " +
        "read must not write",
    );
  });
}

/**
 * AND IT MINTED FOR SIGNED-IN VISITORS TOO, which changes what the 40k is.
 *
 * In `loadSavedTalentIds` the ensure ran BEFORE `getCachedActorSession()`, and
 * the authenticated branch then reads `saved_talent` directly and touches no
 * guest RPC at all. So every authenticated view of a public profile wrote a
 * guest row that nothing would ever read. The orphans are not only crawlers and
 * first-time visitors; they include every logged-in person who ever looked at a
 * profile.
 *
 * Pinned as its own assertion because "no ensure on this path" and "no ensure
 * ahead of the auth branch" fail differently: someone re-adding the call inside
 * the guest-only branch would keep this file honest, while re-adding it at the
 * top would not.
 */
test("no guest write is issued before the signed-in branch is resolved", () => {
  const src = stripComments(read("src/lib/public-discovery.ts"));
  // The CALL, not the import. `src.indexOf("getCachedActorSession")` finds the
  // import statement at the top of the file, which would make "before the auth
  // branch" mean "the import block" — a guard that measures the wrong
  // occurrence and passes while the defect is present. It did exactly that when
  // first written, and only failed to catch a reintroduced mint because of it.
  const actor = src.indexOf("await getCachedActorSession()");
  assert.ok(actor >= 0, "the signed-in branch must still exist");
  const beforeActor = src.slice(0, actor);
  assert.doesNotMatch(
    beforeActor,
    /rpc\(/,
    "a signed-in visitor must not write anything to read their own saved list",
  );
});

test("the profile render path still READS the guest list", () => {
  // Removing the read as well as the write would silently blank every guest's
  // saved talent — a quieter defect than the leak it replaced.
  const src = stripComments(read("src/lib/public-discovery.ts"));
  assert.match(src, /guest_list_saved_talent_ids/);
});

test("the guest save action ensures the session BEFORE adding", () => {
  const src = stripComments(read("src/app/(public)/directory/actions.ts"));
  const ensure = src.indexOf("ensure_guest_session");
  const add = src.indexOf("guest_add_saved_talent");
  assert.ok(ensure >= 0, "guest_add_saved_talent RAISES on a missing session");
  assert.ok(add >= 0, "the save action must still add");
  assert.ok(
    ensure < add,
    "the ensure must come BEFORE the add, or the first save of a fresh " +
      "visitor throws 'Unknown guest session'",
  );
});
