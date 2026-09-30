/**
 * H-4 section switcher: pure rules, the client island in jsdom (scroll-spy,
 * menu open / Escape / outside, reduced motion), and the four layers it must be
 * wired at (schema, renderer, inspector, Maison payload + anchors).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><html><body></body></html>", { pretendToBeVisual: true, url: "https://example.test/" });
const g = globalThis as Record<string, unknown>;
g.window = dom.window;
g.document = dom.window.document;
Object.defineProperty(globalThis, "navigator", { value: dom.window.navigator, configurable: true });
g.HTMLElement = dom.window.HTMLElement;
g.Element = dom.window.Element;
g.Node = dom.window.Node;
g.Event = dom.window.Event;
g.KeyboardEvent = dom.window.KeyboardEvent;
g.CustomEvent = dom.window.CustomEvent;
g.IS_REACT_ACT_ENVIRONMENT = true;

/* eslint-disable import/first -- jsdom globals must exist before react-dom loads */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { SectionSwitcher } from "./SectionSwitcher";
import {
  hashTargetOf,
  pickActiveSection,
  sectionIndexLabel,
  switchDirection,
  switcherLinksFrom,
} from "./section-switcher-logic";
import { siteHeaderSchemaV1 } from "./schema";
import { HEADER_ITEM_KINDS, defaultItemForKind } from "./regions-editing";
import { headerItemAttrs, headerItemMobileDefault } from "./header-site-chrome";
import { ITEM_META } from "@/components/edit-chrome/inspectors/site-header/tabs/regions-meta";
import { buildMaisonV2Payload } from "@/lib/talent-site/theme-catalog/collection/designs";
import type { BuilderNode } from "@/lib/site-admin/builder-node/types";
/* eslint-enable import/first */

const here = dirname(fileURLToPath(import.meta.url));
const read = (rel: string) => readFileSync(join(here, rel), "utf8");

const LINKS = [
  { label: "Work", href: "#gallery" },
  { label: "Menu and prices", href: "#services" },
  { label: "Reviews", href: "#reviews" },
  { label: "Your visit", href: "#visit" },
];

// ── Pure rules ───────────────────────────────────────────────────────────────

test("index label is the 1-based position, two digits", () => {
  assert.equal(sectionIndexLabel(0), "01");
  assert.equal(sectionIndexLabel(2), "03");
  assert.equal(sectionIndexLabel(11), "12");
});

test("only in-page anchors with a label can be spied on", () => {
  assert.equal(hashTargetOf("#services"), "services");
  assert.equal(hashTargetOf("#"), null);
  assert.equal(hashTargetOf("/contact"), null);
  assert.deepEqual(
    switcherLinksFrom([...LINKS, { label: "Blog", href: "/blog" }, { label: " ", href: "#x" }]).map((l) => l.href),
    ["#gallery", "#services", "#reviews", "#visit"],
  );
});

test("scroll-spy: the last section whose top reached the reading line is active", () => {
  const tops = [
    { id: "gallery", top: 400 },
    { id: "services", top: 900 },
    { id: "reviews", top: 1500 },
  ];
  assert.equal(pickActiveSection(tops, 250), null, "before the first section: none");
  assert.equal(pickActiveSection([{ id: "gallery", top: 100 }, ...tops.slice(1)], 250), "gallery");
  assert.equal(pickActiveSection([{ id: "gallery", top: -800 }, { id: "services", top: 120 }, tops[2]!], 250), "services");
  assert.equal(pickActiveSection([{ id: "gallery", top: -2000 }, { id: "services", top: -900 }, { id: "reviews", top: -10 }], 250), "reviews");
});

test("scrolling down slides the name up, scrolling back slides it down", () => {
  assert.equal(switchDirection(0, 2), "up");
  assert.equal(switchDirection(3, 1), "down");
});

// ── The island ───────────────────────────────────────────────────────────────

function mountSections(tops: Record<string, number>) {
  const body = dom.window.document.body;
  body.innerHTML = "";
  const els = Object.entries(tops).map(([id, top]) => {
    const el = dom.window.document.createElement("section");
    el.id = id;
    (el as unknown as { getBoundingClientRect: () => DOMRect }).getBoundingClientRect = () => ({ top }) as DOMRect;
    body.appendChild(el);
    return { id, el, setTop: (t: number) => ((el as unknown as { getBoundingClientRect: () => DOMRect }).getBoundingClientRect = () => ({ top: t }) as DOMRect) };
  });
  return els;
}

function mountSwitcher(showIndex = true) {
  const host = dom.window.document.createElement("div");
  dom.window.document.body.appendChild(host);
  const root = createRoot(host);
  act(() => {
    root.render(
      <SectionSwitcher links={LINKS} showIndex={showIndex} label="Sections" attrs={{ "data-header-item": "section_switcher" }} />,
    );
  });
  return {
    host,
    unmount() {
      act(() => root.unmount());
      host.remove();
    },
  };
}

const scrollTo = () => act(() => void dom.window.dispatchEvent(new dom.window.Event("scroll")));

test("the switcher shows the current section and follows the scroll", () => {
  Object.defineProperty(dom.window, "innerHeight", { value: 800, configurable: true });
  const s = mountSections({ gallery: 600, services: 1400, reviews: 2200, visit: 3000 });
  const { host, unmount } = mountSwitcher();
  const name = () => host.querySelector(".site-header__secsw-name")?.textContent;
  const idx = () => host.querySelector(".site-header__secsw-idx")?.textContent;
  assert.equal(name(), "Work");
  assert.equal(idx(), "01");

  // Scroll down: the menu section reaches the reading line (30% of 800 = 240).
  s[0]!.setTop(-700);
  s[1]!.setTop(100);
  scrollTo();
  assert.equal(name(), "Menu and prices");
  assert.equal(idx(), "02");
  assert.equal(host.querySelector(".site-header__secsw-name")?.getAttribute("data-dir"), "up");

  // Scroll back: the name slides the other way.
  s[1]!.setTop(900);
  s[0]!.setTop(10);
  scrollTo();
  assert.equal(name(), "Work");
  assert.equal(host.querySelector(".site-header__secsw-name")?.getAttribute("data-dir"), "down");
  unmount();
});

test("a tap opens the menu of every section; Escape and an outside tap close it", () => {
  mountSections({ gallery: 600, services: 1400, reviews: 2200, visit: 3000 });
  const { host, unmount } = mountSwitcher();
  const btn = host.querySelector<HTMLButtonElement>(".site-header__secsw-btn")!;
  assert.equal(btn.getAttribute("aria-expanded"), "false");
  assert.equal(host.querySelector("[data-secsw-menu]"), null);
  act(() => btn.click());
  assert.equal(btn.getAttribute("aria-expanded"), "true");
  assert.equal(host.querySelectorAll("[data-secsw-menu] a").length, 4);
  act(() => void dom.window.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Escape" })));
  assert.equal(host.querySelector("[data-secsw-menu]"), null, "Escape closes");

  act(() => btn.click());
  assert.ok(host.querySelector("[data-secsw-menu]"));
  act(() => void dom.window.document.body.dispatchEvent(new dom.window.Event("pointerdown", { bubbles: true })));
  assert.equal(host.querySelector("[data-secsw-menu]"), null, "an outside tap closes");
  unmount();
});

test("choosing a section scrolls smoothly, or instantly under reduced motion", () => {
  const sections = mountSections({ gallery: 600, services: 1400, reviews: 2200, visit: 3000 });
  const calls: Array<{ id: string; behavior: string | undefined }> = [];
  for (const s of sections) {
    (s.el as unknown as { scrollIntoView: (o: ScrollIntoViewOptions) => void }).scrollIntoView = (o) =>
      calls.push({ id: s.id, behavior: o.behavior });
  }
  const { host, unmount } = mountSwitcher();
  const choose = (i: number) => {
    act(() => host.querySelector<HTMLButtonElement>(".site-header__secsw-btn")!.click());
    act(() => host.querySelectorAll<HTMLAnchorElement>("[data-secsw-menu] a")[i]!.click());
  };
  (dom.window as unknown as { matchMedia: unknown }).matchMedia = () => ({ matches: false });
  choose(1);
  assert.deepEqual(calls.at(-1), { id: "services", behavior: "smooth" });
  assert.equal(host.querySelector("[data-secsw-menu]"), null, "choosing closes the menu");
  (dom.window as unknown as { matchMedia: unknown }).matchMedia = () => ({ matches: true });
  choose(2);
  assert.deepEqual(calls.at(-1), { id: "reviews", behavior: "auto" });
  unmount();
});

test("links whose anchor is not on the page are dropped; fewer than two hides the switcher", () => {
  mountSections({ gallery: 600 });
  const { host, unmount } = mountSwitcher();
  assert.equal(host.querySelector(".site-header__secsw"), null);
  unmount();
});

test("the number can be switched off", () => {
  mountSections({ gallery: 600, services: 1400 });
  const { host, unmount } = mountSwitcher(false);
  assert.equal(host.querySelector(".site-header__secsw-idx"), null);
  unmount();
});

// ── Layers ───────────────────────────────────────────────────────────────────

test("schema accepts the item, with or without the number flag", () => {
  const parse = (item: Record<string, unknown>) =>
    siteHeaderSchemaV1.safeParse({ brand: {}, regions: { left: [], center: [item], right: [] } });
  assert.ok(parse({ type: "section_switcher", showIndex: false }).success);
  assert.ok(parse({ type: "section_switcher" }).success);
  assert.ok(parse({ type: "section_switcher", responsive: { mobile: "show", desktop: "hide" }, priority: 90 }).success);
  assert.ok(!parse({ type: "section_switcher", showIndex: "yes" }).success);
});

test("the item is in the palette with a plain-language name, priority and a phone-only default", () => {
  assert.ok((HEADER_ITEM_KINDS as readonly string[]).includes("section_switcher"));
  assert.equal(defaultItemForKind("section_switcher").type, "section_switcher");
  assert.ok(ITEM_META.section_switcher.label.length > 0 && ITEM_META.section_switcher.description.length > 0);
  const item = defaultItemForKind("section_switcher");
  assert.equal(headerItemMobileDefault(item), "show");
  const attrs = headerItemAttrs(item);
  assert.equal(attrs["data-bp-desktop"], "hide");
  assert.equal(attrs["data-bp-tablet"], "hide");
  assert.equal(attrs["data-bp-mobile"], "show");
  // An owner choice always wins over the phone-only default.
  assert.equal(headerItemAttrs({ ...item, responsive: { desktop: "show" } })["data-bp-desktop"], "show");
});

test("the renderer, inspector row, settings and Spanish strings are wired", () => {
  assert.match(read("Component.tsx"), /case "section_switcher"/);
  assert.match(read("Component.tsx"), /<SectionSwitcher/);
  const row = readFileSync(join(here, "../../../../components/edit-chrome/inspectors/site-header/tabs/regions-item-row.tsx"), "utf8");
  assert.match(row, /case "section_switcher"/);
  assert.match(row, /item\.type === "section_switcher"/);
  const es = readFileSync(join(here, "../../../../components/edit-chrome/editor-i18n-es-inspectors-3.ts"), "utf8");
  for (const key of [
    ITEM_META.section_switcher.label,
    ITEM_META.section_switcher.description,
    "Section number",
    "Show the number",
    "Name only",
    "{count} sections, shown on phones",
  ]) {
    assert.ok(es.includes(JSON.stringify(key)), `missing ES entry: ${key}`);
  }
  assert.doesNotMatch(es.slice(es.indexOf('"Section switcher"')), /—/);
});

test("motion: every switcher animation is off under reduced motion, and no hex is used", () => {
  const css = readFileSync(join(here, "../../../../app/token-presets.css"), "utf8");
  const block = css.slice(css.indexOf("H-4 section switcher"), css.indexOf(".site-header__inner {"));
  assert.match(block, /prefers-reduced-motion: reduce\)[\s\S]*site-header__secsw-name, \.site-header__secsw-line \{ animation: none/);
  assert.match(block, /0\.32s cubic-bezier\(0\.2, 0\.8, 0\.2, 1\)/);
  assert.match(block, /0\.45s cubic-bezier\(0\.2, 0\.8, 0\.2, 1\)/);
  assert.doesNotMatch(block, /#[0-9a-fA-F]{3,8}\b/);
});

function walk(nodes: ReadonlyArray<BuilderNode>, visit: (n: BuilderNode) => void) {
  for (const n of nodes) {
    visit(n);
    walk(((n as { children?: BuilderNode[] }).children ?? []) as BuilderNode[], visit);
  }
}

test("Maison v2: the header carries the switcher, and every menu link has an anchor on the page", () => {
  const payload = buildMaisonV2Payload();
  const header = payload.shellTree.find((n) => (n.props as Record<string, unknown>).sectionTypeKey === "site_header")!;
  const sp = (header.props as { sectionProps: { regions: { center: Array<{ type: string }> }; navItems?: unknown } }).sectionProps;
  assert.ok(sp.regions.center.some((i) => i.type === "section_switcher"));
  const anchors = new Set<string>();
  for (const n of payload.homeTree) {
    const a = (n.props as Record<string, unknown>).anchorId;
    if (typeof a === "string") anchors.add(a);
  }
  // Every top-level section has an anchor (the switcher spies on them).
  for (const n of payload.homeTree) {
    assert.ok(typeof (n.props as Record<string, unknown>).anchorId === "string", `a section without an anchor: ${n.id}`);
  }
  // The nav links the switcher reads must resolve.
  const navLinks: string[] = [];
  walk(payload.shellTree, (n) => {
    const items = (n.props as { sectionProps?: { navItems?: Array<{ href?: string }> } }).sectionProps?.navItems;
    for (const i of items ?? []) if (i.href?.startsWith("#")) navLinks.push(i.href.slice(1));
  });
  for (const id of navLinks) assert.ok(anchors.has(id), `nav link #${id} has no section anchor`);
});
