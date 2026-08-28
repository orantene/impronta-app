/**
 * parity-probe.test.ts — X5 (live-gallery parity probe).
 *
 * Test runner: node:test + node:assert/strict (tsx --test)
 * Run:  node_modules/.bin/tsx --test src/lib/site-admin/add-gallery/parity-probe.test.ts
 *
 * Covers the PURE diff/reason logic (`computeParityHiddenReason`,
 * `computeParityProbe`, `summarizeParityReasons`) and the descriptor synthesis
 * (`buildParityDescriptor`). The reason taxonomy under test:
 *   overlay-hidden | target | plan | tier | rollout
 * with the live read path's evaluation PRECEDENCE pinned (overlay → target →
 * plan → tier → rollout).
 */

import test from "node:test";
import assert from "node:assert/strict";

import type { CatalogOverlayRow } from "./registry-db-merge";
import type { AddGalleryItem, GallerySurfaceDescriptor } from "./types";
import {
  computeParityHiddenReason,
  computeParityProbe,
  summarizeParityReasons,
  type ParityUniverseEntry,
} from "./parity-probe";
import {
  buildParityDescriptor,
  paritySurfaceByKey,
} from "./parity-surface-descriptors";

// ── fixtures ──────────────────────────────────────────────────────────────────

function codeItem(over: Partial<AddGalleryItem> = {}): AddGalleryItem {
  return {
    id: "el-button",
    label: "Button",
    description: "",
    tab: "blocks",
    category: "buttons",
    icon: "buttons",
    previewType: "icon-card",
    itemKind: "static",
    insertMethod: "nativeNode",
    dragSupported: true,
    availability: "available",
    sourceType: "native-freeform",
    targetContext: "both",
    ...over,
  };
}

function templateItem(over: Partial<AddGalleryItem> = {}): AddGalleryItem {
  return {
    id: "db-template:tpl-1",
    label: "Editorial hero",
    description: "",
    tab: "designs",
    dbGalleryTab: "page_templates",
    category: "heroes",
    icon: "layout",
    previewType: "icon-card",
    itemKind: "static",
    insertMethod: "dbTemplate",
    dragSupported: true,
    availability: "available",
    sourceType: "native-freeform",
    targetContext: "both",
    dbTemplateId: "tpl-1",
    requiredPlan: "free",
    requiredTalentTier: null,
    rolloutPercentage: 100,
    rolloutAllowlist: [],
    rolloutDenylist: [],
    ...over,
  };
}

function overlay(over: Partial<CatalogOverlayRow> = {}): CatalogOverlayRow {
  return {
    item_ref: "el-button",
    source: "code",
    talent_enabled: true,
    workspace_enabled: true,
    label_override: null,
    icon_override: null,
    category_override: null,
    required_plan_override: null,
    availability_override: null,
    ...over,
  };
}

function entry(over: Partial<ParityUniverseEntry> = {}): ParityUniverseEntry {
  const item = over.item ?? codeItem();
  return {
    item,
    overlay: over.overlay ?? null,
    effectiveLabel: over.effectiveLabel ?? item.label,
    status: over.status ?? "published",
  };
}

const talentProfile = buildParityDescriptor({
  surface: "talent_profile",
  plan: "agency",
  tier: "talent_portfolio",
  tenantId: null,
});
const workspacePage = buildParityDescriptor({
  surface: "workspace_page",
  plan: "agency",
  tier: "talent_portfolio",
  tenantId: null,
});

// ── reason: null (full parity) ────────────────────────────────────────────────

test("a plain code item on an allowing surface is NOT hidden (null reason)", () => {
  assert.equal(computeParityHiddenReason(entry(), talentProfile), null);
});

test("a published, fully-rolled template under a sufficient plan is NOT hidden", () => {
  assert.equal(
    computeParityHiddenReason(entry({ item: templateItem() }), talentProfile),
    null,
  );
});

// ── reason: overlay-hidden ────────────────────────────────────────────────────

test("availability_override 'hidden' ⇒ overlay-hidden (any surface)", () => {
  const e = entry({ overlay: overlay({ availability_override: "hidden" }) });
  assert.equal(computeParityHiddenReason(e, talentProfile), "overlay-hidden");
  assert.equal(computeParityHiddenReason(e, workspacePage), "overlay-hidden");
});

test("talent_enabled=false hides on a TALENT surface only", () => {
  const e = entry({ overlay: overlay({ talent_enabled: false }) });
  assert.equal(computeParityHiddenReason(e, talentProfile), "overlay-hidden");
  // workspace surface reads workspace_enabled (still true) ⇒ not overlay-hidden
  assert.equal(computeParityHiddenReason(e, workspacePage), null);
});

test("workspace_enabled=false hides on a WORKSPACE surface only", () => {
  const e = entry({ overlay: overlay({ workspace_enabled: false }) });
  assert.equal(computeParityHiddenReason(e, workspacePage), "overlay-hidden");
  assert.equal(computeParityHiddenReason(e, talentProfile), null);
});

test("SURPRISE: workspace_enabled=false also hides the TALENT SHELL (workspace-targeted)", () => {
  const talentShell = buildParityDescriptor({
    surface: "talent_shell",
    plan: "agency",
    tier: "talent_portfolio",
    tenantId: null,
  });
  // talent shell carries surfaceTarget 'workspace', so it rides workspace_enabled.
  // Use a section item (the shell tab doesn't allow `elements`/page_templates default).
  const e = entry({
    item: codeItem({ tab: "designs" }),
    overlay: overlay({ workspace_enabled: false }),
  });
  assert.equal(computeParityHiddenReason(e, talentShell), "overlay-hidden");
});

// ── reason: target ────────────────────────────────────────────────────────────

test("a tab not in the surface's allowedTabs ⇒ target", () => {
  // shell tab is not allowed on talent_profile
  const e = entry({ item: codeItem({ tab: "shell" }) });
  assert.equal(computeParityHiddenReason(e, talentProfile), "target");
});

test("target_context mismatch ⇒ target (talent-only row on a workspace surface)", () => {
  const e = entry({ item: templateItem({ targetContext: "talent" }) });
  assert.equal(computeParityHiddenReason(e, workspacePage), "target");
  // and it IS visible on the talent profile
  assert.equal(computeParityHiddenReason(e, talentProfile), null);
});

test("a DB template on a surface with allowDbTemplates=false ⇒ target", () => {
  const noDb: GallerySurfaceDescriptor = { ...talentProfile, allowDbTemplates: false };
  const e = entry({ item: templateItem() });
  assert.equal(computeParityHiddenReason(e, noDb), "target");
});

// ── reason: plan ──────────────────────────────────────────────────────────────

test("required_plan above the surface plan ⇒ plan", () => {
  const free = buildParityDescriptor({
    surface: "talent_profile",
    plan: "free",
    tier: "talent_portfolio",
    tenantId: null,
  });
  const e = entry({ item: templateItem({ requiredPlan: "agency" }) });
  assert.equal(computeParityHiddenReason(e, free), "plan");
});

test("overlay required_plan_override tightens ⇒ plan", () => {
  const studio = buildParityDescriptor({
    surface: "talent_profile",
    plan: "studio",
    tier: "talent_portfolio",
    tenantId: null,
  });
  const e = entry({
    item: templateItem({ requiredPlan: "free" }),
    overlay: overlay({ item_ref: "db-template:tpl-1", source: "template", required_plan_override: "agency" }),
  });
  assert.equal(computeParityHiddenReason(e, studio), "plan");
});

// ── reason: tier ──────────────────────────────────────────────────────────────

test("required_talent_tier above the surface tier ⇒ tier", () => {
  const basic = buildParityDescriptor({
    surface: "talent_profile",
    plan: "agency",
    tier: "talent_basic",
    tenantId: null,
  });
  const e = entry({ item: templateItem({ requiredTalentTier: "talent_portfolio" }) });
  assert.equal(computeParityHiddenReason(e, basic), "tier");
});

test("a tier-gated template is hidden on a workspace surface (no tier) ⇒ tier", () => {
  // workspace surfaces supply no talentTier, so any tier requirement fails there.
  const e = entry({ item: templateItem({ requiredTalentTier: "talent_pro" }) });
  assert.equal(computeParityHiddenReason(e, workspacePage), "tier");
});

// ── reason: rollout ───────────────────────────────────────────────────────────

test("a denylisted tenant ⇒ rollout", () => {
  const withTenant = buildParityDescriptor({
    surface: "talent_profile",
    plan: "agency",
    tier: "talent_portfolio",
    tenantId: "tenant-xyz",
  });
  const e = entry({
    item: templateItem({ rolloutDenylist: ["tenant-xyz"] }),
  });
  assert.equal(computeParityHiddenReason(e, withTenant), "rollout");
});

test("0% rollout hides every tenant ⇒ rollout (but null tenant always passes)", () => {
  const withTenant = buildParityDescriptor({
    surface: "talent_profile",
    plan: "agency",
    tier: "talent_portfolio",
    tenantId: "tenant-abc",
  });
  const e = entry({ item: templateItem({ rolloutPercentage: 0 }) });
  assert.equal(computeParityHiddenReason(e, withTenant), "rollout");
  // null tenant context (platform / Lab) ⇒ never hidden by rollout
  assert.equal(computeParityHiddenReason(e, talentProfile), null);
});

// ── precedence ────────────────────────────────────────────────────────────────

test("overlay-hidden wins over a co-occurring plan gate", () => {
  const free = buildParityDescriptor({
    surface: "talent_profile",
    plan: "free",
    tier: "talent_portfolio",
    tenantId: null,
  });
  const e = entry({
    item: templateItem({ requiredPlan: "agency" }), // would be `plan`
    overlay: overlay({
      item_ref: "db-template:tpl-1",
      source: "template",
      availability_override: "hidden",
    }),
  });
  assert.equal(computeParityHiddenReason(e, free), "overlay-hidden");
});

test("target wins over plan (tab excluded AND plan too low → target reported)", () => {
  const free = buildParityDescriptor({
    surface: "talent_profile",
    plan: "free",
    tier: "talent_portfolio",
    tenantId: null,
  });
  const e = entry({ item: templateItem({ tab: "shell", requiredPlan: "agency" }) });
  assert.equal(computeParityHiddenReason(e, free), "target");
});

test("plan wins over tier and rollout", () => {
  const free = buildParityDescriptor({
    surface: "talent_profile",
    plan: "free",
    tier: "talent_basic",
    tenantId: "tenant-deny",
  });
  const e = entry({
    item: templateItem({
      requiredPlan: "agency",
      requiredTalentTier: "talent_portfolio",
      rolloutDenylist: ["tenant-deny"],
    }),
  });
  assert.equal(computeParityHiddenReason(e, free), "plan");
});

// ── computeParityProbe + summary ──────────────────────────────────────────────

test("computeParityProbe returns only hidden rows with reasons + correct shape", () => {
  const universe: ParityUniverseEntry[] = [
    entry({ item: codeItem({ id: "visible-1" }) }), // visible → excluded
    entry({
      item: codeItem({
        id: "hidden-plan",
        tab: "designs",
        insertMethod: "dbTemplate",
        requiredPlan: "network",
        dbTemplateId: "t2",
        dbGalleryTab: "page_templates",
      }),
      effectiveLabel: "Network template",
    }),
    entry({
      item: codeItem({ id: "hidden-overlay" }),
      overlay: overlay({ item_ref: "hidden-overlay", availability_override: "hidden" }),
    }),
  ];
  const free = buildParityDescriptor({
    surface: "talent_profile",
    plan: "free",
    tier: "talent_portfolio",
    tenantId: null,
  });
  const rows = computeParityProbe(universe, free);
  assert.equal(rows.length, 2);
  const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
  assert.equal(byId["hidden-plan"].reason, "plan");
  assert.equal(byId["hidden-plan"].source, "template");
  assert.equal(byId["hidden-plan"].label, "Network template");
  assert.equal(byId["hidden-overlay"].reason, "overlay-hidden");
  assert.equal(byId["hidden-overlay"].source, "code");
  assert.ok(byId["hidden-plan"].detail.length > 0, "detail explanation present");
});

test("summarizeParityReasons tallies by reason", () => {
  const universe: ParityUniverseEntry[] = [
    entry({ item: templateItem({ id: "db-template:a", dbTemplateId: "a", requiredPlan: "network" }) }),
    entry({ item: templateItem({ id: "db-template:b", dbTemplateId: "b", requiredPlan: "network" }) }),
    entry({
      item: codeItem({ id: "c" }),
      overlay: overlay({ item_ref: "c", availability_override: "hidden" }),
    }),
  ];
  const free = buildParityDescriptor({
    surface: "talent_profile",
    plan: "free",
    tier: "talent_portfolio",
    tenantId: null,
  });
  const summary = summarizeParityReasons(computeParityProbe(universe, free));
  assert.equal(summary.plan, 2);
  assert.equal(summary["overlay-hidden"], 1);
  assert.equal(summary.target, 0);
  assert.equal(summary.tier, 0);
  assert.equal(summary.rollout, 0);
});

// ── descriptor synthesis (parity with the live config factories) ──────────────

test("buildParityDescriptor pins each surface's shape to the live factories", () => {
  const tp = buildParityDescriptor({ surface: "talent_profile", plan: "studio", tier: "talent_pro", tenantId: "x" });
  assert.equal(tp.surfaceTarget, "talent");
  assert.equal(tp.allowDbTemplates, true);
  assert.equal(tp.talentTier, "talent_pro", "talent profile carries the tier");
  assert.ok(tp.allowedTabs.includes("page_templates"));

  const ts = buildParityDescriptor({ surface: "talent_shell", plan: "studio", tier: "talent_pro", tenantId: "x" });
  assert.equal(ts.surfaceTarget, "workspace", "talent SHELL is workspace-targeted (the surprise)");
  assert.equal(ts.talentTier, null, "shell surfaces carry no tier");
  assert.ok(ts.allowedTabs.includes("shell"));
  assert.ok(!ts.allowedTabs.includes("page_templates"));

  const wp = buildParityDescriptor({ surface: "workspace_page", plan: "studio", tier: "talent_pro", tenantId: "x" });
  assert.equal(wp.surfaceTarget, "workspace");
  assert.equal(wp.talentTier, null);

  const ws = buildParityDescriptor({ surface: "workspace_shell", plan: "studio", tier: "talent_pro", tenantId: "x" });
  assert.equal(ws.surfaceTarget, "workspace");
  assert.ok(ws.allowedTabs.includes("shell"));
});

test("paritySurfaceByKey throws on an unknown key", () => {
  // @ts-expect-error — intentionally invalid key
  assert.throws(() => paritySurfaceByKey("nope"));
});
