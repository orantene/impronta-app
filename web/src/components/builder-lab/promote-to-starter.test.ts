import assert from "node:assert/strict";
import test from "node:test";

import {
  planPromoteToStarter,
  coerceStarterTarget,
  promoteBlockMessage,
} from "./promote-to-starter";
import type {
  BuilderTemplateRow,
  BuilderTemplateKind,
  BuilderTemplateStatus,
  BuilderTemplateTarget,
  BuilderGalleryTab,
} from "@/lib/site-admin/builder-core/templates/registry-rows";

function row(over: {
  kind?: BuilderTemplateKind;
  status?: BuilderTemplateStatus;
  gallery_tab?: BuilderGalleryTab;
  target_context?: BuilderTemplateTarget;
}): Pick<
  BuilderTemplateRow,
  "kind" | "status" | "gallery_tab" | "target_context"
> {
  return {
    kind: over.kind ?? "page_template",
    status: over.status ?? "draft",
    gallery_tab: over.gallery_tab ?? "page_templates",
    target_context: over.target_context ?? "talent",
  };
}

test("coerceStarterTarget keeps real targets, coerces platform → both", () => {
  assert.equal(coerceStarterTarget("talent"), "talent");
  assert.equal(coerceStarterTarget("workspace"), "workspace");
  assert.equal(coerceStarterTarget("both"), "both");
  assert.equal(coerceStarterTarget("platform"), "both");
});

test("a tagged page-template draft is promotable with no patch needed", () => {
  const plan = planPromoteToStarter(
    row({ gallery_tab: "page_templates", target_context: "talent" }),
  );
  assert.equal(plan.promotable, true);
  assert.equal(plan.patch, null);
  assert.equal(plan.resolvedGalleryTab, "page_templates");
  assert.equal(plan.resolvedTarget, "talent");
});

test("a mis-tagged gallery_tab is patched to page_templates", () => {
  const plan = planPromoteToStarter(
    row({ gallery_tab: "sections", target_context: "workspace" }),
  );
  assert.equal(plan.promotable, true);
  assert.ok(plan.patch);
  assert.equal(plan.patch?.gallery_tab, "page_templates");
  // target already valid → not included in the minimal patch
  assert.equal(plan.patch?.target_context, undefined);
});

test("a platform target_context is coerced to both in the patch", () => {
  const plan = planPromoteToStarter(
    row({ gallery_tab: "page_templates", target_context: "platform" }),
  );
  assert.equal(plan.promotable, true);
  assert.ok(plan.patch);
  assert.equal(plan.patch?.target_context, "both");
  assert.equal(plan.patch?.gallery_tab, undefined);
  assert.equal(plan.resolvedTarget, "both");
});

test("both gallery_tab and target patched when both are wrong", () => {
  const plan = planPromoteToStarter(
    row({ gallery_tab: "shell", target_context: "platform" }),
  );
  assert.equal(plan.promotable, true);
  assert.equal(plan.patch?.gallery_tab, "page_templates");
  assert.equal(plan.patch?.target_context, "both");
});

test("a shell draft is NOT promotable to a starter", () => {
  const header = planPromoteToStarter(row({ kind: "shell_header" }));
  assert.equal(header.promotable, false);
  assert.equal(header.blockedReason, "not-page-template");
  assert.equal(header.patch, null);

  const footer = planPromoteToStarter(row({ kind: "shell_footer" }));
  assert.equal(footer.promotable, false);
  assert.equal(footer.blockedReason, "not-page-template");
});

test("an archived draft is NOT promotable", () => {
  const plan = planPromoteToStarter(row({ status: "archived" }));
  assert.equal(plan.promotable, false);
  assert.equal(plan.blockedReason, "archived");
  assert.equal(plan.patch, null);
});

test("an already-published page template is still promotable (re-publish bumps version)", () => {
  const plan = planPromoteToStarter(
    row({ status: "published", gallery_tab: "page_templates" }),
  );
  assert.equal(plan.promotable, true);
});

test("a draft / in_review page template is promotable", () => {
  assert.equal(planPromoteToStarter(row({ status: "draft" })).promotable, true);
  assert.equal(
    planPromoteToStarter(row({ status: "in_review" })).promotable,
    true,
  );
});

test("promoteBlockMessage returns operator-readable copy per reason", () => {
  assert.match(promoteBlockMessage("not-page-template"), /full-page drafts/i);
  assert.match(promoteBlockMessage("archived"), /archived/i);
  assert.match(
    promoteBlockMessage("already-published-current"),
    /already published/i,
  );
});
