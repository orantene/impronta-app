/**
 * GUARD — every email-copy templateId is claimed by a catalog entry.
 *
 * WHY THIS EXISTS: "client.welcome" shipped EN + ES copy and a rendered
 * template (emails/client/Welcome.tsx) when the notification engine landed,
 * but no catalog entry ever referenced that templateId. Nothing could dispatch
 * it, so no client was ever welcomed — and because the copy and the component
 * both existed, every audit read the feature as "built". It took a
 * dispatch-log query showing zero sends in 30 days to notice.
 *
 * Orphaned copy is invisible by construction: it type-checks, it lints, and
 * it renders in a preview. Only the absence of a triggering entry gives it
 * away. This guard makes that absence loud at build time.
 *
 * Run: npx tsx --test src/lib/notifications/copy-has-entry.static.test.ts
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { getEmailCopy } from "./email-copy";
import { NOTIFICATION_CATALOG } from "./catalog";

/**
 * Copy keys that deliberately have no catalog entry. Each needs a REASON —
 * "we might use it later" is not one; delete the copy instead.
 */
const INTENTIONALLY_UNCLAIMED: Record<string, string> = {
  // Supabase Auth owns credential mail end to end (confirm, magic link,
  // recovery, email change). The copy is exported to the auth-email hook and
  // rendered by templates outside the catalog, so no entry is expected.
  "auth.signup": "rendered by the Supabase auth-email hook, not the catalog",
  "auth.magic_link": "rendered by the Supabase auth-email hook, not the catalog",
  "auth.recovery": "rendered by the Supabase auth-email hook, not the catalog",
  "auth.email_change": "rendered by the Supabase auth-email hook, not the catalog",
  "auth.invite": "rendered by the Supabase auth-email hook, not the catalog",
  // Shared chrome, not a message: layout/footer strings live under these keys.
  "common.layout": "shared layout chrome, not a dispatchable message",
};

test("every email-copy templateId is claimed by a catalog entry", () => {
  const claimed = new Set(
    NOTIFICATION_CATALOG.map((e) => e.email?.templateId).filter(
      (id): id is string => typeof id === "string",
    ),
  );

  const copyKeys = Object.keys(getEmailCopy("en"));
  const orphaned = copyKeys.filter(
    (key) => !claimed.has(key) && !(key in INTENTIONALLY_UNCLAIMED),
  );

  assert.deepEqual(
    orphaned,
    [],
    `Email copy exists for ${orphaned.length} templateId(s) that NO catalog entry references, ` +
      `so nothing can ever send them:\n  ${orphaned.join("\n  ")}\n\n` +
      `Either add a catalog entry with that templateId, delete the copy, or — if it is ` +
      `rendered outside the catalog — add it to INTENTIONALLY_UNCLAIMED in this file WITH a reason.`,
  );
});

test("client.welcome specifically is claimed (regression: it was orphaned)", () => {
  const entry = NOTIFICATION_CATALOG.find((e) => e.email?.templateId === "client.welcome");
  assert.ok(
    entry,
    "client.welcome has copy and a template but no catalog entry — no client can be welcomed",
  );
  assert.equal(entry?.id, "account.client_welcome");
  assert.deepEqual(entry?.triggers, ["account.client_onboarded"]);
});
