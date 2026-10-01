/**
 * Template Factory: colour edits in the design editor ship as PALETTE edits
 * (`DesignPayload.palettes`). Draft routing, publish items + EN/ES notes,
 * merge into sites on that palette (custom colours kept), overlay round trip,
 * and the canvas showing the edited palette.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { buildFolioPayload } from "../theme-catalog/collection/designs";
import { applyAuthoredOverlay, canonicalOverlayPayload, diffToOverlay, overlayPaletteOverrides } from "../theme-catalog/collection/authored/overlay";
import {
  designPaletteTokens,
  diffDesignPalettes,
  editorPaletteKey,
  paletteKeyForLook,
} from "../theme-catalog/design-palettes";
import { galleryPaletteLookTokens } from "../theme-catalog/gallery-meta";
import type { DesignPayload } from "../theme-catalog/types";
import { validateDesign } from "../theme-catalog/validate";
import { mergeDesignUpdate } from "../theme-releases/merge";
import { reverseTokenEntries } from "../theme-releases/tokens-merge";
import { applyTokenSplit, minimizePaletteEdits, splitTokenPatch } from "./drafts-pure";
import { canonicalDesign, planPublish, type DesignHistoryView, type PublishPorts } from "./publish-core";
import { themeTemplateCanvasTokens, themeTemplateDrawerTokens } from "./theme-template-tokens";
import type { ThemeDraft } from "./types";

const BASE = canonicalDesign(buildFolioPayload());
const STONE_BG = galleryPaletteLookTokens("folio", "stone")!["color.background"]!;
const NEW_BG = "#E0D6C8";

function draft(payload: DesignPayload, over: Partial<ThemeDraft> = {}): ThemeDraft {
  return {
    id: "draft-1",
    design: "folio",
    baseVersion: 17,
    payload,
    preview: {},
    rev: 4,
    status: "open",
    publishedVersion: null,
    releaseId: null,
    updatedAt: "2026-10-01T00:00:00Z",
    ...over,
  };
}

function edited(look: string | null, patch: Record<string, string | null>, from: ThemeDraft = draft(BASE)): ThemeDraft {
  const split = splitTokenPatch(patch, editorPaletteKey("folio", look));
  assert.deepEqual(split.invalid, []);
  const next = applyTokenSplit(from.payload, from.preview, split);
  return { ...from, payload: next.payload, preview: next.preview };
}

const history: DesignHistoryView = {
  title: "Folio",
  catalog: { version: 17, payload: BASE },
  snapshots: [{ version: 17, payload: BASE }],
  releaseToVersions: [17],
};

function ports(d: ThemeDraft): PublishPorts {
  return {
    loadDraft: async () => ({ ok: true, value: d }),
    loadHistory: async () => history,
    codeClaims: () => false,
    codeHash: () => "code-hash",
    rpc: async () => ({ data: null, error: null }),
  };
}

test("look slugs resolve to the design's palette keys", () => {
  assert.equal(paletteKeyForLook("folio", "stone"), "stone");
  assert.equal(paletteKeyForLook("folio", "folio-dark"), "dark");
  assert.equal(paletteKeyForLook("folio", "nope"), null);
  assert.equal(editorPaletteKey("folio", null), "stone");
});

test("a colour edit is saved on the edited palette, not as a preview token", () => {
  const d = edited("dark", { "color.background": NEW_BG, "typography.body-font-family": "Archivo, sans-serif" });
  assert.deepEqual(d.payload.palettes, { dark: { "color.background": NEW_BG } });
  assert.equal(d.preview.previewTokens?.["color.background"], undefined);
  // Non-colour look keys stay preview-only.
  assert.equal(d.preview.previewTokens?.["typography.body-font-family"], "Archivo, sans-serif");
  assert.equal(d.payload.tokenDefaults, BASE.tokenDefaults);
  assert.ok(validateDesign(d.payload).ok);
  // Clearing the override removes the palette entry.
  const cleared = edited("dark", { "color.background": null }, d);
  assert.equal(cleared.payload.palettes, undefined);
  // An invalid colour is refused.
  assert.deepEqual(splitTokenPatch({ "color.ink": "red; x" }, "stone").invalid, ["color.ink"]);
});

test("publish preview carries one token-default item per palette colour with EN/ES notes", async () => {
  const d = edited("stone", { "color.background": NEW_BG });
  const plan = await planPublish(ports(d), { design: "folio", expectedRev: null });
  assert.ok(plan.ok, plan.ok ? "" : plan.error);
  if (!plan.ok) return;
  assert.equal(plan.value.nextVersion, 18);
  assert.deepEqual(plan.value.payload.palettes, { stone: { "color.background": NEW_BG } });
  const items = plan.value.items.filter((i) => i.key === "palette:stone:color.background");
  assert.equal(items.length, 1);
  assert.equal(items[0]!.type, "token-default");
  assert.equal(items[0]!.detail?.from, STONE_BG);
  assert.equal(items[0]!.detail?.to, NEW_BG);
  assert.match(items[0]!.note?.en ?? "", /Default stone colours: page background is now #E0D6C8/);
  assert.match(items[0]!.note?.es ?? "", /Colores Piedra: fondo de página ahora es #E0D6C8/);
  assert.ok(plan.value.notes.en && plan.value.notes.es, "release notes in EN and ES");
});

test("diff reverting an override back to code reads as a change to the code colour", () => {
  const out = diffDesignPalettes("folio", { stone: { "color.background": NEW_BG } }, undefined);
  assert.deepEqual(out, [{ palette: "stone", token: "color.background", from: NEW_BG, to: STONE_BG }]);
});

function mergeFor(siteTokens: Record<string, string>, paletteKey: string) {
  const next: DesignPayload = { ...BASE, palettes: { stone: { "color.background": NEW_BG } } };
  return mergeDesignUpdate({
    base: { trees: {}, tokens: BASE.tokenDefaults ?? {} },
    ours: { trees: {}, tokens: siteTokens },
    theirs: { trees: {}, tokens: next.tokenDefaults ?? {} },
    items: [{ type: "token-default", key: "palette:stone:color.background", id: "token-default:palette:stone:color.background" }],
    palette: {
      key: paletteKey,
      base: designPaletteTokens("folio", paletteKey, BASE.palettes)!,
      theirs: designPaletteTokens("folio", paletteKey, next.palettes)!,
    },
  });
}

test("merge applies the palette edit to an untouched site on that palette", () => {
  const site = { ...galleryPaletteLookTokens("folio", "stone")!, ...(BASE.tokenDefaults ?? {}) };
  const r = mergeFor(site, "stone");
  assert.equal(r.tokens["color.background"], NEW_BG);
  assert.equal(r.report.applied.filter((e) => e.key === "palette:stone:color.background").length, 1);
  // Undo restores the old colour.
  const undo = reverseTokenEntries(r.report.applied, r.tokens);
  assert.equal(undo.tokens["color.background"], STONE_BG);
});

test("merge keeps a site's custom colour and leaves sites on other palettes alone", () => {
  const custom = { ...galleryPaletteLookTokens("folio", "stone")!, "color.background": "#123456" };
  const r = mergeFor(custom, "stone");
  assert.equal(r.tokens["color.background"], "#123456");
  assert.equal(r.report.kept.filter((e) => e.key === "palette:stone:color.background").length, 1);

  const dark = galleryPaletteLookTokens("folio", "dark")!;
  const r2 = mergeFor(dark, "dark");
  assert.equal(r2.tokens["color.background"], dark["color.background"]);
});

test("overlay round trip carries palette edits", () => {
  const authored: DesignPayload = { ...BASE, palettes: { dark: { "color.ink": "#EEEEEE" }, stone: { "color.background": NEW_BG } } };
  const raw = buildFolioPayload();
  const o = diffToOverlay(raw, authored);
  assert.deepEqual(o.palettes, { dark: { "color.ink": { to: "#EEEEEE" } }, stone: { "color.background": { to: NEW_BG } } });
  const applied = applyAuthoredOverlay(raw, o);
  assert.deepEqual(applied, canonicalOverlayPayload(authored));
  assert.deepEqual(overlayPaletteOverrides(o), { dark: { "color.ink": "#EEEEEE" }, stone: { "color.background": NEW_BG } });
  // An overlay without palettes (pre palette edits) still applies.
  const legacy = { ...o };
  delete legacy.palettes;
  assert.equal(applyAuthoredOverlay(raw, legacy).palettes, undefined);
});

test("canvas and drawer show the edited palette for the chosen look", () => {
  const d = edited("dark", { "color.background": NEW_BG });
  const look = { ...d, preview: { ...d.preview, look: "dark" } };
  assert.equal(themeTemplateCanvasTokens(look)["color.background"], NEW_BG);
  assert.equal(themeTemplateDrawerTokens(d, null, "dark")["color.background"], NEW_BG);
  // Another palette is unaffected.
  assert.equal(themeTemplateDrawerTokens(d, null, "stone")["color.background"], STONE_BG);
});

test("one-colour edit with the whole palette sent stores exactly one key", () => {
  const code = galleryPaletteLookTokens("folio", "stone")!;
  const split = splitTokenPatch({ ...code, "color.background": NEW_BG }, "stone");
  const min = minimizePaletteEdits(split, undefined, code);
  assert.deepEqual(min.palette, { "color.background": NEW_BG });
  const { payload } = applyTokenSplit(BASE, {}, min);
  assert.deepEqual(payload.palettes?.stone, { "color.background": NEW_BG });
});

test("editing back to the code value removes the override", () => {
  const code = galleryPaletteLookTokens("folio", "stone")!;
  const split = splitTokenPatch({ "color.background": code["color.background"]! }, "stone");
  const min = minimizePaletteEdits(split, { "color.background": NEW_BG }, code);
  assert.deepEqual(min.palette, { "color.background": null });
});

test("drawer shows the code muted for a prefixed look slug", () => {
  const code = galleryPaletteLookTokens("folio", "stone")!;
  const shown = themeTemplateDrawerTokens(draft(BASE), null, "folio-stone");
  assert.equal(shown["color.muted"], code["color.muted"]);
});
