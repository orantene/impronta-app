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

test("TUL-1188: free workspace editor URL stays on this stack's marketing origin", async () => {
  const { resolveWorkspaceSiteEditorUrl } = await import("@/lib/talent-site/workspace-site-editor-url");
  const q = (data: unknown) => {
    const b = { select: () => b, eq: () => b, in: () => Promise.resolve({ data, error: null }), maybeSingle: () => Promise.resolve({ data, error: null }) };
    return b;
  };
  const admin = { from: (t: string) => (t === "agencies" ? q({ slug: "acme", plan_tier: "free" }) : q([])) } as never;
  const prev = { o: process.env.TULALA_MARKETING_ORIGIN, v: process.env.VERCEL_ENV };
  process.env.TULALA_MARKETING_ORIGIN = "http://localhost:3001";
  delete process.env.VERCEL_ENV;
  try {
    const url = await resolveWorkspaceSiteEditorUrl(admin, { tenantId: "t1", slug: "acme" });
    assert.equal(url, "http://localhost:3001/w/acme/?edit=1&panel=sections");
  } finally {
    if (prev.o === undefined) delete process.env.TULALA_MARKETING_ORIGIN; else process.env.TULALA_MARKETING_ORIGIN = prev.o;
    if (prev.v !== undefined) process.env.VERCEL_ENV = prev.v;
  }
});
