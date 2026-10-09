/**
 * Theme releases: per-leaf COPY ownership (base text + `i18n` translations).
 * Scenario: TUL-88, the hero primary button changes from "See services" to
 * "Book an appointment" with es "Reservar cita" and en "Book an appointment".
 */
import test from "node:test";
import assert from "node:assert/strict";

import type { BuilderNode } from "@/lib/site-admin/builder-node/types";
import { countCopyKept, revertCopyEntry } from "./copy-merge";
import {
  copyReportFromMerge,
  formatCopyReport,
  formatSiteCopyReport,
} from "./copy-report";
import { mergeDesignUpdate } from "./merge";
import { copyLeaves, getCopyLeaf, isNodeEdited, propsOf, refreshOriginFingerprints, setCopyLeaf, setNodeCopyLeaf, stampDesignOrigin, stableStringify } from "./origin";
import { reverseMerge } from "./reverse-merge";
import { edit, prop } from "./test-fixtures";
import type { DesignSide, ReleaseItem } from "./types";
import { appliedToast, copyKeptLine } from "./talent-update/copy";
import { summarizeReport } from "./talent-update/view";

interface Spec {
  label: string;
  es: string;
  en: string;
  variant?: string;
  tokenEs?: string;
}

function node(kind: string, props: Record<string, unknown>, children?: BuilderNode[]): BuilderNode {
  return { id: `c-${kind}-${Math.random().toString(36).slice(2, 8)}`, kind, props, ...(children ? { children } : {}) } as unknown as BuilderNode;
}

function sideOf(version: number, s: Spec): DesignSide {
  const home = [
    node("container", { slotKey: "hero", variant: "split" }, [
      node("heading", { text: "{{displayName}}", level: 1, i18n: { es: { text: s.tokenEs ?? "Hola {{displayName}}" } } }),
      node("button", {
        label: s.label,
        variant: s.variant ?? "solid",
        href: "{{inquireHref}}",
        i18n: { es: { label: s.es }, en: { label: s.en } },
      }),
    ]),
  ];
  return {
    trees: { shell: [], home: refreshOriginFingerprints(stampDesignOrigin(home, { design: "maison-v2", version })) },
    tokens: {},
  };
}

const V1: Spec = { label: "See services", es: "Ver servicios", en: "See services" };
const V2: Spec = { label: "Book an appointment", es: "Reservar cita", en: "Book an appointment" };
const KEY = "hero/button";

const copyItem: ReleaseItem = { type: "copy", key: KEY, tree: "home" };
const base = () => sideOf(1, V1);
const theirs = (o: Partial<Spec> = {}) => sideOf(2, { ...V2, ...o });
const run = (ours: DesignSide, t: DesignSide, items?: ReleaseItem[]) =>
  mergeDesignUpdate({ base: base(), ours, theirs: t, ...(items ? { items } : {}) });
const side = (r: ReturnType<typeof run>): DesignSide => ({ trees: r.trees, tokens: r.tokens });
const btn = (s: DesignSide): BuilderNode => (s.trees.home![0] as unknown as { children: BuilderNode[] }).children[1]!;
const bag = (s: DesignSide, loc: string): Record<string, unknown> =>
  ((propsOf(btn(s)).i18n as Record<string, Record<string, unknown>> | undefined)?.[loc]) ?? {};

test("an untouched site gets all 3 TUL-88 leaves when the release has a copy item", () => {
  const r = run(base(), theirs(), [copyItem]);
  const s = side(r);
  assert.equal(prop(s, "home", KEY, "label"), "Book an appointment");
  assert.equal(bag(s, "es").label, "Reservar cita");
  assert.equal(bag(s, "en").label, "Book an appointment");
  assert.equal(isNodeEdited(btn(s)), false);
  const rep = copyReportFromMerge({ profileCode: "TAL-1", slug: "demo" }, r.report);
  assert.deepEqual(rep.updates.map((u) => u.path), ["i18n.en.label", "i18n.es.label", "label"]);
  assert.equal(rep.kept.length, 0);
});

test("a site that edited only es keeps its es, takes the new en, and reports 1 copy conflict", () => {
  const ours = edit(base(), "home", KEY, "i18n.es.label", "Agenda tu cita");
  const r = run(ours, theirs(), [copyItem]);
  const s = side(r);
  assert.equal(bag(s, "es").label, "Agenda tu cita");
  assert.equal(bag(s, "en").label, "Book an appointment");
  assert.equal(prop(s, "home", KEY, "label"), "Book an appointment");
  assert.equal(countCopyKept(r.report.conflicts), 1);
  const rep = copyReportFromMerge({ profileCode: "TAL-2", slug: null }, r.report);
  assert.deepEqual(rep.kept.map((k) => [k.path, k.hers, k.next]), [["i18n.es.label", "Agenda tu cita", "Reservar cita"]]);
});

test("without a copy item nothing is written and the diff shows as pending", () => {
  const r = run(base(), theirs(), []);
  const s = side(r);
  assert.equal(prop(s, "home", KEY, "label"), "See services");
  assert.equal(bag(s, "es").label, "Ver servicios");
  assert.equal(bag(s, "en").label, "See services");
  const pending = r.report.pending.flatMap((e) => (e.changes ?? []).map((c) => c.path));
  assert.ok(pending.includes("i18n.es.label") && pending.includes("i18n.en.label"));
  assert.equal(r.report.applied.length, 0);
});

test("items of other types do not carry translations", () => {
  const layout: ReleaseItem = { type: "layout", key: KEY, tree: "home" };
  const s = side(run(base(), theirs(), [layout]));
  assert.equal(bag(s, "es").label, "Ver servicios");
  assert.equal(bag(s, "en").label, "See services");
});

test("a node edited for style still takes copy for untouched leaves and keeps its style", () => {
  const ours = edit(base(), "home", KEY, "variant", "outline");
  assert.equal(isNodeEdited(btn(ours)), true);
  const r = run(ours, theirs(), [copyItem]);
  const s = side(r);
  assert.equal(prop(s, "home", KEY, "variant"), "outline");
  assert.equal(prop(s, "home", KEY, "label"), "Book an appointment");
  assert.equal(bag(s, "es").label, "Reservar cita");
  assert.equal(bag(s, "en").label, "Book an appointment");
  assert.equal(r.report.kept.length, 0);
  assert.equal(countCopyKept(r.report.conflicts), 0);
});

test("a node edited for style keeps the design change it owns (reported kept) while copy still ships", () => {
  const ours = edit(base(), "home", KEY, "variant", "outline");
  const r = run(ours, theirs({ variant: "ghost" }), [copyItem]);
  const s = side(r);
  assert.equal(prop(s, "home", KEY, "variant"), "outline");
  assert.equal(prop(s, "home", KEY, "label"), "Book an appointment");
  assert.deepEqual(r.report.kept.flatMap((e) => (e.changes ?? []).map((c) => c.path)), ["variant"]);
});

test("her own base label stays hers even when the translations ship", () => {
  const ours = edit(base(), "home", KEY, "label", "Reserva ya");
  const r = run(ours, theirs(), [copyItem]);
  const s = side(r);
  assert.equal(prop(s, "home", KEY, "label"), "Reserva ya");
  assert.equal(bag(s, "es").label, "Reservar cita");
});

test("a locale the seed never carried is never touched", () => {
  const ours = edit(base(), "home", KEY, "i18n.fr.label", "Réserver");
  const r = run(ours, theirs(), [copyItem]);
  assert.equal(bag(side(r), "fr").label, "Réserver");
  assert.equal(countCopyKept(r.report.conflicts), 0);
  const quiet = run(ours, base(), [copyItem]);
  assert.equal(quiet.report.applied.length, 0);
});

test("a {{token}} leaf stays content-owned", () => {
  const props = { text: "{{displayName}}", i18n: { es: { text: "Hola {{displayName}}", other: "Hola" } } };
  assert.deepEqual([...copyLeaves(props, ["text"], "heading").keys()], ["i18n.es.other"]);
  const r = run(base(), theirs({ tokenEs: "Buenas {{displayName}}" }), [copyItem, { type: "copy", key: "hero/heading", tree: "home" }]);
  const heading = (r.trees.home![0] as unknown as { children: BuilderNode[] }).children[0]!;
  assert.equal((propsOf(heading).i18n as { es: { text: string } }).es.text, "Hola {{displayName}}");
});

test("a rerun on its own output changes nothing", () => {
  const first = run(edit(base(), "home", KEY, "i18n.es.label", "Agenda tu cita"), theirs(), [copyItem]);
  const again = mergeDesignUpdate({ base: base(), ours: side(first), theirs: theirs(), items: [copyItem] });
  assert.equal(stableStringify(again.trees), stableStringify(first.trees));
  assert.equal(again.report.applied.filter((e) => e.reason === "copy_applied").length, 0);
});

test("no items = the whole update, copy included", () => {
  const s = side(run(base(), theirs()));
  assert.equal(bag(s, "es").label, "Reservar cita");
  assert.equal(prop(s, "home", KEY, "label"), "Book an appointment");
});

test("undo restores written copy leaves and leaves a later edit alone", () => {
  const r = run(base(), theirs(), [copyItem]);
  const later = edit(side(r), "home", KEY, "i18n.en.label", "Reserve");
  const back = reverseMerge(r.report, later);
  const s: DesignSide = { trees: back.trees, tokens: back.tokens };
  assert.equal(bag(s, "es").label, "Ver servicios");
  assert.equal(bag(s, "en").label, "Reserve");
  assert.equal(prop(s, "home", KEY, "label"), "See services");
});

test("copyLeaves covers base text props, list items, and dotted overlay keys; fp is unaffected", () => {
  const cta = { label: "Go", href: "/x", i18n: { es: { label: "Ir", "items.0.text": "Uno", "sectionProps.navItems.0.label": "Trabajos" } } };
  assert.deepEqual(
    [...copyLeaves(cta, [], "button").entries()].sort(),
    [["i18n.es.items.0.text", "Uno"], ["i18n.es.label", "Ir"], ["i18n.es.sectionProps.navItems.0.label", "Trabajos"], ["label", "Go"]],
  );
  const stats = { items: [{ label: "Years", value: "{{years}}" }, { label: "Clients", value: "300" }] };
  assert.deepEqual([...copyLeaves(stats, [], "stats").keys()].sort(), ["items.0.label", "items.1.label", "items.1.value"]);
  // the fingerprint ignores i18n, so a translation change never reads as a style edit
  const a = sideOf(1, V1);
  const b = edit(a, "home", KEY, "i18n.es.label", "Otro");
  assert.equal(isNodeEdited(btn(b)), false);
});

test("setCopyLeaf and setNodeCopyLeaf write dotted keys, list items, and the node.i18n mirror", () => {
  const p = setCopyLeaf({ i18n: { es: { "items.0.text": "a" } } }, "i18n.es.items.0.text", "b");
  assert.equal(getCopyLeaf(p, "i18n.es.items.0.text"), "b");
  assert.equal(getCopyLeaf(setCopyLeaf(p, "i18n.es.items.0.text", undefined), "i18n.es.items.0.text"), undefined);
  assert.equal(setCopyLeaf({ i18n: { es: { a: "x" } } }, "i18n.es.a", undefined).i18n, undefined);
  const list = setCopyLeaf({ rows: [{ label: "a", value: "b" }] }, "rows.0.label", "z");
  assert.deepEqual(list.rows, [{ label: "z", value: "b" }]);
  const n = { id: "x", kind: "button", props: { label: "L", i18n: { es: { label: "a" } } }, i18n: { es: { label: "a" } } } as unknown as BuilderNode;
  const out = setNodeCopyLeaf(n, "i18n.es.label", "b") as unknown as { i18n: { es: { label: string } } };
  assert.equal(out.i18n.es.label, "b");
  assert.equal(getCopyLeaf(propsOf(out as unknown as BuilderNode), "i18n.es.label"), "b");
  const rev = revertCopyEntry(out as unknown as BuilderNode, {
    seq: 1, change: "props", key: "k",
    changes: [{ path: "i18n.es.label", hadBefore: true, before: "a", hasAfter: true, after: "b" }],
  });
  assert.equal(rev.done, true);
});

test("report formatter lists UPDATE and KEPT lines per site and is stable", () => {
  const r = run(edit(base(), "home", KEY, "i18n.es.label", "Agenda tu cita"), theirs(), [copyItem]);
  const rep = copyReportFromMerge({ profileCode: "TAL-93900", slug: "jorg-beauty-qa" }, r.report);
  const lines = formatSiteCopyReport(rep);
  assert.equal(lines[0], "TAL-93900 (jorg-beauty-qa): copy 2 updates, 1 kept");
  assert.deepEqual(lines.slice(1), [
    '    UPDATE home:hero/button i18n.en.label: "See services" -> "Book an appointment"',
    '    UPDATE home:hero/button label: "See services" -> "Book an appointment"',
    '    KEPT   home:hero/button i18n.es.label: hers "Agenda tu cita" | new "Reservar cita"',
  ]);
  const text = formatCopyReport([rep, { profileCode: "TAL-1", slug: null, updates: [], kept: [] }]);
  assert.match(text, /^Copy report: 2 leaf updates, 1 kept across 1 site\n/);
  assert.equal(formatCopyReport([]), "Copy report: no default-copy leaf would change on any site.");
});

test("copy conflicts reach the summary, the sheet line and the toast in ES and EN", () => {
  const r = run(edit(base(), "home", KEY, "i18n.es.label", "Agenda tu cita"), theirs(), [copyItem]);
  const sum = summarizeReport(r.report);
  assert.equal(sum.copyKept, 1);
  assert.equal(copyKeptLine(sum, "en"), "We keep 1 text you changed");
  assert.equal(copyKeptLine(sum, "es"), "Conservamos 1 texto que cambiaste");
  assert.equal(copyKeptLine({ copyKept: 2 }, "es"), "Conservamos 2 textos que cambiaste");
  assert.equal(copyKeptLine({ copyKept: 0 }, "en"), null);
  assert.equal(appliedToast(0, "en", 2), "Update applied to your draft · we kept 2 texts you changed");
  assert.equal(appliedToast(0, "es", 2), "Actualización aplicada a tu borrador · conservamos 2 textos que cambiaste");
  assert.equal(appliedToast(3, "en", 2), "Update applied to your draft · we kept 3 of your edits and 2 texts you changed");
  assert.equal(appliedToast(3, "es", 1), "Actualización aplicada a tu borrador · conservamos 3 de tus cambios y 1 texto que cambiaste");
  assert.equal(appliedToast(3, "en"), "Update applied to your draft · we kept 3 of your edits");
  assert.equal(appliedToast(0, "es"), "Actualización aplicada a tu borrador");
});
