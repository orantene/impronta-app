import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

/**
 * D-MSG-346: the client thread must never echo a staff-voiced offer row.
 *
 * `inquiry_messages.body` on `offer_event` / `offer_state` rows is written for
 * the workspace, about the client ("Offer sent to client.", "Accepted offer
 * v4"). Rendering it in the CLIENT thread showed people notes about
 * themselves. Proven live on the fixture: the guest dock displayed "Offer sent
 * to client." directly above their own offer card.
 *
 * The fix drops those duplicate rows for this audience - the offer card below
 * already carries the live status - so the guard is that the client renderer
 * never falls back to `message.body` on an offer row.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, "..", "..");
const read = (rel: string) => readFileSync(join(SRC, rel), "utf8");

test("the client offer branch never renders message.body", () => {
  const src = read("components/messages-v5/client/ClientCard.tsx");
  const start = src.indexOf('case "offer_event":');
  assert.ok(start > 0, "offer branch not found");
  const branch = src.slice(start, src.indexOf('case "payment_request":', start));
  // Strip comments: the fix documents the old behaviour in prose, and a rule
  // that trips over its own explanation is worse than no rule.
  const code = branch
    .split("\n")
    .filter((line) => !line.trim().startsWith("//") && !line.trim().startsWith("*") && !line.trim().startsWith("/*"))
    .join("\n");
  assert.doesNotMatch(
    code,
    /message\.body/,
    "the client offer branch must not echo the staff-voiced body",
  );
  assert.match(branch, /if \(!offerCards\.has\(message\.id\)\) return null;/, "duplicate offer rows must drop out for the client");
});

test("an offer row whose offer is not loaded still renders something", () => {
  const src = read("components/messages-v5/client/ClientCard.tsx");
  const start = src.indexOf('case "offer_event":');
  const branch = src.slice(start, src.indexOf('case "payment_request":', start));
  // Nothing should silently vanish just because the summary is missing.
  assert.match(branch, /if \(!offer\) \{\s*return <SystemLine/, "a row with no loaded offer must still read as a neutral line");
});
