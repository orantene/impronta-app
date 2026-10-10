import assert from "node:assert/strict";
import test from "node:test";

import {
  buildSiteShellEditorUrl,
  hasBrandedWebsitePrimaryDomain,
  resolveWebsiteEditorBaseUrl,
  resolveWebsiteLiveOrigin,
} from "./website-editor-links";

// TUL-372 / TUL-519 W5-4: Admin 'Paginas' > Editar opened <app host>/<page>?edit=1
// ('Page not found') for a workspace with no branded domain; its site is
// path-hosted at <marketing origin>/w/<slug>. buildSiteShellEditorUrl must open
// that /w/<slug> editor URL, never /p/__site_shell__.
const APP = "https://app.tulala.digital";
const MARKETING_W = "https://tulala.digital/w/luna";

test("hasBrandedWebsitePrimaryDomain: empty and path-hosted are not branded", () => {
  assert.equal(hasBrandedWebsitePrimaryDomain(undefined), false);
  assert.equal(hasBrandedWebsitePrimaryDomain(""), false);
  assert.equal(hasBrandedWebsitePrimaryDomain("  "), false);
  assert.equal(hasBrandedWebsitePrimaryDomain("tulala.digital/w/luna"), false);
  assert.equal(hasBrandedWebsitePrimaryDomain("https://tulala.digital/w/luna"), false);
  assert.equal(hasBrandedWebsitePrimaryDomain("luna.tulala.digital"), true);
  assert.equal(hasBrandedWebsitePrimaryDomain("improntamodels.com"), true);
});

test("a workspace without a branded domain edits at <marketing host>/w/<slug>", () => {
  const liveOrigin = resolveWebsiteLiveOrigin(undefined, APP);
  assert.equal(
    resolveWebsiteEditorBaseUrl({
      liveOrigin,
      tenantSlug: "luna",
      windowOrigin: APP,
      hasPrimaryDomain: false,
    }),
    MARKETING_W,
  );
  assert.equal(
    buildSiteShellEditorUrl({
      editorBaseUrl: resolveWebsiteEditorBaseUrl({
        liveOrigin,
        tenantSlug: "luna",
        windowOrigin: APP,
        hasPrimaryDomain: false,
      }),
    }),
    `${MARKETING_W}/?edit=1&panel=sections`,
  );
});

test("path-hosted primaryDomain from the website bridge still edits at /w/<slug>", () => {
  // mergeWebsiteStateFromBridge stores `tulala.digital/w/<slug>` in primaryDomain.
  // Boolean(primaryDomain.trim()) was true and skipped the marketing /w/ base;
  // hasBrandedWebsitePrimaryDomain treats it as unbranded.
  const pathHost = "tulala.digital/w/luna";
  const liveOrigin = resolveWebsiteLiveOrigin(pathHost, APP);
  assert.equal(liveOrigin, MARKETING_W);
  assert.equal(hasBrandedWebsitePrimaryDomain(pathHost), false);
  assert.equal(
    resolveWebsiteEditorBaseUrl({
      liveOrigin,
      tenantSlug: "luna",
      windowOrigin: APP,
      hasPrimaryDomain: hasBrandedWebsitePrimaryDomain(pathHost),
    }),
    MARKETING_W,
  );
  const editor = buildSiteShellEditorUrl({
    editorBaseUrl: resolveWebsiteEditorBaseUrl({
      liveOrigin,
      tenantSlug: "luna",
      windowOrigin: APP,
      hasPrimaryDomain: hasBrandedWebsitePrimaryDomain(pathHost),
    }),
  });
  assert.equal(editor, `${MARKETING_W}/?edit=1&panel=sections`);
  assert.ok(editor && !editor.includes("/p/__site_shell__"));
  assert.ok(editor && editor.includes("/w/luna"));
});

test("buildSiteShellEditorUrl never deep-links /p/__site_shell__", () => {
  const url = buildSiteShellEditorUrl({ editorBaseUrl: MARKETING_W });
  assert.equal(url, `${MARKETING_W}/?edit=1&panel=sections`);
  assert.ok(url && !url.includes("__site_shell__"));
});

test("a workspace with a branded domain still edits on its own host", () => {
  const liveOrigin = resolveWebsiteLiveOrigin("luna.tulala.digital", APP);
  assert.equal(liveOrigin, "https://luna.tulala.digital");
  assert.equal(
    resolveWebsiteEditorBaseUrl({
      liveOrigin,
      tenantSlug: "luna",
      windowOrigin: APP,
      hasPrimaryDomain: true,
    }),
    "https://luna.tulala.digital",
  );
  // the admin served ON the tenant's own host must not gain /w/
  assert.equal(
    resolveWebsiteEditorBaseUrl({
      liveOrigin: "https://luna.tulala.digital",
      tenantSlug: "luna",
      windowOrigin: "https://luna.tulala.digital",
      hasPrimaryDomain: true,
    }),
    "https://luna.tulala.digital",
  );
});

test("localhost path-hosts at /w/<slug>, not the legacy flat /<slug>", () => {
  assert.equal(
    resolveWebsiteEditorBaseUrl({
      liveOrigin: "http://localhost:3001",
      tenantSlug: "luna",
      windowOrigin: "http://localhost:3001",
      hasPrimaryDomain: false,
    }),
    "http://localhost:3001/w/luna",
  );
  // omitting hasPrimaryDomain keeps the prior liveOrigin fallback
  assert.equal(
    resolveWebsiteEditorBaseUrl({ liveOrigin: APP, tenantSlug: "luna", windowOrigin: APP }),
    APP,
  );
});
