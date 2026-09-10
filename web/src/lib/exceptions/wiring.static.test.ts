/**
 * wiring.static.test.ts — the properties that only hold if the SOURCE says so.
 *
 * The behaviour these assert cannot be reached from a unit test: a service-role
 * read that forgets its tenant filter returns every workspace's rows and there
 * is no fake that reproduces that, and a resume path that grew a second money
 * executor would still pass every test in `model.test.ts`. So they are asserted
 * against the text.
 *
 * A static test is a weak instrument used deliberately. Each assertion here is
 * about a line that, if deleted, produces no failure anywhere else.
 */

import assert from "node:assert/strict";
import { CANONICAL_ROUTE_MATCHERS } from "@/components/admin/shell/canonical-routes";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { WEB_ROOT } from "@/lib/quality/supabase-unchecked-read";

const read = (rel: string) => readFileSync(join(WEB_ROOT, rel), "utf8");

const READ_SRC = read("src/lib/exceptions/read.ts");
const RESUME_SRC = read("src/lib/exceptions/resume.ts");
const ACTIONS_SRC = read("src/app/(workspace)/[tenantSlug]/admin/_exceptions-actions.ts");
const CLIENT_SRC = read("src/app/(workspace)/[tenantSlug]/admin/exceptions/exceptions-client.tsx");
const ROUTES_SRC = read("src/components/admin/shell/canonical-routes.ts");

test("every source read is tenant-scoped in the application layer", () => {
  // The reader runs under the service role, which bypasses RLS entirely. The
  // `.eq` IS the boundary here; RLS is not a backstop for it.
  const scoped = READ_SRC.match(/\.eq\("(?:tenant_id|source_tenant_id)", tenantId\)/g) ?? [];
  assert.equal(
    scoped.length,
    6,
    "one of the six sources lost its tenant filter — a service-role read without it returns every workspace",
  );
});

test("booking_transactions is scoped on source_tenant_id, not tenant_id", () => {
  // It has no `tenant_id` column. Scoping on the wrong name would silently
  // filter nothing and read every workspace's tills.
  const block = READ_SRC.slice(READ_SRC.indexOf('from("booking_transactions")'));
  assert.match(block.slice(0, 400), /\.eq\("source_tenant_id", tenantId\)/);
});

test("a failed source is named to the caller rather than becoming an empty list", () => {
  assert.match(READ_SRC, /unavailable/);
  assert.match(READ_SRC, /return null;/, "a read failure must be distinguishable from no rows");
  // The screen has to say it, not just receive it — the source names must
  // actually reach the rendered banner text, not just sit in a prop nobody
  // reads. Matched on the interpolation rather than a literal English
  // sentence (localized 2026-09-10) so the guard survives translation.
  assert.match(CLIENT_SRC, /role="alert"/);
  assert.match(CLIENT_SRC, /unavailable\.join\(", "\)/);
});

test("every read destructures error alongside data", () => {
  const destructures = READ_SRC.match(/const \{ data[^}]*\} = await/g) ?? [];
  assert.ok(destructures.length >= 5);
  for (const d of destructures) {
    assert.match(d, /error/, `an exceptions read discarded its error: ${d}`);
  }
});

test("the resume path never calls the refund executor", () => {
  // One intent with two executors is the failure `claimed_at` exists to
  // prevent, and a screen has no claim guard.
  assert.ok(
    !/refundOrderLines|executeBookingRefund/.test(RESUME_SRC),
    "the Exceptions inbox grew its own refund executor",
  );
});

test("arming a refund refuses a claimed or executed row", () => {
  const block = RESUME_SRC.slice(RESUME_SRC.indexOf("async function armRefundIntent"));
  assert.match(block.slice(0, 1600), /data\.executed_at \|\| data\.claimed_at/);
});

test("the engine retry grants one more attempt and never resets the counter", () => {
  const block = RESUME_SRC.slice(RESUME_SRC.indexOf("async function armEngineEffect"));
  assert.match(block.slice(0, 1600), /Math\.min\(attempts, ENGINE_MAX_RETRY_ATTEMPTS - 1\)/);
});

test("every resume goes through the command runner", () => {
  assert.match(RESUME_SRC, /runCommand\(/);
  assert.match(RESUME_SRC, /from "@\/lib\/commands\/run"/);
});

test("each resume writer is scoped by tenant as well as by id", () => {
  const writes = RESUME_SRC.match(/\.update\(\{[\s\S]*?\}\)\s*\n(?:\s*\.[a-z]+\([^\n]*\)\n)+/g) ?? [];
  assert.ok(writes.length >= 3, "the resume writers moved and this guard stopped measuring them");
  for (const write of writes) {
    assert.match(write, /\.eq\("tenant_id", tenantId\)/, `a resume write was not tenant-scoped:\n${write}`);
  }
});

test("the server action validates the verb against the closed set", () => {
  assert.match(ACTIONS_SRC, /RESUME_VERBS as readonly string\[\]\)\.includes\(input\.verb\)/);
});

test("the server action never takes a tenant from its caller", () => {
  assert.ok(
    !/tenantId:\s*input\./.test(ACTIONS_SRC),
    "a tenant id from the client is a workspace an operator can change",
  );
  assert.match(ACTIONS_SRC, /requireWorkspaceStaffAction/);
});

test("the client mints one idempotency key per row and holds it", () => {
  // Minted inside the handler it would be fresh per click, and three anxious
  // taps would be three intents.
  assert.match(CLIENT_SRC, /useMemo/);
  assert.match(CLIENT_SRC, /newCommandId\(\)/);
  const handler = CLIENT_SRC.slice(CLIENT_SRC.indexOf("const resume = useCallback"));
  assert.ok(
    !/newCommandId\(\)/.test(handler.slice(0, 900)),
    "the key is minted per click, which makes the claim table decorative",
  );
});

test("an inspect row has no control at all, not a disabled one", () => {
  const branch = CLIENT_SRC.slice(CLIENT_SRC.indexOf('row.nextAction.kind === "resume" ?'));
  const untilElse = branch.slice(0, branch.indexOf(") : ("));
  assert.match(untilElse, /<button/);
  const elseArm = branch.slice(branch.indexOf(") : ("), branch.indexOf(")}\n"));
  assert.ok(!/<button/.test(elseArm), "a row that needs a person was given a button");
});

test("the page is reachable as a canonical route", () => {
  // Asserted against the matchers rather than the source text: this entry is
  // now projected from the destination registry, so matching its spelling
  // would only prove how the list is written, not that the path is claimed.
  assert.ok(
    CANONICAL_ROUTE_MATCHERS.some((matches) => matches(["admin", "exceptions"])),
    "/admin/exceptions must render its canonical page, not the single-page shell",
  );
});

test("no resume writer reports a failed WRITE as a failure that changed nothing", () => {
  // A SELECT that errored changed nothing and can say so. An UPDATE that
  // errored may have failed on the way back from a row it already changed, and
  // "Nothing was changed." is the sentence that sends an operator away.
  const writeFailures = RESUME_SRC.match(/if \(uErr\) \{[\s\S]{0,400}?\n {2}\}/g) ?? [];
  assert.ok(writeFailures.length >= 3, "the resume writers moved and this guard stopped measuring");
  for (const branch of writeFailures) {
    assert.match(
      branch,
      /CommandFailure\("unknown"/,
      `a write failure claimed to know what it left behind:\n${branch}`,
    );
  }
});

test("the resume screen prefers the runner's own sentence over its own fallback", () => {
  // Only the runner knows which part of a partial landed, so a message from it
  // has to short-circuit the reason-code copy rather than sit under it.
  const guard = ACTIONS_SRC.indexOf("if (result.message) return");
  const fallback = ACTIONS_SRC.indexOf("Nothing was changed.");
  assert.ok(guard > 0, "the action discards the runner's sentence");
  assert.ok(
    guard < fallback,
    "the reassuring fallback is reachable before the runner's own account of what happened",
  );
  assert.equal(
    (ACTIONS_SRC.match(/Nothing was changed\./g) ?? []).length,
    1,
    "the exceptions action says nothing changed in more than one branch",
  );
});

test("an abandoned command claim is a source, and it is inspect-only", () => {
  // Every other resumable source names ONE idempotent executor. A command
  // claim names an arbitrary handler, so a generic button here would be a
  // second executor for every command in the system at once.
  assert.match(READ_SRC, /from\("command_idempotency"\)/);
  const block = READ_SRC.slice(READ_SRC.indexOf("async function readStaleCommandClaims"));
  assert.match(block.slice(0, 1200), /\.eq\("tenant_id", tenantId\)/);
  assert.match(block.slice(0, 1200), /\.eq\("status", "in_flight"\)/);
  // A `.lte` on a nullable column drops NULL rows silently, and a NULL lease
  // is a pre-lease row: exactly the abandoned claims this source is for.
  assert.match(block.slice(0, 1200), /lease_expires_at\.is\.null/);

  const model = read("src/lib/exceptions/model.ts");
  const classifier = model.slice(model.indexOf("export function classifyStaleCommandClaim"));
  assert.match(classifier.slice(0, 1400), /kind: "inspect"/);
  assert.ok(
    !/kind: "resume"/.test(classifier.slice(0, 1400)),
    "an abandoned claim was given a button that would re-run an unknown handler",
  );
});
