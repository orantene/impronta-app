import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import { isBuiltinStarterSlug } from "@/lib/site-admin/builder-core/templates/builtin-starter-hash";
import { COLLECTION_DESIGNS } from "@/lib/talent-site/theme-catalog/collection/designs";

import {
  codeVersionOf,
  deriveFactoryStatus,
  newestRun,
  openToTalentsVersionOf,
  parseMockupSummary,
  parityCommandFor,
  previewFromCodeHref,
  releasedVersionOf,
  talentSyncSummaryFacts,
} from "./factory-model";
import { evaluateFactoryGate, guardedFactoryRun } from "./talent-factory-gate";
import { FACTORY_SLUGS } from "./talent-factory.server";

const read = (f: string) => readFileSync(join(process.cwd(), "src/components/builder-lab/talent-factory", f), "utf8");

describe("factory gate refuses non-admins", () => {
  it("anonymous and non-admin sessions are refused; the body never runs", async () => {
    for (const session of [
      { user: null, profile: null },
      { user: { id: "u1" }, profile: { platform_role: null, app_role: "talent" } },
      { user: { id: "u2" }, profile: undefined },
    ]) {
      let ran = false;
      const res = await guardedFactoryRun(evaluateFactoryGate(session), async () => {
        ran = true;
        return { ok: true as const, data: 1 };
      });
      assert.equal(res.ok, false);
      assert.equal(ran, false);
    }
  });
  it("a super admin passes and receives the user id", async () => {
    const res = await guardedFactoryRun(
      evaluateFactoryGate({ user: { id: "admin" }, profile: { platform_role: "super_admin" } }),
      async (uid) => ({ ok: true as const, data: uid }),
    );
    assert.deepEqual(res, { ok: true, data: "admin" });
  });
  it("every exported action runs behind guardedFactoryRun", () => {
    const src = read("talent-factory-actions.ts");
    const actions = src.match(/export async function action\w+/g) ?? [];
    assert.ok(actions.length >= 2);
    assert.equal((src.match(/guardedFactoryRun\(await gate\(\)/g) ?? []).length, actions.length);
  });
});

describe("factory is talent only", () => {
  it("lists exactly COLLECTION_DESIGNS and no agency starter slug", () => {
    assert.deepEqual([...FACTORY_SLUGS], COLLECTION_DESIGNS.map((d) => d.slug));
    for (const s of FACTORY_SLUGS) assert.equal(isBuiltinStarterSlug(s), false, s);
    for (const agency of ["builtin-impronta", "builtin-agency", "saas", "store", "builtin-studio-one"]) {
      assert.ok(!FACTORY_SLUGS.includes(agency), agency);
    }
    for (const s of ["maison-v2", "folio", "gridline"]) assert.ok(FACTORY_SLUGS.includes(s));
  });
  it("never touches the agency starter sync or workspace templates", () => {
    for (const f of ["talent-factory-actions.ts", "talent-factory.server.ts", "talent-factory-tab.tsx"]) {
      const src = read(f);
      assert.doesNotMatch(src, /syncBuiltinStartersAction|import-builtin-starters|listStarterTemplatesAction|builder_templates/, f);
    }
    assert.match(read("talent-factory.server.ts"), /syncBuiltinTalentThemes\(admin, null, \{ flipCatalog: false \}\)/);
  });
});

describe("model", () => {
  it("status and versions", () => {
    assert.equal(deriveFactoryStatus({ catalogVersion: null, codeDiffers: true }), "not_synced");
    assert.equal(deriveFactoryStatus({ catalogVersion: 3, codeDiffers: true }), "code_ahead");
    assert.equal(deriveFactoryStatus({ catalogVersion: 3, codeDiffers: false }), "up_to_date");
    assert.equal(codeVersionOf(3, true), 4);
    assert.equal(codeVersionOf(3, false), 3);
  });
  it("links and cli", () => {
    assert.equal(previewFromCodeHref("folio"), "/template-preview/folio?kind=talent-theme&source=code");
    assert.equal(parityCommandFor("gridline"), "npm run qa:mockup-parity -- --design gridline");
  });
  it("parses and picks the newest summary for the design only", () => {
    const mk = (design: string, timestamp: string, open: number) => ({ design, timestamp, pass: 1, fail: 0, known: 0, openDeltas: open, deltasByLayer: { token: open } });
    const a = parseMockupSummary(mk("folio", "2026-09-01T00:00:00Z", 5), "folio", "d1");
    const b = parseMockupSummary(mk("folio", "2026-09-02T00:00:00Z", 2), "folio", "d2");
    assert.equal(parseMockupSummary(mk("gridline", "2026-09-03T00:00:00Z", 0), "folio", "d3"), null);
    assert.equal(newestRun([a!, b!])?.openDeltas, 2);
    assert.equal(b?.reportPath, "web/qa-evidence/mockup-parity/d2/report.html");
    assert.equal(b?.deltasByLayer.token, 2);
  });
});

describe("openToTalentsVersionOf", () => {
  it("counts only published opt-in or default, not demos", () => {
    assert.equal(openToTalentsVersionOf([]), null);
    assert.equal(openToTalentsVersionOf([{ to_version: 23, status: "draft", channel: "optin" }]), null);
    assert.equal(
      openToTalentsVersionOf([
        { to_version: 22, status: "published", channel: "optin" },
        { to_version: 23, status: "draft", channel: "demos" },
        { to_version: 24, status: "published", channel: "demos" },
        { to_version: 20, status: "published", channel: "default" },
      ]),
      22,
    );
    assert.equal(
      openToTalentsVersionOf([
        { to_version: 14, status: "published", channel: "default" },
        { to_version: 23, status: "published", channel: "optin" },
      ]),
      23,
    );
    assert.equal(releasedVersionOf([{ to_version: 5, status: "published", channel: "optin" }]), 5);
  });
});

describe("talentSyncSummaryFacts", () => {
  it("summarizes counts and lists without dumping raw JSON", () => {
    const quiet = talentSyncSummaryFacts({
      created: 0,
      updated: 0,
      unchanged: 4,
      heldBack: [],
      skippedAuthored: [],
      authoredPending: [],
      authoredConflict: [],
    });
    assert.equal(quiet.quiet, true);
    assert.equal(quiet.unchanged, 4);

    const busy = talentSyncSummaryFacts({
      created: 1,
      updated: 2,
      unchanged: 3,
      heldBack: ["maison-v2@15"],
      skippedAuthored: [{ kind: "design", slug: "folio-qa" }],
      authoredPending: [{ slug: "folio", version: 12 }],
      authoredConflict: [{ slug: "gridline", version: 3 }],
    });
    assert.equal(busy.quiet, false);
    assert.deepEqual(busy.heldBack, ["maison-v2@15"]);
    assert.deepEqual(busy.skippedAuthored, ["folio-qa"]);
    assert.deepEqual(busy.authoredPending, ["folio v12"]);
    assert.deepEqual(busy.authoredConflict, ["gridline v3"]);
  });
});
