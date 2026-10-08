import test from "node:test";
import assert from "node:assert/strict";

import { buildMaisonV2Payload } from "./collection/maison-v2";
import type { DesignPayload } from "./types";
import {
  applyMaisonCtaSeedPatch,
  BOOK_LABEL,
  patchMaisonCtaTrees,
  type CtaNode,
} from "./code-seed-cta";
import {
  factoryNeedsCodeSeedReview,
  findPayloadByCodeHash,
  openDraftDiffersFromBase,
  planCodeSeedReviewDraft,
  rebaseAuthoredOntoCodeSeed,
  recoverBaseCodeFromOverlay,
} from "./code-seed-review";
import { canonicalOverlayPayload, diffToOverlay } from "./collection/authored/overlay";

type Rec = Record<string, unknown>;
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const props = (n: CtaNode): Rec => (n.props ?? {}) as Rec;

function find(nodes: CtaNode[], pred: (n: CtaNode) => boolean): CtaNode | null {
  for (const n of nodes) {
    if (pred(n)) return n;
    const hit = find(n.children ?? [], pred);
    if (hit) return hit;
  }
  return null;
}

/** Pre-#88 Maison shape: See services + See work, header "Menu and prices". */
function oldAuthored(): DesignPayload {
  const p = clone(buildMaisonV2Payload());
  const row = find((p.homeTree ?? []) as CtaNode[], (n) => props(n).layerLabel === "Hero actions")!;
  const [a, b] = row.children!;
  a!.props = {
    ...props(a!),
    label: "See services",
    layerLabel: "See services",
    i18n: { es: { label: "Ver servicios" }, en: { label: "See services" } },
  };
  b!.props = {
    ...props(b!),
    label: "See work",
    href: "#gallery",
    layerLabel: "See work",
    i18n: { es: { label: "Ver trabajos" }, en: { label: "See work" } },
  };
  const header = ((p.shellTree ?? []) as CtaNode[]).find((n) => props(n).sectionTypeKey === "site_header")!;
  const sp = props(header).sectionProps as Rec;
  (sp.primaryCta as Rec).label = "Menu and prices";
  const right = (sp.regions as { right: Rec[] }).right;
  right.find((i) => i.type === "cta")!.label = "Menu and prices";
  return p;
}

test("factoryNeedsCodeSeedReview: maison authored pending offers review; reflected does not", () => {
  assert.equal(
    factoryNeedsCodeSeedReview({
      slug: "maison-v2",
      codeDiffers: true,
      latestSource: "authored",
      latestMetaCodeHash: "old",
      codeHash: "new",
      overlayVersion: 0,
      latestVersion: 10,
    }),
    true,
  );
  assert.equal(
    factoryNeedsCodeSeedReview({
      slug: "maison-v2",
      codeDiffers: true,
      latestSource: "authored",
      latestMetaCodeHash: "new",
      codeHash: "new",
      overlayVersion: 10,
      latestVersion: 10,
    }),
    false,
  );
  assert.equal(
    factoryNeedsCodeSeedReview({
      slug: "folio",
      codeDiffers: true,
      latestSource: "authored",
      latestMetaCodeHash: "old",
      codeHash: "new",
      overlayVersion: 0,
      latestVersion: 3,
    }),
    true,
    "non-maison conflict still offers review (rebase path)",
  );
  assert.equal(
    factoryNeedsCodeSeedReview({
      slug: "folio",
      codeDiffers: true,
      latestSource: "authored",
      latestMetaCodeHash: "new",
      codeHash: "new",
      overlayVersion: 0,
      latestVersion: 3,
    }),
    false,
    "non-maison without conflict and without seed patch does not offer review",
  );
});

test("planCodeSeedReviewDraft: Maison CTA seed patch when baseCode is missing", () => {
  const authored = oldAuthored();
  const newCode = buildMaisonV2Payload();
  const plan = planCodeSeedReviewDraft({
    newCode,
    authored,
    baseCode: null,
    seedPatch: (a, c) => applyMaisonCtaSeedPatch(a, c),
  });
  assert.equal(plan.ok, true);
  if (!plan.ok) return;
  assert.equal(plan.kind, "maison_cta");
  const row = find((plan.payload.homeTree ?? []) as CtaNode[], (n) => props(n).layerLabel === "Hero actions")!;
  assert.equal(props(row.children![0]!).label, BOOK_LABEL);
});

test("planCodeSeedReviewDraft: rebase succeeds with a single outcome (token overlay)", () => {
  const baseCode = oldAuthored();
  const authored = clone(baseCode);
  authored.tokenDefaults = { ...(authored.tokenDefaults ?? {}), "--test-token": "1" };
  const newCode = buildMaisonV2Payload();
  const plan = planCodeSeedReviewDraft({
    newCode,
    authored,
    baseCode,
    // No seedPatch: must be rebase, not fall-through.
  });
  assert.equal(plan.ok, true);
  if (!plan.ok) return;
  assert.equal(plan.kind, "rebase");
  assert.equal(plan.payload.tokenDefaults?.["--test-token"], "1");
});

test("planCodeSeedReviewDraft: collision without seedPatch refuses; with seedPatch falls through", () => {
  // Overlay removes a token that is absent from newCode → applyAuthoredOverlay collides.
  const authored = oldAuthored();
  const baseCode = clone(authored);
  baseCode.tokenDefaults = { ...(baseCode.tokenDefaults ?? {}), "--ghost": "1" };
  const newCode = buildMaisonV2Payload();

  const refused = planCodeSeedReviewDraft({ newCode, authored, baseCode });
  assert.equal(refused.ok, false);
  if (refused.ok) return;
  assert.equal(refused.code, "collision");

  const fell = planCodeSeedReviewDraft({
    newCode,
    authored,
    baseCode,
    seedPatch: (a, c) => applyMaisonCtaSeedPatch(a, c),
  });
  assert.equal(fell.ok, true);
  if (!fell.ok) return;
  assert.equal(fell.kind, "maison_cta");
  const hero = find((fell.payload.homeTree ?? []) as CtaNode[], (n) => props(n).layerLabel === "Hero actions")!;
  assert.equal(props(hero.children![0]!).label, BOOK_LABEL);
});
test("openDraftDiffersFromBase: ignores designKey; catches real edits", () => {
  const base = oldAuthored();
  const stamped = clone(base);
  const n0 = stamped.homeTree![0] as CtaNode;
  n0.props = { ...props(n0), designKey: "draft-stamp" };
  assert.equal(openDraftDiffersFromBase(stamped, base), false);
  const edited = clone(base);
  edited.tokenDefaults = { ...(edited.tokenDefaults ?? {}), a: "1" };
  assert.equal(openDraftDiffersFromBase(edited, base), true);
});

test("recoverBaseCodeFromOverlay: round-trips a token-only overlay (Folio-style)", () => {
  const baseCode = oldAuthored();
  const authored = clone(baseCode);
  authored.tokenDefaults = { ...(authored.tokenDefaults ?? {}), "--x": "y" };
  const overlay = diffToOverlay(baseCode, authored);
  const donor = clone(baseCode);
  donor.tokenDefaults = { ...(donor.tokenDefaults ?? {}), "--seed": "1" };
  const recovered = recoverBaseCodeFromOverlay({ authored, overlay, newCode: donor });
  assert.ok(recovered);
  assert.deepEqual(canonicalOverlayPayload(recovered!), canonicalOverlayPayload(baseCode));
  assert.equal(recovered!.tokenDefaults?.["--x"], undefined);
});

test("rebaseAuthoredOntoCodeSeed: replays overlay onto new seed", () => {
  const baseCode = oldAuthored();
  const authored = clone(baseCode);
  authored.tokenDefaults = { ...(authored.tokenDefaults ?? {}), "--x": "y" };
  const newCode = clone(baseCode);
  newCode.tokenDefaults = { ...(newCode.tokenDefaults ?? {}), "--seed": "1" };
  const r = rebaseAuthoredOntoCodeSeed({ baseCode, authored, newCode });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.payload.tokenDefaults?.["--x"], "y");
  assert.equal(r.payload.tokenDefaults?.["--seed"], "1");
});

test("findPayloadByCodeHash: returns matching candidate", () => {
  const a = oldAuthored();
  const b = buildMaisonV2Payload();
  assert.equal(findPayloadByCodeHash([{ payload: a, hash: "h1" }, { payload: b, hash: "h2" }], "h2"), b);
  assert.equal(findPayloadByCodeHash([{ payload: a, hash: "h1" }], "missing"), null);
});

test("patchMaisonCtaTrees: idempotent on current code seed", () => {
  const seed = buildMaisonV2Payload();
  const once = patchMaisonCtaTrees(seed, {
    shellTree: clone(seed.shellTree ?? []) as CtaNode[],
    homeTree: clone(seed.homeTree ?? []) as CtaNode[],
  });
  assert.equal(once.alreadyDone, true);
  assert.deepEqual(once.refusals, []);
});
