import assert from "node:assert/strict";
import test from "node:test";

import { buildSiteShellEditorUrl, resolveWebsiteEditorBaseUrl, resolveWebsiteLiveOrigin } from "./website-editor-links";

// TUL-372: Admin 'Paginas' > Editar opened <app host>/<page>?edit=1 ('Page not found')
// for a workspace with no primary domain; its site is path-hosted at <marketing origin>/w/<slug>
// (proxy-locale-context canResolvePathBasedTenant: hub + marketing hosts, app only on localhost).
const APP = "https://app.tulala.digital";

test("a workspace without a primary domain edits at <marketing host>/w/<slug>", () => {
  const liveOrigin = resolveWebsiteLiveOrigin(undefined, APP);
  assert.equal(resolveWebsiteEditorBaseUrl({ liveOrigin, tenantSlug: "luna", windowOrigin: APP, hasPrimaryDomain: false }), `https://tulala.digital/w/luna`);
  assert.equal(resolveWebsiteEditorBaseUrl({ liveOrigin, tenantSlug: "luna", windowOrigin: APP, hasPrimaryDomain: false }), `https://tulala.digital/w/luna`);
  assert.equal(
    buildSiteShellEditorUrl({ editorBaseUrl: resolveWebsiteEditorBaseUrl({ liveOrigin, tenantSlug: "luna", windowOrigin: APP, hasPrimaryDomain: false }) }),
    `https://tulala.digital/w/luna/p/__site_shell__?edit=1&panel=sections`,
  );
});

test("a workspace with a primary domain still edits on its own host", () => {
  const liveOrigin = resolveWebsiteLiveOrigin("luna.tulala.digital", APP);
  assert.equal(liveOrigin, "https://luna.tulala.digital");
  assert.equal(resolveWebsiteEditorBaseUrl({ liveOrigin, tenantSlug: "luna", windowOrigin: APP, hasPrimaryDomain: true }), "https://luna.tulala.digital");
  // the admin served ON the tenant's own host must not gain /w/
  assert.equal(
    resolveWebsiteEditorBaseUrl({ liveOrigin: "https://luna.tulala.digital", tenantSlug: "luna", windowOrigin: "https://luna.tulala.digital", hasPrimaryDomain: true }),
    "https://luna.tulala.digital",
  );
});

test("localhost path-hosting and the legacy call shape are unchanged", () => {
  assert.equal(resolveWebsiteEditorBaseUrl({ liveOrigin: "http://localhost:3001", tenantSlug: "luna", windowOrigin: "http://localhost:3001", hasPrimaryDomain: false }), "http://localhost:3001/luna");
  // without primaryDomain the old behaviour holds
  assert.equal(resolveWebsiteEditorBaseUrl({ liveOrigin: APP, tenantSlug: "luna", windowOrigin: APP }), APP);
});
