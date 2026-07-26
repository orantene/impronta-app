import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const PUBLIC_PAGE_SRC = readFileSync(
  join(process.cwd(), "src/app/t/[profileCode]/profile-view.tsx"),
  "utf8",
);

const PUBLIC_LOAD_SRC = readFileSync(
  join(process.cwd(), "src/lib/talent-site/server/public-load.ts"),
  "utf8",
);

const RESOLVE_SRC = readFileSync(
  join(process.cwd(), "src/lib/talent-site/resolve-platform-talent-site.ts"),
  "utf8",
);

test("profile route resolves Max site via platform helper on Tulala hosts", () => {
  assert.match(PUBLIC_PAGE_SRC, /resolvePlatformTalentSiteForProfile/);
  assert.match(PUBLIC_PAGE_SRC, /TalentSiteRenderer|PlatformTalentMaxSiteView/);
  assert.equal(PUBLIC_PAGE_SRC.includes("draft_snapshot"), false);
});

test("public loader uses published RPC first to resolve profile_code → id", () => {
  // The loader still hits the anon-executable published RPC first as the
  // cheapest code→id lookup for a published talent, then falls back to a direct
  // talent_profiles lookup. It NO LONGER parses the snapshot (the snapshot is
  // not the profile render anymore — repoint #493).
  assert.match(PUBLIC_LOAD_SRC, /talent_public_site_for_profile_code/);
  assert.match(PUBLIC_LOAD_SRC, /talent_profile_id/);
  // The dead snapshot-as-profile reads are gone: no snapshot validation, and
  // the orphaned owner-draft-preview loader has been removed.
  assert.equal(PUBLIC_LOAD_SRC.includes("validateTalentSiteSnapshot"), false);
  assert.equal(PUBLIC_LOAD_SRC.includes("loadTalentPublicSiteDraftForOwner"), false);
});

test("REPOINT: /t/[code] always resolves the discovery profile (never the Max snapshot)", () => {
  // Talent Max Site: /t/[code] is the discovery profile only. The resolver
  // must NOT serve talent_sites.published_snapshot / draft_snapshot as the
  // profile, must NOT plan-gate a published snapshot here, and must always fall
  // through to resolveDefaultProfile (freeform default or LightProfileLayout).
  assert.match(RESOLVE_SRC, /resolveDefaultProfile/);
  assert.equal(RESOLVE_SRC.includes("planPermitsPublishedTalentSite"), false);
  assert.equal(RESOLVE_SRC.includes("loadTalentPublicSiteDraftForOwner"), false);
  assert.equal(RESOLVE_SRC.includes("loadCurrentTalentPlanKey"), false);
  // The legacy snapshot reads are gone from the render path. (The repoint
  // doc-comment still NAMES the columns to explain what is no longer served;
  // we assert there is no draft-snapshot LOAD, not that the word never appears.)
  assert.equal(/loadTalentPublicSiteDraft|draft\s*=\s*await/.test(RESOLVE_SRC), false);
  // The dead `previewDraft` option that drove the removed draft-snapshot branch
  // is gone from the resolver signature.
  assert.equal(RESOLVE_SRC.includes("previewDraft?"), false);

  // The snapshot plan gate itself is unchanged (now used only by the Max-site
  // render path), so keep proving its rules.
  const GATE_SRC = readFileSync(
    join(process.cwd(), "src/lib/talent-site/plan-permits-snapshot.ts"),
    "utf8",
  );
  assert.match(GATE_SRC, /compositionMode === "custom" && tier !== "max"/);
  assert.match(GATE_SRC, /isTemplateAllowedForTier/);
});

test("dashboard public URL is canonical /t/code without /site", () => {
  const dashState = readFileSync(
    join(process.cwd(), "src/lib/talent-site/server/dashboard-state.ts"),
    "utf8",
  );
  assert.match(dashState, /publicSiteUrl: profileCode \? `\/t\/\$\{profileCode\}`/);
  assert.equal(dashState.includes("/site`"), false);
});
