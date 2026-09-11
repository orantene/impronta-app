/**
 * feed-wiring.static.test.ts — defect 6, pinned where it actually failed.
 *
 * The old drawer was not broken code; it was correct code describing a system
 * that did not exist. Every assertion here is therefore about a JOIN between
 * two files — a URL and a route, a route and an allow-list entry, a screen and
 * the capability it claims — because that is the only place this class of
 * defect can live.
 */

import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const read = (relative: string) => readFileSync(resolve(HERE, relative), "utf8");

const drawerFile = read("../../components/admin/shell/internal/drawers/light-19.tsx");
/**
 * The component body only. The file's header comment quotes the dead URL and
 * the "Last synced 4 min ago" string on purpose — that is the record of what
 * was removed and why — and a comment cannot render. Asserting over the whole
 * file would make writing down the history illegal, which is how history stops
 * being written down.
 */
const drawer = drawerFile.slice(
  drawerFile.indexOf("export function CalendarSyncDrawer"),
  drawerFile.indexOf("export function SystemStatusDrawer"),
);
const route = read("../../app/api/calendar/feed/[token]/route.ts");
const pathGroups = read("../saas/path-groups.ts");
const token = read("./feed-token.ts");
const actions = read("./feed-actions.ts");
const migration = readFileSync(
  resolve(HERE, "../../../../supabase/migrations/20261230001200_calendar_feed_tokens.sql"),
  "utf8",
);

test("no hardcoded subscription URL survives in the drawer", () => {
  assert.doesNotMatch(
    drawer,
    /cal\/export\//,
    "the string constant that pointed at a route nobody wrote",
  );
  assert.doesNotMatch(drawer, /token=abc123/);
});

test("the drawer no longer claims a two-way Google connection", () => {
  assert.doesNotMatch(
    drawer,
    /connected:\s*true/,
    "a literal that rendered a green 'Last synced 4 min ago' next to a disabled button",
  );
  assert.doesNotMatch(drawer, /Last synced/);
});

test("the drawer offers no permanently disabled control", () => {
  // A control that can never be pressed is the shape this defect took. If a
  // provider connection is not built, it does not get a button. `disabled`
  // bound to the in-flight flag is a different thing and is allowed.
  assert.doesNotMatch(drawer, /\n\s+disabled\n/);
});

test("the drawer's URL comes from the mint action, not from a constant", () => {
  assert.match(drawer, /issueCalendarFeedUrl/);
  assert.match(drawer, /disconnectCalendarFeed/);
});

test("the route exists at the path the action hands out", () => {
  assert.match(actions, /\/api\/calendar\/feed\/\$\{minted\.token\}\.ics/);
  assert.match(route, /export async function GET/);
});

test("the feed path is on the shared allow-list", () => {
  // Without this the subscription 404s at the proxy before Next routing runs,
  // which is a route that exists on disk and serves an HTML 404 — the exact
  // four-layer failure that made the original URL look like a routing bug.
  assert.match(pathGroups, /"\/api\/calendar",/);
});

test("every refusal from the route is a 404", () => {
  // A revoked token answering 403 confirms to whoever holds it that their
  // guess landed on a real workspace.
  assert.doesNotMatch(route, /status: 401/);
  assert.doesNotMatch(route, /status: 403/);
  assert.match(route, /status: 404/);
});

test("the feed is never cached by a shared cache", () => {
  assert.match(route, /"Cache-Control": "private, no-store"/);
});

test("only the hash of a token is stored", () => {
  assert.match(token, /createHash\("sha256"\)/);
  assert.doesNotMatch(
    token,
    /token_hash: token\b/,
    "storing the plaintext would make a table dump a set of working URLs",
  );
  assert.match(migration, /token_hash text not null unique/);
});

test("mint revokes before it inserts", () => {
  // The two statements cannot share a transaction over PostgREST. Revoke-first
  // fails to 'no working feed' (visible, one button to fix); insert-first fails
  // to 'two working feeds', one of which the operator believes they just
  // killed.
  const revokeAt = token.indexOf('revoked_at: nowIso');
  const insertAt = token.indexOf('.insert({');
  assert.ok(revokeAt > 0 && insertAt > 0 && revokeAt < insertAt);
});

test("a revoked token resolves to nothing", () => {
  assert.match(token, /if \(!row \|\| row\.revoked_at\) return null;/);
});

test("the last-used stamp can never fail the fetch", () => {
  assert.match(route, /void touchCalendarFeedToken/);
  assert.match(token, /catch \(error\) \{\s*\n\s*logServerError\("calendar\/touchFeedToken"/);
});

test("both actions are workspace-scoped, not cookie-scoped", () => {
  // A multi-workspace operator standing on /nova-crew/admin must not mint a
  // credential for whichever tenant a preference cookie points at — and a
  // calendar feed is a credential whose misdirection would go unnoticed for
  // months.
  const guards = actions.match(/requireWorkspaceStaffAction\(\)/g) ?? [];
  assert.equal(guards.length, 2);
  assert.doesNotMatch(actions, /requireStaffTenantAction/);
});

test("the token table is closed to anon and authenticated", () => {
  assert.match(migration, /enable row level security/);
  assert.match(migration, /revoke all on public\.calendar_feed_tokens from anon, authenticated/);
  assert.doesNotMatch(
    migration,
    /create policy/,
    "a select policy scoped to auth.uid() would hand every operator a readable list of live credential hashes",
  );
});

test("one live token per operator per workspace", () => {
  assert.match(migration, /calendar_feed_tokens_live_per_user/);
  assert.match(migration, /where revoked_at is null/);
});
