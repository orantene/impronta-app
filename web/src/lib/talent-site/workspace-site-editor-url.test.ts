import assert from "node:assert/strict";
import test from "node:test";

import { buildEditorPanelUrl } from "@/lib/admin/website-editor-links";
import { workspaceLiveUrl } from "@/lib/saas/workspace-live-url";
import { workspacePathUrl } from "@/lib/saas/workspace-public-url";

/**
 * Pure contract for TUL-347 editor base URLs (no DB). The server helper
 * `resolveWorkspaceSiteEditorUrl` composes these same primitives.
 */

test("free workspace without domains edits at /w/<slug>?edit=1 (not flat /<slug>)", () => {
  const live = workspaceLiveUrl({ slug: "qa-fresh-studio-2", planTier: "free", domains: null });
  assert.equal(live, workspacePathUrl("qa-fresh-studio-2"));
  assert.equal(live, "https://tulala.digital/w/qa-fresh-studio-2");
  const editor = buildEditorPanelUrl({ editorBaseUrl: live, panel: "sections" });
  assert.equal(editor, "https://tulala.digital/w/qa-fresh-studio-2/?edit=1&panel=sections");
});

test("live branded subdomain edits on that host, not the personal -2 sibling", () => {
  const live = workspaceLiveUrl({
    slug: "qa-fresh-studio-2",
    planTier: "studio",
    domains: {
      subdomains: [
        { hostname: "qa-fresh-studio-2.tulala.digital", status: "active", isPrimary: true },
      ],
    },
  });
  assert.equal(live, "https://qa-fresh-studio-2.tulala.digital");
  const editor = buildEditorPanelUrl({ editorBaseUrl: live, panel: "sections" });
  assert.equal(editor, "https://qa-fresh-studio-2.tulala.digital/?edit=1&panel=sections");
  assert.ok(!editor.includes("qa-fresh-studio.tulala.digital"));
});

test("pending domain rows do not invent a branded editor host", () => {
  const live = workspaceLiveUrl({
    slug: "qa-fresh-studio-2",
    planTier: "studio",
    domains: {
      subdomains: [
        { hostname: "qa-fresh-studio-2.tulala.digital", status: "pending", isPrimary: true },
      ],
    },
  });
  assert.equal(live, "https://tulala.digital/w/qa-fresh-studio-2");
});
