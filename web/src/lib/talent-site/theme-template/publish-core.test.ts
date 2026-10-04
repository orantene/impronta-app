/**
 * Template Factory "Publish as vN+1": rev, preflight, base and code checks,
 * the empty-diff refusal, the version rule and the RPC result mapping, all
 * over fake ports (no database).
 */
import test from "node:test";
import assert from "node:assert/strict";

import type { BuilderNode } from "@/lib/site-admin/builder-node/types";
import { hydrateTalentTree, type TalentProfileTokens } from "../default-talent-tree";
import { resolveYearToken } from "../server/theme-apply-core";
import { buildFolioPayload } from "../theme-catalog/collection/designs";
import type { DesignPayload } from "../theme-catalog/types";
import { itemsMissingNotes } from "../theme-releases/manager/items";
import {
  KNOWN_PLACEHOLDERS,
  canonicalDesign,
  mapPublishRpc,
  planPublish,
  publishWithPorts,
  versionState,
  type DesignHistoryView,
  type PublishPorts,
  type PublishRpcArgs,
} from "./publish-core";
import type { ThemeDraft } from "./types";

const BASE = canonicalDesign(buildFolioPayload());

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

function withToken(p: DesignPayload, key: string, value: string): DesignPayload {
  const n = clone(p);
  n.tokenDefaults = { ...(n.tokenDefaults ?? {}), [key]: value };
  return n;
}

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

function history(over: Partial<DesignHistoryView> = {}): DesignHistoryView {
  return {
    title: "Folio",
    catalog: { version: 14, payload: BASE },
    snapshots: [
      { version: 16, payload: BASE },
      { version: 17, payload: BASE },
    ],
    releaseToVersions: [16, 17],
    ...over,
  };
}

function ports(d: ThemeDraft, h: DesignHistoryView = history(), extra: Partial<PublishPorts> = {}) {
  const calls: PublishRpcArgs[] = [];
  const p: PublishPorts = {
    loadDraft: async () => ({ ok: true, value: d }),
    loadHistory: async () => h,
    codeClaims: () => false,
    codeHash: () => "code-hash",
    rpc: async (args) => {
      calls.push(args);
      return { data: { ok: true, version: args.p_version, release_id: "rel-1" }, error: null };
    },
    ...extra,
  };
  return { p, calls };
}

const changed = () => withToken(BASE, "type.section-title-size", "40px");

test("version rule: H is the max of catalog, snapshots, releases; L the newest payload", () => {
  const s = versionState(history({ releaseToVersions: [16, 17, 19] }))!;
  assert.equal(s.highest, 19);
  assert.equal(s.latest.version, 17);
});

test("happy path: next = H+1, items with EN+ES notes, meta, RPC args", async () => {
  const { p, calls } = ports(draft(changed()));
  const r = await publishWithPorts(p, { design: "folio", expectedRev: 4, actorId: "u1" });
  assert.ok(r.ok, JSON.stringify(r));
  assert.equal(r.value.version, 18);
  assert.equal(r.value.releaseId, "rel-1");
  const a = calls[0]!;
  assert.equal(a.p_version, 18);
  assert.equal(a.p_expected_rev, 4);
  assert.equal(a.p_draft_id, "draft-1");
  assert.equal(a.p_actor, "u1");
  assert.equal(a.p_release.from_version, 17);
  assert.equal(a.p_release.to_version, 18);
  assert.deepEqual(a.p_meta.code_hash, "code-hash");
  assert.equal(a.p_meta.base_version, 17);
  assert.equal(a.p_release.items.length, 1);
  assert.equal(a.p_release.items[0]!.id, "token-default:type.section-title-size");
  assert.equal(itemsMissingNotes(a.p_release.items), 0);
  assert.ok(a.p_release.notes.en && a.p_release.notes.es);
});

test("stale rev is refused before anything else", async () => {
  const { p, calls } = ports(draft(changed()));
  const r = await publishWithPorts(p, { design: "folio", expectedRev: 3, actorId: null });
  assert.equal(r.ok, false);
  assert.equal(!r.ok && r.code, "stale_rev");
  assert.equal(calls.length, 0);
});

test("base check: draft opened from an older version is a conflict naming vX (EN + ES)", async () => {
  const { p, calls } = ports(draft(changed(), { baseVersion: 16 }));
  const r = await publishWithPorts(p, { design: "folio", expectedRev: 4, actorId: null });
  assert.ok(!r.ok);
  assert.equal(r.code, "conflict");
  assert.match(r.error, /moved to v17/);
  assert.match(r.errorEs, /v17/);
  assert.equal(calls.length, 0);
});

test("code check: a release-notes module claiming H+1 refuses the publish", async () => {
  const seen: number[] = [];
  const { p, calls } = ports(draft(changed()), history(), {
    codeClaims: (_d, v) => {
      seen.push(v);
      return v === 18;
    },
  });
  const r = await publishWithPorts(p, { design: "folio", expectedRev: 4, actorId: null });
  assert.ok(!r.ok);
  assert.equal(r.code, "conflict");
  assert.match(r.error, /v18/);
  assert.deepEqual(seen, [18]);
  assert.equal(calls.length, 0);
});

test("empty diff is refused as invalid", async () => {
  const { p, calls } = ports(draft(clone(BASE)));
  const r = await publishWithPorts(p, { design: "folio", expectedRev: 4, actorId: null });
  assert.ok(!r.ok);
  assert.equal(r.code, "invalid");
  assert.match(r.error, /No changes/);
  assert.equal(calls.length, 0);
});

test("preflight: unknown placeholder and disallowed node kind are refused", async () => {
  const bad = changed();
  const hero = bad.homeTree[0] as BuilderNode & { children?: BuilderNode[] };
  (hero.props as Record<string, unknown>).layerLabel = "Hi {{notAField}}";
  bad.homeTree.push({ id: "x", kind: "embed", props: {} } as unknown as BuilderNode);
  const { p } = ports(draft(bad));
  const r = await planPublish(p, { design: "folio", expectedRev: 4 });
  assert.ok(!r.ok);
  assert.equal(r.code, "invalid");
  const issues = (r.issues ?? []).join("\n");
  assert.match(issues, /unknown placeholder \{\{notAField\}\}/);
  assert.match(issues, /"embed" is not allowed/);
});

test("preflight: a changed literal with a Spanish variant needs new Spanish text", async () => {
  const withEs = clone(BASE);
  const node = withEs.homeTree[1]!;
  const props = node.props as Record<string, unknown>;
  props.layerLabel = "Old";
  props.i18n = { es: { layerLabel: "Viejo" } };
  const next = clone(withEs);
  (next.homeTree[1]!.props as Record<string, unknown>).layerLabel = "New";
  const h = history({ snapshots: [{ version: 17, payload: withEs }], catalog: null, releaseToVersions: [] });
  const r = await planPublish(ports(draft(next), h).p, { design: "folio", expectedRev: 4 });
  assert.ok(!r.ok);
  assert.match((r.issues ?? []).join("\n"), /Spanish text did not/);
});

test("preview (expectedRev null) skips the rev check and lists content-only changes", async () => {
  const next = changed();
  next.optionalBlocks = [];
  const r = await planPublish(ports(draft(next, { rev: 99 })).p, { design: "folio", expectedRev: null });
  assert.ok(r.ok, JSON.stringify(r));
  assert.equal(r.value.nextVersion, 18);
  assert.ok(r.value.contentOnly.includes("optional blocks") || (BASE.optionalBlocks ?? []).length === 0);
});

test("RPC mapping", () => {
  assert.deepEqual(mapPublishRpc({ ok: true, version: 18, release_id: "r" }, null), {
    ok: true,
    value: { version: 18, releaseId: "r" },
  });
  const stale = mapPublishRpc({ ok: false, code: "stale_rev" }, null);
  assert.ok(!stale.ok && stale.code === "stale_rev");
  const conflict = mapPublishRpc({ ok: false, code: "conflict" }, null);
  assert.ok(!conflict.ok && conflict.code === "conflict" && conflict.errorEs.length > 0);
  const err = mapPublishRpc(null, { message: "boom" });
  assert.ok(!err.ok && err.code === "error" && /boom/.test(err.error));
  const noId = mapPublishRpc({ ok: true, version: 18 }, null);
  assert.ok(!noId.ok && noId.code === "error");
  assert.ok(!mapPublishRpc(null, null).ok);
});

test("RPC throwing maps to error, not a crash", async () => {
  const { p } = ports(draft(changed()), history(), {
    rpc: async () => {
      throw new Error("network");
    },
  });
  const r = await publishWithPorts(p, { design: "folio", expectedRev: 4, actorId: null });
  assert.ok(!r.ok && r.code === "error" && /network/.test(r.error));
});

test("every KNOWN_PLACEHOLDER really hydrates (drift guard against default-talent-tree)", () => {
  const talent = new Proxy({} as Record<string, unknown>, {
    get: (_t, k) => (k === "gallery" ? ["G", "G", "G", "G", "G", "G"] : "Z"),
  }) as unknown as TalentProfileTokens;
  for (const name of KNOWN_PLACEHOLDERS) {
    if (name === "year") {
      const y = resolveYearToken([{ id: "y", kind: "paragraph", props: { text: "{{year}}" } } as unknown as BuilderNode], 2026);
      assert.equal((y[0]!.props as { text: string }).text, "2026");
      continue;
    }
    const tree = [{ id: "p", kind: "paragraph", props: { text: `{{${name}}}` } } as unknown as BuilderNode];
    const out = hydrateTalentTree(tree, talent);
    const text = (out[0]?.props as { text?: string } | undefined)?.text ?? "";
    assert.ok(text.length > 0, `{{${name}}} hydrates`);
  }
  const unknown = hydrateTalentTree([{ id: "p", kind: "paragraph", props: { text: "{{nope}}" } } as unknown as BuilderNode], talent);
  assert.equal((unknown[0]?.props as { text?: string }).text, "");
});
