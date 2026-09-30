import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { websiteFlowCopy, websiteFlowState, websiteSetupStep } from "./website-flow";
import {
  appliedThemeLabel,
  appliedThemeLine,
} from "../talent-site/theme-catalog/applied-theme-label";

describe("websiteFlowState (one state for pill, Today, My presence)", () => {
  it("under 100% is notReady even with a provisioned draft row", () => {
    assert.equal(websiteFlowState({ percent: 94, isPublished: false, themeDesignSlug: null }), "notReady");
  });
  it("F23: 100% + a provisioned draft row but no design is READY", () => {
    const st = websiteFlowState({ percent: 100, isPublished: false, themeDesignSlug: null });
    assert.equal(st, "ready");
    assert.equal(websiteSetupStep(st), "gallery");
  });
  it("F23: a design applied (not published) is PREVIEW and resumes at review", () => {
    const st = websiteFlowState({ percent: 100, isPublished: false, themeDesignSlug: "maison-v2" });
    assert.equal(st, "preview");
    assert.equal(websiteSetupStep(st), "review");
  });
  it("published always wins", () => {
    assert.equal(websiteFlowState({ percent: 50, isPublished: true, themeDesignSlug: null }), "published");
  });
});

describe("websiteFlowCopy (mockup REWARD / tc_new_ready / mz_unlocked)", () => {
  it("ready: pill Activate, Today 'Your free website is ready · Create my website'", () => {
    const en = websiteFlowCopy("ready", 100, false);
    assert.equal(en.pillLead, "✓ Profile complete");
    assert.equal(en.pillAction, "Activate your website");
    assert.equal(en.todayTitle, "Your free website is ready");
    assert.equal(en.todayCta, "Create my website");
    assert.equal(en.cta, "Activate your free website");
    const es = websiteFlowCopy("ready", 100, true);
    assert.equal(es.pillAction, "Activa tu sitio");
    assert.equal(es.todayCta, "Crear mi sitio");
  });
  it("preview: Preview & publish everywhere, naming the applied design", () => {
    const en = websiteFlowCopy("preview", 100, false, "Maison v2");
    assert.equal(en.pillAction, "Preview & publish");
    assert.equal(en.todayCta, "Preview & publish");
    assert.equal(en.cta, "Preview & publish");
    assert.match(en.todaySub, /^Maison v2 · /);
    assert.equal(websiteFlowCopy("preview", 100, true).pillAction, "Ver y publicar");
  });
  it("never 'pick up where you left off', never an em dash", () => {
    for (const st of ["notReady", "ready", "preview", "published"] as const) {
      for (const es of [false, true]) {
        for (const t of Object.values(websiteFlowCopy(st, 50, es, "Maison"))) {
          assert.doesNotMatch(String(t), /left off|dejaste|—/);
        }
      }
    }
  });
});

describe("appliedThemeLabel (one resolver for design + look names)", () => {
  it("F23: maison-v2 with no look names only the design, never a default palette", () => {
    const label = appliedThemeLabel("maison-v2", null);
    assert.ok(label);
    assert.equal(label.look, null);
    assert.doesNotMatch(appliedThemeLine(label), /Pink/);
    assert.doesNotMatch(label.design, /^Maison$/);
  });
  it("maison look slugs resolve through the maison- prefix", () => {
    const label = appliedThemeLabel("maison", "maison-lilac");
    assert.ok(label?.look);
    assert.equal(appliedThemeLine(label), `${label.design} · ${label.look}`);
  });
  it("no design is null; unknown design falls back to a title-cased slug", () => {
    assert.equal(appliedThemeLabel(null, null), null);
    assert.equal(appliedThemeLabel("some-new-design", "x")?.design, "Some New Design");
  });
});
