import test from "node:test";
import assert from "node:assert/strict";

import type { BuilderNode } from "@/lib/site-admin/builder-node/types";
import { checkAuthoredChannelGate, decideAuthoredSync } from "../../authored-sync-rule";
import { hashBuiltinPayload, planBuiltinSync } from "../../sync-builtins.server";
import { payloadHash } from "../../../theme-template/publish-core";
import { withDesignKey } from "../../../theme-releases/design-keys";
import type { DesignPayload } from "../../types";
import { designTokenDefaults } from "../design-token-defaults";
import { COLLECTION_DESIGNS } from "../designs";
import { authoredOverlayVersion, registeredAuthoredOverlays } from ".";
import {
  AuthoredOverlayError,
  applyAuthoredOverlay,
  canonicalOverlayPayload,
  diffToOverlay,
  isEmptyOverlay,
  type AuthoredOverlayFile,
} from "./overlay";

const rawOf = (slug: string): DesignPayload => {
  const e = COLLECTION_DESIGNS.find((d) => d.slug === slug)!;
  return (e.buildPayloadRaw ?? e.buildPayload)();
};
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const props = (n: BuilderNode) => (n as unknown as { props: Record<string, unknown> }).props;
const kids = (n: BuilderNode) => (n as unknown as { children?: BuilderNode[] }).children ?? [];

// ---- CI guard: every committed overlay reproduces its snapshot -------------

test("every registered overlay applies to current code and reproduces its snapshot hash", () => {
  const all = registeredAuthoredOverlays();
  assert.ok(all.length >= 1, "folio overlay is registered");
  for (const [slug, overlay] of all) {
    assert.ok(overlay.authoredVersion > 0, `${slug}: authoredVersion`);
    const applied = applyAuthoredOverlay(rawOf(slug), overlay);
    assert.equal(payloadHash(applied), overlay.payloadHash, `${slug}: apply(raw, overlay) must hash to the authored snapshot`);
    // What ships is exactly that payload.
    const shipped = COLLECTION_DESIGNS.find((d) => d.slug === slug)!.buildPayload();
    assert.equal(hashBuiltinPayload(shipped), hashBuiltinPayload(applied), `${slug}: buildPayload is the overlaid payload`);
  }
});

test("folio v18: buildPayload, designTokenDefaults and the sync rule reflect the authored version", () => {
  assert.equal(authoredOverlayVersion("folio"), 18);
  const shipped = COLLECTION_DESIGNS.find((d) => d.slug === "folio")!.buildPayload();
  assert.equal(shipped.tokenDefaults?.["button.padding-x"], "20px");
  assert.equal(shipped.tokenDefaults?.["type.hero-size-desktop"], "clamp(72px,15cqi,240px)");
  assert.equal(designTokenDefaults("folio")["button.padding-x"], "20px");
  assert.equal(designTokenDefaults("folio")["type.hero-size-desktop"], "clamp(72px,15cqi,240px)");
  // Raw code still carries the kit values (code tables untouched).
  assert.equal(rawOf("folio").tokenDefaults?.["button.padding-x"], "16px");

  // Sync: latest is authored v18 == the overlaid code -> unchanged, not pending.
  const v18 = clone(shipped);
  const entry = COLLECTION_DESIGNS.find((d) => d.slug === "folio")!;
  const latest = { version: 18, payload: v18, source: "authored", meta: { code_hash: hashBuiltinPayload(rawOf("folio")) } };
  assert.deepEqual(
    decideAuthoredSync({
      codeHash: hashBuiltinPayload(shipped),
      latestHash: hashBuiltinPayload(v18),
      latest,
      overlayVersion: authoredOverlayVersion("folio"),
    }),
    { kind: "unchanged" },
  );
  const plan = planBuiltinSync(
    [{ entry, payload: shipped }],
    [{ kind: "design", slug: "folio", version: 17, payload: rawOf("folio"), source: "builtin" }],
    null,
    new Map([["folio", { snapshots: [{ version: 17, payload: rawOf("folio"), source: "sync" }, latest], releaseToVersions: [] }]]),
  );
  assert.deepEqual(plan.authoredPending, []);
  assert.deepEqual(plan.designChanges, []);
  assert.equal(plan.unchanged, 1);

  // Release manager: Open to talents / Make default allowed for v18.
  for (const target of ["optin", "default"] as const) {
    assert.deepEqual(checkAuthoredChannelGate(target, { version: 18, source: "authored" }, authoredOverlayVersion("folio")), { ok: true });
  }
  assert.equal(checkAuthoredChannelGate("optin", { version: 19, source: "authored" }, authoredOverlayVersion("folio")).ok, false);
});

// ---- round-trip property ---------------------------------------------------

function firstWithKids(tree: BuilderNode[]): BuilderNode | null {
  for (const n of tree) {
    if (kids(n).length > 0) return n;
    const deep = firstWithKids(kids(n));
    if (deep) return deep;
  }
  return null;
}

/** Deterministic editor-like edits on the canonical code payload. */
function syntheticEdit(raw: DesignPayload, salt: number): DesignPayload {
  const p = clone(canonicalOverlayPayload(raw));
  // Leaf prop edits: change, add, delete.
  const top = p.homeTree[0]!;
  props(top).s11Added = { nested: { v: salt } };
  props(top).layerLabel = `Edited ${salt}`;
  const parent = firstWithKids(p.homeTree) ?? firstWithKids(p.shellTree);
  if (parent) {
    const child = kids(parent)[0]!;
    props(child).s11Child = [salt, "x"];
    const firstKey = Object.keys(props(child)).find((k) => k !== "designKey" && k !== "s11Child");
    if (firstKey) delete props(child)[firstKey];
    // Remove a nested node when there are siblings.
    if (kids(parent).length > 1) kids(parent).pop();
  }
  // Remove a top-level node, add a new one (with a subtree), reorder.
  if (p.homeTree.length > 2) p.homeTree.splice(p.homeTree.length - 1, 1);
  const added = withDesignKey(clone(p.homeTree[1] ?? p.homeTree[0]!), `section~s11${salt}`);
  (added as unknown as { id: string }).id = `s11-added-${salt}`;
  p.homeTree.splice(1, 0, added);
  if (p.shellTree.length >= 2) p.shellTree.reverse();
  if (p.homeTree.length >= 3) [p.homeTree[0], p.homeTree[2]] = [p.homeTree[2]!, p.homeTree[0]!];
  // Token defaults: change, add, remove.
  const tok = { ...(p.tokenDefaults ?? {}) };
  const keys = Object.keys(tok);
  if (keys[0]) tok[keys[0]] = `${tok[keys[0]]}-s11`;
  if (keys[1]) delete tok[keys[1]];
  tok["s11.added"] = String(salt);
  p.tokenDefaults = tok;
  return p;
}

test("round trip: apply(raw, diff(raw, P)) == canonical P for every collection design", () => {
  for (const [i, entry] of COLLECTION_DESIGNS.entries()) {
    const raw = (entry.buildPayloadRaw ?? entry.buildPayload)();
    const P = syntheticEdit(raw, i + 1);
    const overlay = diffToOverlay(raw, P);
    assert.ok(!isEmptyOverlay(overlay), `${entry.slug}: edits produce a non-empty overlay`);
    const out = applyAuthoredOverlay(raw, overlay);
    assert.deepEqual(out, canonicalOverlayPayload(P), `${entry.slug}: round trip`);
    assert.equal(payloadHash(out), payloadHash(canonicalOverlayPayload(P)), `${entry.slug}: hash`);
    // The overlay survives a JSON file round trip.
    assert.deepEqual(applyAuthoredOverlay(raw, clone(overlay)), out);
  }
});

test("diff of identical payloads is empty, and apply of an empty overlay is canonical raw", () => {
  for (const entry of COLLECTION_DESIGNS) {
    const raw = (entry.buildPayloadRaw ?? entry.buildPayload)();
    const o = diffToOverlay(raw, raw);
    assert.ok(isEmptyOverlay(o), `${entry.slug}: ${JSON.stringify(o).slice(0, 200)}`);
    assert.deepEqual(applyAuthoredOverlay(raw, o), canonicalOverlayPayload(raw));
  }
});

// ---- strictness: a kit change colliding with a patched leaf throws ---------

test("apply throws loudly when code no longer matches the overlay", () => {
  const raw = rawOf("folio");
  const overlay = registeredAuthoredOverlays().find(([s]) => s === "folio")![1];
  const moved = clone(raw);
  moved.tokenDefaults = { ...moved.tokenDefaults!, "button.padding-x": "18px" };
  assert.throws(() => applyAuthoredOverlay(moved, overlay), (e: unknown) => e instanceof AuthoredOverlayError && /button\.padding-x/.test((e as Error).message));

  const P = syntheticEdit(raw, 7);
  const o = diffToOverlay(raw, P);
  const leafKey = Object.keys(o.props)[0]!;
  const bad: AuthoredOverlayFile = clone(o);
  bad.props[leafKey] = bad.props[leafKey]!.map((c) => ("from" in c ? { ...c, from: "not-the-code-value" } : c));
  assert.throws(() => applyAuthoredOverlay(raw, bad), AuthoredOverlayError);

  const missing: AuthoredOverlayFile = clone(o);
  missing.removed = [...missing.removed, "homeTree:no-such-node"];
  assert.throws(() => applyAuthoredOverlay(raw, missing), /no-such-node/);

  const dupAdd: AuthoredOverlayFile = clone(o);
  dupAdd.added = [...dupAdd.added, { ...dupAdd.added[0]!, node: canonicalOverlayPayload(raw).homeTree[0]! }];
  assert.throws(() => applyAuthoredOverlay(raw, dupAdd), /already exists/);
});
