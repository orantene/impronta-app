/**
 * TUL-1246 (P0) regression guard: the design picker's preview card (Maison v2,
 * Folio, Gridline) may render a talent the viewer does not own ONLY when that
 * talent is a real seeded demo. Before the gate, an allow-listed profile code
 * whose row had been polluted / reused rendered that row's stored name, phone
 * and city into every other talent's picker.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";

import { GALLERY_DESIGNS } from "@/lib/talent-site/theme-catalog/gallery-meta";
import { DEMO_BATCH } from "@/lib/talent-site/theme-catalog/demo-account";
import { findDemo } from "@/lib/talent-site/demos/registry";
import { allowedDemoProfileCodes, resolveDemoPreviewSource } from "./demo-preview-source";
import { previewMayRenderDemoTalent } from "./demo-preview-gate.server";

type Row = { id: string; user_id: string | null; is_demo: boolean | null };

/** Minimal fake of the three reads `assertDemoTarget` makes. */
function fakeAdmin(opts: { row: Row | null; email: string | null; demoBatch: unknown }): SupabaseClient {
  const profiles = {
    select: () => ({
      eq: () => ({ is: () => ({ maybeSingle: async () => ({ data: opts.row, error: null }) }) }),
    }),
  };
  const sites = { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: "site-1" }, error: null }) }) }) };
  return {
    from: (table: string) => (table === "talent_profiles" ? profiles : sites),
    auth: {
      admin: {
        getUserById: async () => ({
          data: { user: { email: opts.email, app_metadata: { demo_batch: opts.demoBatch } } },
          error: null,
        }),
      },
    },
  } as unknown as SupabaseClient;
}

const CARD_DESIGNS = ["maison-v2", "folio", "gridline"] as const;

for (const slug of CARD_DESIGNS) {
  const demos = GALLERY_DESIGNS.find((d) => d.slug === slug)?.demos.filter(
    (d) => d.status === "built" && d.source.kind === "demo-talent",
  );

  test(`${slug} card: every demo-talent source is in the demo registry (so the gate can pass it)`, () => {
    assert.ok(demos && demos.length > 0, `${slug} has built demo-talent demos`);
    for (const demo of demos!) {
      const src = resolveDemoPreviewSource(slug, `${slug}:${demo.key}`);
      assert.ok(src && src.kind === "demo-talent", `${slug}:${demo.key} resolves`);
      assert.ok(allowedDemoProfileCodes().has(src.profileCode));
      assert.ok(findDemo(src.profileCode), `${src.profileCode} (${slug}:${demo.key}) must be in DEMO_REGISTRY`);
    }
  });

  test(`${slug} card: an allow-listed code whose row is NOT a demo is refused`, async () => {
    const code = (resolveDemoPreviewSource(slug, `${slug}:${demos![0]!.key}`) as { profileCode: string }).profileCode;
    const demoEmail = "demo-x@demo.tulala.digital";
    // A real / polluted talent that ended up behind the code: no is_demo flag.
    const notFlagged = await previewMayRenderDemoTalent(
      fakeAdmin({ row: { id: "t1", user_id: "u1", is_demo: false }, email: demoEmail, demoBatch: DEMO_BATCH }),
      code,
    );
    assert.equal(notFlagged.ok, false);
    // Flagged, but the account is a real person (not a demo email / batch).
    const realAccount = await previewMayRenderDemoTalent(
      fakeAdmin({ row: { id: "t1", user_id: "u1", is_demo: true }, email: "rosa@gmail.com", demoBatch: DEMO_BATCH }),
      code,
    );
    assert.equal(realAccount.ok, false);
    const wrongBatch = await previewMayRenderDemoTalent(
      fakeAdmin({ row: { id: "t1", user_id: "u1", is_demo: true }, email: demoEmail, demoBatch: "other" }),
      code,
    );
    assert.equal(wrongBatch.ok, false);
    // No row at all.
    const missing = await previewMayRenderDemoTalent(fakeAdmin({ row: null, email: null, demoBatch: null }), code);
    assert.equal(missing.ok, false);
  });

  test(`${slug} card: a genuine seeded demo passes`, async () => {
    const code = (resolveDemoPreviewSource(slug, `${slug}:${demos![0]!.key}`) as { profileCode: string }).profileCode;
    const ok = await previewMayRenderDemoTalent(
      fakeAdmin({ row: { id: "t1", user_id: "u1", is_demo: true }, email: "demo-x@demo.tulala.digital", demoBatch: DEMO_BATCH }),
      code,
    );
    assert.deepEqual(ok, { ok: true, talentProfileId: "t1" });
  });
}

test("a profile code outside the demo registry is refused without touching the database", async () => {
  let touched = false;
  const spy = { from: () => { touched = true; throw new Error("db"); } } as unknown as SupabaseClient;
  const res = await previewMayRenderDemoTalent(spy, "TAL-93950");
  assert.equal(res.ok, false);
  assert.equal(touched, false);
});

test("wiring: the demo hydration goes through the gate, and a refused demo never falls back to the viewer's stored profile", () => {
  const dir = join(process.cwd(), "src/app/template-preview/[key]");
  const hydration = readFileSync(join(dir, "demo-preview-hydration.ts"), "utf8");
  assert.match(hydration, /previewMayRenderDemoTalent\(/);
  // The old unguarded profile_code lookup must not come back.
  assert.doesNotMatch(hydration, /\.eq\("profile_code", source\.profileCode\)/);
  const preview = readFileSync(join(dir, "theme-preview.tsx"), "utf8");
  assert.match(preview, /demoSource\?\.kind === "demo-talent" \? null : talentProfileId/);
});
