/**
 * THEME CORE P0-2: copy-only and translation-only drafts are publishable.
 * diffDesignPayloads emits `copy` candidates and planPublish no longer refuses
 * them (the TUL-15 Stage 1 failure: base v24 + a draft that only adds i18n).
 */
import test from "node:test";
import assert from "node:assert/strict";

import type { BuilderNode } from "@/lib/site-admin/builder-node/types";
import { canonicalDesign, planPublish, type DesignHistoryView, type PlanPorts } from "../theme-template/publish-core";
import type { ThemeDraft } from "../theme-template/types";
import type { DesignPayload } from "../theme-catalog/types";
import { buildFolioPayload } from "../theme-catalog/collection/designs";
import { diffDesignPayloads } from "./diff-payload";

function node(key: string, props: Record<string, unknown> = {}, kind = "button"): BuilderNode {
  return { id: `n-${key}`, kind, props: { slotKey: key, ...props }, children: [] } as unknown as BuilderNode;
}

function payload(homeTree: BuilderNode[], extra: Partial<DesignPayload> = {}): DesignPayload {
  return { shellTree: [], homeTree, ...extra } as DesignPayload;
}

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

const BASE = payload([
  node("cta", { label: "Book now", layerLabel: "Call to action" }),
  node("intro", { text: "Hello", layerLabel: "Intro" }, "paragraph"),
]);

function withI18n(p: DesignPayload, key: string, i18n: Record<string, Record<string, string>>): DesignPayload {
  const n = clone(p);
  const target = n.homeTree.find((x) => (x.props as Record<string, unknown>).slotKey === key)!;
  (target.props as Record<string, unknown>).i18n = i18n;
  return n;
}

const diff = (a: DesignPayload, b: DesignPayload) => diffDesignPayloads("folio", { payload: a, version: 24 }, { payload: b, version: 25 });

test("an i18n-only change yields one copy candidate for the node, with sorted paths", () => {
  const next = withI18n(BASE, "cta", { es: { label: "Reservar" }, en: { label: "Book now" } });
  const out = diff(BASE, next);
  assert.equal(out.length, 1);
  assert.equal(out[0]!.type, "copy");
  assert.equal(out[0]!.key, "home:cta");
  assert.equal(out[0]!.id, "copy:home:cta");
  assert.deepEqual(out[0]!.paths, ["i18n.en.label", "i18n.es.label"]);
  assert.deepEqual(out[0]!.detail, { paths: ["i18n.en.label", "i18n.es.label"] });
});

test("an i18n value change reports only the changed path", () => {
  const a = withI18n(BASE, "cta", { es: { label: "Reservar" }, en: { label: "Book now" } });
  const b = withI18n(BASE, "cta", { es: { label: "Reserva tu cita" }, en: { label: "Book now" } });
  const out = diff(a, b);
  assert.deepEqual(out.map((i) => [i.type, i.paths]), [["copy", ["i18n.es.label"]]]);
});

test("a design-owned base text change rides variant-default only (no duplicate copy item)", () => {
  const next = clone(BASE);
  (next.homeTree[1]!.props as Record<string, unknown>).text = "Welcome";
  const types = diff(BASE, next).map((i) => i.type);
  assert.deepEqual(types, ["variant-default"]);
});

test("no copy and no design change: no candidates", () => {
  assert.deepEqual(diff(BASE, clone(BASE)), []);
});

test("a design-only change emits no copy item", () => {
  const next = clone(BASE);
  (next.homeTree[0]!.props as Record<string, unknown>).variant = "ghost";
  assert.deepEqual(diff(BASE, next).map((i) => i.type), ["variant-default"]);
});

test("copy and design changes on different nodes both appear, in stable order", () => {
  const next = withI18n(BASE, "cta", { es: { label: "Reservar" } });
  (next.homeTree[1]!.props as Record<string, unknown>).variant = "wide";
  const out = diff(BASE, next);
  assert.deepEqual(out.map((i) => i.id), ["copy:home:cta", "variant-default:home:intro"]);
  assert.deepEqual(diff(BASE, next), out);
});

const FOLIO = canonicalDesign(buildFolioPayload());

function folioWithI18n(count: number): DesignPayload {
  const n = clone(FOLIO);
  n.homeTree.slice(0, count).forEach((t, i) => {
    (t.props as Record<string, unknown>).i18n = { es: { eyebrow: `Hola ${i}` }, en: { eyebrow: `Hello ${i}` } };
  });
  return n;
}

function ports(draftPayload: DesignPayload): PlanPorts {
  const d = {
    id: "d1",
    design: "folio",
    baseVersion: 24,
    payload: draftPayload,
    preview: {},
    rev: 1,
    status: "open",
    publishedVersion: null,
    releaseId: null,
    updatedAt: "2026-10-08T00:00:00Z",
  } as ThemeDraft;
  const h: DesignHistoryView = {
    title: "Folio",
    catalog: { version: 14, payload: FOLIO },
    snapshots: [{ version: 24, payload: FOLIO }],
    releaseToVersions: [24],
  };
  return { loadDraft: async () => ({ ok: true, value: d }), loadHistory: async () => h, codeClaims: () => false, codeHash: () => null };
}

test("TUL-15 Stage 1: base v24 + a draft that only adds i18n plans a copy release as v25", async () => {
  const r = await planPublish(ports(folioWithI18n(3)), { design: "folio", expectedRev: 1 });
  assert.ok(r.ok, JSON.stringify(r));
  assert.equal(r.value.nextVersion, 25);
  assert.equal(r.value.items.length, 3);
  assert.ok(r.value.items.every((i) => i.type === "copy"));
  for (const i of r.value.items) assert.ok(i.note?.en && i.note?.es);
  assert.match(r.value.items[0]!.note!.en, /updated text/);
});

test("planPublish still refuses a draft with no copy and no design change", async () => {
  const r = await planPublish(ports(clone(FOLIO)), { design: "folio", expectedRev: 1 });
  assert.ok(!r.ok);
  assert.match(r.error, /No changes/);
});
