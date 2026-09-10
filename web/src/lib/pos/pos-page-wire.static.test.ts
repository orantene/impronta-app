import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolveWorkspaceAdminPage } from "@/app/(workspace)/[tenantSlug]/admin/workspace-page-routing";
import { CANONICAL_ROUTE_MATCHERS } from "@/components/admin/shell/canonical-routes";
import { join } from "node:path";
import {
  isPosSegment,
  liveRouteSegment,
  resolveDestination,
} from "../workspace/destinations";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

/**
 * Source with comments removed.
 *
 * The "no effects" assertion below used to run over the raw file, and the
 * counter's own header now EXPLAINS why it runs no effects — so a plain
 * substring match was satisfied by the explanation and failed the file for
 * documenting the rule it obeys. A guard that a comment can turn red is a
 * guard a comment can also turn green.
 */
const code = (p: string) =>
  read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

test("layer 1 — the POS page exists and is capability-gated", () => {
  const page = read("src/app/(workspace)/[tenantSlug]/admin/pos/page.tsx");
  assert.match(page, /userHasCapability\(/);
  assert.match(page, /PosClient/);
});

test("layer 2 — a canonical-route matcher claims /admin/pos", () => {
  // Asserted against the matchers themselves rather than the source text.
  // These lines used to be hand-written and are now projected from the
  // destination registry, so a text match would only prove how the list is
  // spelled. What has to hold is that the path is claimed.
  assert.ok(
    CANONICAL_ROUTE_MATCHERS.some((matches) => matches(["admin", "pos"])),
    "/admin/pos must render its canonical page, not the single-page shell",
  );
});

test("layer 3 — 'pos' is an allowed workspace segment", () => {
  // Asserted by resolving the segment rather than by reading the list out
  // of the source: the list is now derived from the destination registry,
  // so its spelling proves nothing. What must hold is that the address
  // still opens its page.
  for (const segment of ["pos"]) {
    assert.equal(
      resolveWorkspaceAdminPage(segment),
      segment,
      `/admin/${segment} must still resolve to its own page`,
    );
  }
});

test("layer 4 — the destination registry routes New sale to the POS route", () => {
  // Repointed from the dead `lib/workspace/navigation-registry.ts` (deleted in
  // T2-A: nothing consumed it) to the one registry of workspace destinations.
  const pos = resolveDestination("pos");
  assert.ok(pos, "pos must resolve to a destination");
  assert.equal(pos.id, "pos");
  assert.equal(liveRouteSegment(pos), "pos");
  // POS owns the whole screen; it must never be reachable as a rail row.
  assert.equal(pos.chrome, "pos");
  assert.ok(isPosSegment("pos"));
});

test("POS actions require workspace staff and booking.payment.request", () => {
  const src = read("src/app/(workspace)/[tenantSlug]/admin/pos/actions.ts");
  assert.match(src, /requireWorkspaceStaffAction/);
  assert.match(src, /booking.payment.request/);
  assert.match(src, /userHasCapability\(capability/);
  assert.match(src, /staff\("booking.payment.mark_received"\)/);
  assert.doesNotMatch(src, /view_dashboard/);
});

test("shift cash-up lives on POS, not a new destination", () => {
  const page = read("src/app/(workspace)/[tenantSlug]/admin/pos/page.tsx");
  assert.match(page, /currentShift/);
  const client = read("src/app/(workspace)/[tenantSlug]/admin/pos/pos-client.tsx");
  assert.match(client, /posOpenShift/);
  assert.match(client, /posCloseShift/);
  assert.match(client, /amountCents/);
  assert.match(client, /posSubmitPrep/);
  assert.match(client, /promisedAt/);
  assert.match(client, /prepDestination/);
  // NO EFFECTS on the counter. Everything it shows is a prop the server
  // resolved or a value the operator just typed, so there is nothing to
  // synchronise after mount — and a till that paints one thing on the server
  // and another after hydration flickers a price at a customer. Matched on
  // the CALL, over comment-stripped source, so the rule can be written down
  // in the file without failing it.
  assert.doesNotMatch(
    code("src/app/(workspace)/[tenantSlug]/admin/pos/pos-client.tsx"),
    /useEffect\s*\(/,
  );
});

test("the collection key is DERIVED from the sale, never minted per call", () => {
  const client = code("src/app/(workspace)/[tenantSlug]/admin/pos/pos-client.tsx");
  // The defect: a fresh uuid per call made a cashier's second tap of Charge a
  // SECOND claim on the balance, so the same customer paid twice.
  assert.match(
    client,
    /idempotencyKey:\s*posCollectionKey\(/,
    "the charge must name its attempt with the derived key",
  );
  assert.doesNotMatch(
    client,
    /idempotencyKey[\s\S]{0,120}(randomUUID|Math\.random|Date\.now)/,
    "an operation key minted per call cannot be told apart from a new collection",
  );
  // And the version the operator is looking at goes with it, so a second till
  // that changed the sale is refused as a conflict rather than collected on.
  assert.match(client, /expectedVersion:\s*sale\.version/);
});

test("every refusal reaches the cashier as a sentence, never as a reason word", () => {
  const client = code("src/app/(workspace)/[tenantSlug]/admin/pos/pos-client.tsx");
  assert.match(client, /refusalFromResult\(/, "refusals must go through the sentence mapping");
  assert.match(client, /<PosRefusalBanner/, "and be rendered by the banner");
  // The screen this replaced did `setMsg(r.error)` and printed the engine's
  // own word — a cashier read `not_draft` and `engine_error` off the till.
  assert.doesNotMatch(
    client,
    /setRefusal\(\s*(result|r)\.(error|reason)\s*\)/,
    "an engine reason word must never be put on screen directly",
  );
});

test("the route validates its mode against the modes this person may use", () => {
  const page = code("src/app/(workspace)/[tenantSlug]/admin/pos/page.tsx");
  assert.match(page, /modesForPerson\(/, "the usable set comes from the mode vocabulary");
  assert.match(
    page,
    /enabledPosModesFromSettings\(/,
    "the workspace's own modes come from its settings, never a literal",
  );
  assert.match(page, /parsePosMode\(/, "the query string is parsed, not trusted");
  assert.match(page, /redirect\(/, "an unusable mode redirects to the first allowed one");
  // Someone with no modes gets a SCREEN, not a 404: they are signed in, on a
  // workspace they belong to, at a real address.
  const gate = page.slice(page.indexOf("usableModes.length === 0"));
  assert.match(gate.slice(0, 600), /dashboard\.pos\.counter\.gate\.title/);
  assert.doesNotMatch(gate.slice(0, 600), /notFound\(\)/);
});

test("no tender is offered as working without the provider behind it", () => {
  const page = code("src/app/(workspace)/[tenantSlug]/admin/pos/page.tsx");
  // Availability is read on the SERVER from the real environment. An
  // optimistic `available: true` here is a cashier watching a customer "pay"
  // into a mock.
  assert.match(page, /isStripeConfigured\(\)/);
  assert.match(page, /reportTerminalAvailability\(\)/);
  assert.match(
    page,
    /id: "pass", available: false/,
    "pass credits have no ledger table yet and must never look live",
  );
});

test("walk-in class places pick a tenant-scoped session", () => {
  const page = read("src/app/(workspace)/[tenantSlug]/admin/pos/page.tsx");
  assert.match(page, /from\("sessions"\)/);
  assert.match(page, /from\("sessions"\)[\s\S]{0,280}eq\("tenant_id", scope.tenantId\)/);
  assert.match(page, /eq\("status", "scheduled"\)/);
  const client = read("src/app/(workspace)/[tenantSlug]/admin/pos/pos-client.tsx");
  assert.match(client, /sessionId/);
  assert.match(client, /posAddLine/);
});
