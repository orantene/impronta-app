/**
 * THEME CORE P1: the stale-draft classifier (stale, fresh, qa-empty, no-diff,
 * behind, copy-only), the first-publish dry-run summary for a design with real
 * sites and no release row (over the real planPublish), and en+es copy parity.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { buildFolioPayload } from "../theme-catalog/collection/designs";
import type { DesignPayload } from "../theme-catalog/types";
import { canonicalDesign, planPublish, type DesignHistoryView, type PlanPorts } from "./publish-core";
import {
  STALE_DRAFT_DAYS,
  classifyDraft,
  classifyStaleDrafts,
  isQaDesign,
  summarizeFirstPublish,
  type DesignHistoryFact,
  type StaleDraftFact,
} from "./stale-drafts";
import { STALE_DRAFTS_COPY } from "./stale-drafts-copy";
import type { ThemeDraft } from "./types";

const NOW = new Date("2026-10-08T12:00:00Z");
const BASE = canonicalDesign(buildFolioPayload());

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

function withToken(p: DesignPayload, key: string, value: string): DesignPayload {
  const n = clone(p);
  n.tokenDefaults = { ...(n.tokenDefaults ?? {}), [key]: value };
  return n;
}

function withCopy(p: DesignPayload): DesignPayload {
  const n = clone(p);
  const first = n.homeTree[0]!;
  first.props = { ...(first.props ?? {}), i18n: { es: { label: "Reservar cita" } } } as unknown as typeof first.props;
  return n;
}

const EMPTY: DesignPayload = { shellTree: [], homeTree: [] };

function draft(over: Partial<StaleDraftFact> = {}): StaleDraftFact {
  return {
    design: "folio",
    rev: 3,
    baseVersion: 23,
    updatedAt: "2026-10-02T12:00:00Z",
    payload: withToken(BASE, "type.section-title-size", "40px"),
    basePayload: BASE,
    ...over,
  };
}

function hist(over: Partial<DesignHistoryFact> = {}): DesignHistoryFact {
  return { design: "folio", latestSnapshot: 23, releaseRows: 1, latestReleased: 23, realSites: 7, demoSites: 2, ...over };
}

test("stale draft with design changes on the newest snapshot: publish-to-demos", () => {
  const r = classifyDraft(draft(), hist(), NOW);
  assert.equal(r.ageDays, 6 + 0);
  assert.equal(r.stale, false);
  const old = classifyDraft(draft({ updatedAt: "2026-09-25T12:00:00Z" }), hist(), NOW);
  assert.equal(old.stale, true);
  assert.equal(old.differs, true);
  assert.equal(old.designChanges, 1);
  assert.equal(old.action, "publish-to-demos");
  assert.equal(old.reason, "stale-with-changes");
  assert.equal(old.needsDryRun, false);
});

test("fresh draft with changes is kept", () => {
  const r = classifyDraft(draft({ updatedAt: "2026-10-08T08:00:00Z" }), hist(), NOW);
  assert.equal(r.ageDays, 0);
  assert.equal(r.action, "keep");
  assert.equal(r.reason, "fresh");
});

test("the stale window is STALE_DRAFT_DAYS and is configurable", () => {
  assert.equal(STALE_DRAFT_DAYS, 7);
  const d = draft({ updatedAt: "2026-10-05T12:00:00Z" });
  assert.equal(classifyDraft(d, hist(), NOW).action, "keep");
  assert.equal(classifyDraft(d, hist(), NOW, 3).action, "publish-to-demos");
});

test("no-diff draft: discard once stale, keep while fresh", () => {
  const same = draft({ payload: clone(BASE), updatedAt: "2026-10-01T00:00:00Z" });
  const stale = classifyDraft(same, hist(), NOW);
  assert.equal(stale.differs, false);
  assert.equal(stale.designChanges, 0);
  assert.equal(stale.action, "discard");
  assert.equal(stale.reason, "stale-no-changes");
  const fresh = classifyDraft({ ...same, updatedAt: "2026-10-08T00:00:00Z" }, hist(), NOW);
  assert.equal(fresh.action, "keep");
});

test("qa design with no content and no sites is a delete candidate", () => {
  assert.equal(isQaDesign("qa-factory-parallel-a-1004"), true);
  assert.equal(isQaDesign("folio-studio-qa"), true);
  assert.equal(isQaDesign("equal"), false);
  const empty = classifyDraft(
    draft({ design: "qa-factory-parallel-a-1004", payload: EMPTY, basePayload: EMPTY, updatedAt: "2026-10-04T00:00:00Z" }),
    hist({ design: "qa-factory-parallel-a-1004", realSites: 0, demoSites: 0, releaseRows: 0, latestReleased: null }),
    NOW,
  );
  assert.equal(empty.action, "delete-candidate");
  assert.equal(empty.reason, "qa-empty");
  // A QA design that has sites is never a delete candidate.
  const used = classifyDraft(
    draft({ design: "folio-studio-qa", payload: clone(BASE), updatedAt: "2026-10-04T00:00:00Z" }),
    hist({ design: "folio-studio-qa", realSites: 0, demoSites: 1 }),
    NOW,
  );
  assert.notEqual(used.action, "delete-candidate");
});

test("a draft behind the newest snapshot is kept (publish would be refused)", () => {
  const r = classifyDraft(draft({ baseVersion: 15, updatedAt: "2026-09-20T00:00:00Z" }), hist({ latestSnapshot: 23 }), NOW);
  assert.equal(r.action, "keep");
  assert.equal(r.reason, "behind-latest");
});

test("a missing base snapshot is kept, not published", () => {
  const r = classifyDraft(draft({ basePayload: null, updatedAt: "2026-09-20T00:00:00Z" }), hist(), NOW);
  assert.equal(r.action, "keep");
  assert.equal(r.reason, "no-base");
  assert.equal(r.designChanges, null);
});

test("copy-only drafts differ from the base but produce no design candidates: keep", () => {
  const r = classifyDraft(draft({ payload: withCopy(BASE), updatedAt: "2026-09-20T00:00:00Z" }), hist(), NOW);
  assert.equal(r.differs, true);
  assert.equal(r.designChanges, 0);
  assert.equal(r.action, "keep");
  assert.equal(r.reason, "copy-only");
});

test("a design with real sites and no release row needs the dry run first (gridline shape)", () => {
  const r = classifyDraft(
    draft({ design: "gridline", baseVersion: 1, updatedAt: "2026-10-01T00:00:00Z" }),
    hist({ design: "gridline", latestSnapshot: 1, releaseRows: 0, latestReleased: null, realSites: 8, demoSites: 0 }),
    NOW,
  );
  assert.equal(r.needsDryRun, true);
  assert.equal(r.action, "publish-to-demos");
});

test("classifyStaleDrafts sorts oldest first", () => {
  const rows = classifyStaleDrafts({
    drafts: [
      draft({ design: "mono", updatedAt: "2026-10-06T00:00:00Z" }),
      draft({ design: "folio", updatedAt: "2026-10-01T00:00:00Z" }),
    ],
    histories: [hist({ design: "mono" }), hist({ design: "folio" })],
    now: NOW,
  });
  assert.deepEqual(rows.map((r) => r.design), ["folio", "mono"]);
});

// ── First-publish dry run, over the real planPublish ────────────────────────

function planPortsFor(d: ThemeDraft, h: DesignHistoryView): PlanPorts {
  return {
    loadDraft: async () => ({ ok: true, value: d }),
    loadHistory: async () => h,
    codeClaims: () => false,
    codeHash: () => null,
  };
}

test("dry-run summary: design with 8 real sites and no release row, from planPublish", async () => {
  const next = withToken(BASE, "type.section-title-size", "40px");
  const d: ThemeDraft = {
    id: "d1",
    design: "gridline",
    baseVersion: 1,
    payload: next,
    preview: {},
    rev: 1,
    status: "open",
    publishedVersion: null,
    releaseId: null,
    updatedAt: "2026-10-01T00:00:00Z",
  };
  const h: DesignHistoryView = {
    title: "Gridline",
    catalog: { version: 1, payload: BASE },
    snapshots: [{ version: 1, payload: BASE }],
    releaseToVersions: [],
  };
  const plan = await planPublish(planPortsFor(d, h), { design: "gridline", expectedRev: null });
  assert.ok(plan.ok, JSON.stringify(plan));
  const s = summarizeFirstPublish({
    design: "gridline",
    releaseRows: 0,
    realSitesByVersion: [{ version: 1, sites: 8 }],
    snapshotVersions: [1],
    items: plan.value.items,
    contentOnly: plan.value.contentOnly,
  });
  assert.equal(s.applies, true);
  assert.equal(s.realSites, 8);
  assert.equal(s.itemCount, 1);
  assert.deepEqual(s.items, [{ type: "token-default", key: "type.section-title-size" }]);
  assert.deepEqual(s.pinsWithoutSnapshot, []);
});

test("dry-run summary: a pin with no snapshot is flagged, and a design with a release row does not apply", () => {
  const s = summarizeFirstPublish({
    design: "solace",
    releaseRows: 0,
    realSitesByVersion: [
      { version: 1, sites: 2 },
      { version: null, sites: 1 },
    ],
    snapshotVersions: [14, 15],
    items: [],
    contentOnly: ["a"],
  });
  assert.equal(s.applies, true);
  assert.deepEqual(s.pinsWithoutSnapshot, [0, 1]);
  assert.equal(s.itemCount, 0);
  const released = summarizeFirstPublish({
    design: "folio",
    releaseRows: 2,
    realSitesByVersion: [{ version: 23, sites: 7 }],
    snapshotVersions: [23],
    items: [],
    contentOnly: [],
  });
  assert.equal(released.applies, false);
});

// ── Copy ────────────────────────────────────────────────────────────────────

test("en and es copy: same shape, every action and reason labelled, no em dashes", () => {
  const { en, es } = STALE_DRAFTS_COPY;
  assert.deepEqual(Object.keys(en).sort(), Object.keys(es).sort());
  for (const lang of [en, es]) {
    for (const k of ["publish-to-demos", "discard", "delete-candidate", "keep"] as const) assert.ok(lang.action[k].length > 0);
    for (const k of ["stale-with-changes", "stale-no-changes", "fresh", "qa-empty", "behind-latest", "copy-only", "no-base"] as const) {
      assert.ok(lang.reason[k].length > 0);
    }
    const strings = [
      lang.title, lang.lead, lang.empty, lang.dryRunBanner("gridline", 8), lang.dryRunNotOpened, lang.confirmPublish("x"),
      lang.confirmDiscard("x"), lang.published("x", 2, 1), lang.dryRunItems(2), lang.age(3),
    ];
    for (const s of strings) assert.ok(!s.includes("—"), s);
  }
  assert.notEqual(en.title, es.title);
  assert.notEqual(en.dryRunBanner("gridline", 8), es.dryRunBanner("gridline", 8));
});

// ── Action wiring (static) ──────────────────────────────────────────────────

test("discard action: platform-admin gate, impersonation guard, draft_rev passed to the writer", () => {
  const src = readFileSync(
    join(process.cwd(), "src/app/(workspace)/platform/admin/builder-lab/talent-designs/publish-actions.ts"),
    "utf8",
  );
  const body = src.slice(src.indexOf("export async function actionDiscardDesignDraft"));
  assert.match(body, /requireNotImpersonating\(\)/);
  assert.match(body, /withAdmin\(/);
  assert.match(body, /discardThemeDraft\(admin, slug, userId, rev\)/);
  const writer = readFileSync(join(process.cwd(), "src/lib/talent-site/theme-template/drafts.server.ts"), "utf8");
  assert.match(writer, /expectedRev !== undefined\) q = q\.eq\("rev", expectedRev\)/);
});
