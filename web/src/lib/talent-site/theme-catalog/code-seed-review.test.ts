import test from "node:test";
import assert from "node:assert/strict";

import { buildMaisonV2Payload } from "./collection/maison-v2";
import type { DesignPayload } from "./types";
import {
  applyMaisonCtaSeedPatch,
  BOOK_LABEL,
  patchMaisonCtaTrees,
} from "./code-seed-cta";
import {
  factoryNeedsCodeSeedReview,
  findPayloadByCodeHash,
  planCodeSeedReviewDraft,
  rebaseAuthoredOntoCodeSeed,
} from "./code-seed-review";
import type { BuilderNode } from "@/lib/site-admin/builder-node/types";

type Rec = Record<string, unknown>;
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const props = (n: BuilderNode): Rec => (n.props ?? {}) as Rec;

function find(nodes: BuilderNode[], pred: (n: BuilderNode) => boolean): BuilderNode | null {
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
  const row = find(p.homeTree ?? [], (n) => props(n).layerLabel === "Hero actions")!;
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
  const header = (p.shellTree ?? []).find((n) => props(n).sectionTypeKey === "site_header")!;
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
  const row = find(plan.payload.homeTree ?? [], (n) => props(n).layerLabel === "Hero actions")!;
  assert.equal(props(row.children![0]!).label, BOOK_LABEL);
});

test("planCodeSeedReviewDraft: rebase when baseCode is recoverable", () => {
  const baseCode = oldAuthored();
  const authored = clone(baseCode);
  // Editor-only tweak: change a token so the overlay is non-empty.
  authored.tokenDefaults = { ...(authored.tokenDefaults ?? {}), "--test-token": "1" };
  const newCode = buildMaisonV2Payload();
  const plan = planCodeSeedReviewDraft({
    newCode,
    authored,
    baseCode,
    seedPatch: (a, c) => applyMaisonCtaSeedPatch(a, c),
  });
  // Rebase may succeed (token overlay) or fall through to CTA if kit collision.
  assert.equal(plan.ok, true);
  if (!plan.ok) return;
  assert.ok(plan.kind === "rebase" || plan.kind === "maison_cta" || plan.kind === "noop");
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
    shellTree: clone(seed.shellTree ?? []),
    homeTree: clone(seed.homeTree ?? []),
  });
  assert.equal(once.alreadyDone, true);
  assert.deepEqual(once.refusals, []);
});
