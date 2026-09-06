import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

/**
 * D4 — the ORDER inside removeIntegration is the contract: the upstream revoke
 * reads the access token and fires BEFORE deleteIntegrationSecrets, because
 * after the delete there is no token left to revoke with. A refactor that
 * moves the revoke below the delete keeps every unit test green and silently
 * leaves the grant alive at TikTok. Pin the shape, not the text.
 */
const src = readFileSync(
  path.join(
    process.cwd(),
    "src/app/(workspace)/[tenantSlug]/admin/settings/integration-actions.ts",
  ),
  "utf8",
);

test("removeIntegration revokes the TikTok token before deleting local secrets", () => {
  const fn = src.slice(src.indexOf("export async function removeIntegration("));
  const revokeAt = fn.indexOf("revokeUpstreamGrant(guard.tenantId, key)");
  const deleteAt = fn.indexOf("deleteIntegrationSecrets(");
  assert.ok(revokeAt > 0, "removeIntegration must call revokeUpstreamGrant");
  assert.ok(deleteAt > 0, "removeIntegration must call deleteIntegrationSecrets");
  assert.ok(revokeAt < deleteAt, "revoke must run before the local delete");
  const helper = readFileSync(
    path.join(process.cwd(), "src/lib/integrations/disconnect-upstream.ts"),
    "utf8",
  );
  assert.ok(
    helper.includes('getDecryptedSecret(tenantId, key, "access_token")'),
    "the revoke must use the stored access token",
  );
  assert.ok(helper.includes("revokeTikTokToken(accessToken)"));
});

test("the drawer tells an Instagram operator where to remove access", () => {
  const drawer = readFileSync(
    path.join(process.cwd(), "src/components/admin/integrations/IntegrationConfigDrawer.tsx"),
    "utf8",
  );
  assert.ok(drawer.includes("feedbackDisconnectedInstagram"));
  for (const locale of ["en", "es"]) {
    const messages = JSON.parse(
      readFileSync(path.join(process.cwd(), `messages/${locale}.json`), "utf8"),
    ) as Record<string, unknown>;
    const text = JSON.stringify(messages);
    assert.ok(text.includes('"feedbackDisconnectedInstagram"'), `${locale} string present`);
  }
});
