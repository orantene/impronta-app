/**
 * reveal-visible-at-rest.test.ts — AUD-045.
 *
 * Live P1 (2026-09-28, book-jorgelina.tulala.digital at 390x844): the hero h1
 * and section h2s wrapped in a `reveal` node were still at computed opacity 0
 * after a fresh load plus 4s idle. The only way out of the hidden pose was an
 * IntersectionObserver callback.
 *
 * Rule: a section may animate in, but from a visible resting state; it is never
 * left at opacity 0 waiting for an observer. These tests EXECUTE the exact
 * script bytes the renderer ships, in a vm against a small fake DOM, and pin:
 *   - above-the-fold content is revealed at mount without any observer callback
 *   - no JS / no IntersectionObserver = nothing is ever hidden
 *   - reduced motion = nothing is ever hidden
 *   - the safety timeout reveals whatever is still hidden
 *   - the hidden pose is applied only after the observer is observing
 *
 * Run: node_modules/.bin/tsx --test \
 *   src/lib/site-admin/builder-node/reveal-visible-at-rest.test.ts
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import vm from "node:vm";
import { renderToStaticMarkup } from "react-dom/server";

import { BUILDER_NODE_RENDERER_CSS, renderBuilderNodes } from "./render";
import {
  REVEAL_SAFETY_MS,
  buildRevealArmingScript,
  buildScrollLaneRuntimeScript,
} from "./reveal-runtime";
import type { BuilderNode } from "./types";

// ── fake DOM ────────────────────────────────────────────────────────────────

type Rect = { top: number; bottom: number };

interface FakeEl {
  nodeType: number;
  tag: string;
  attrs: Record<string, string>;
  children: FakeEl[];
  parentNode: FakeEl | null;
  rect: Rect;
  styleProps: Record<string, string>;
  style: { setProperty(n: string, v: string): void };
  textContent: string;
  getAttribute(n: string): string | null;
  setAttribute(n: string, v: string): void;
  removeAttribute(n: string): void;
  hasAttribute(n: string): boolean;
  matches(sel: string): boolean;
  querySelectorAll(sel: string): FakeEl[];
  getBoundingClientRect(): Rect & { width: number; height: number };
  appendChild(c: FakeEl): void;
  removeChild(c: FakeEl): void;
}

function attrOf(sel: string): string {
  const m = /^\[([^\]=]+)\]$/.exec(sel);
  return m ? m[1]! : "\u0000";
}

function el(tag = "div", attrs: Record<string, string> = {}, children: FakeEl[] = [], rect: Rect = { top: 0, bottom: 100 }): FakeEl {
  const node: FakeEl = {
    nodeType: 1,
    tag,
    attrs: { ...attrs },
    children,
    parentNode: null,
    rect,
    styleProps: {},
    style: {
      setProperty(n, v) {
        node.styleProps[n] = v;
      },
    },
    textContent: "",
    getAttribute: (n) => (n in node.attrs ? node.attrs[n]! : null),
    setAttribute(n, v) {
      node.attrs[n] = v;
    },
    removeAttribute(n) {
      delete node.attrs[n];
    },
    hasAttribute: (n) => n in node.attrs,
    matches: (sel) => attrOf(sel) in node.attrs,
    querySelectorAll(sel) {
      const out: FakeEl[] = [];
      const walk = (n: FakeEl) => {
        for (const c of n.children) {
          if (c.matches(sel)) out.push(c);
          walk(c);
        }
      };
      walk(node);
      return out;
    },
    getBoundingClientRect: () => ({ ...node.rect, width: 300, height: node.rect.bottom - node.rect.top }),
    appendChild(c) {
      c.parentNode = node;
      node.children.push(c);
    },
    removeChild(c) {
      node.children = node.children.filter((x) => x !== c);
      c.parentNode = null;
    },
  };
  for (const c of children) c.parentNode = node;
  Object.defineProperty(node, "parentElement", { get: () => node.parentNode });
  return node;
}

interface Harness {
  ctx: Record<string, unknown>;
  observed: FakeEl[];
  /** Pending rAF callbacks; flush() drains them (and any they enqueue). */
  flushFrames(): void;
  /** Fire every timer whose delay is <= ms. */
  advance(ms: number): void;
  timers: { ms: number; fn: () => void; fired: boolean }[];
  fireIntersection(target: FakeEl, isIntersecting: boolean): void;
  listeners: Record<string, (() => void)[]>;
}

function harness(opts: {
  reducedMotion?: boolean;
  intersectionObserver?: boolean;
  head?: FakeEl;
  body?: FakeEl;
  currentScript?: FakeEl | null;
  viewportHeight?: number;
}): Harness {
  const observed: FakeEl[] = [];
  const frames: (() => void)[] = [];
  const timers: Harness["timers"] = [];
  const listeners: Record<string, (() => void)[]> = {};
  const ioCallbacks: ((entries: { target: FakeEl; isIntersecting: boolean }[]) => void)[] = [];
  const head = opts.head ?? el("head");
  const body = opts.body ?? el("body");
  const win: Record<string, unknown> = {
    innerHeight: opts.viewportHeight ?? 844,
    matchMedia: () => ({ matches: Boolean(opts.reducedMotion) }),
    requestAnimationFrame: (f: () => void) => {
      frames.push(f);
      return frames.length;
    },
    addEventListener: (name: string, fn: () => void) => {
      (listeners[`window:${name}`] ??= []).push(fn);
    },
  };
  const IO = class {
    constructor(cb: (typeof ioCallbacks)[number]) {
      ioCallbacks.push(cb);
    }
    observe(n: FakeEl) {
      observed.push(n);
    }
    unobserve() {}
    disconnect() {}
  };
  if (opts.intersectionObserver !== false) win.IntersectionObserver = IO;
  const ctx: Record<string, unknown> = {
    window: win,
    document: {
      readyState: "complete",
      currentScript: opts.currentScript ?? null,
      head,
      body,
      documentElement: { clientHeight: opts.viewportHeight ?? 844 },
      createElement: (tag: string) => el(tag),
      querySelector: (sel: string) => {
        const m = /^style\[([^\]]+)\]$/.exec(sel);
        return m ? (head.children.find((c) => m[1]! in c.attrs) ?? null) : null;
      },
      addEventListener: (name: string, fn: () => void) => {
        (listeners[`document:${name}`] ??= []).push(fn);
      },
    },
    setTimeout: (fn: () => void, ms: number) => {
      timers.push({ ms, fn, fired: false });
      return timers.length;
    },
    MutationObserver: class {
      observe() {}
    },
  };
  if (opts.intersectionObserver !== false) ctx.IntersectionObserver = IO;
  return {
    ctx,
    observed,
    timers,
    listeners,
    flushFrames() {
      while (frames.length) frames.shift()!();
    },
    advance(ms) {
      for (const t of timers) {
        if (!t.fired && t.ms <= ms) {
          t.fired = true;
          t.fn();
        }
      }
    },
    fireIntersection(target, isIntersecting) {
      for (const cb of ioCallbacks) cb([{ target, isIntersecting }]);
    },
  };
}

// ── the `reveal` wrapper (what the Jorgelina hero uses) ─────────────────────

function wrapper(rect: Rect) {
  const script = el("script");
  const heading = el("h1");
  const root = el(
    "div",
    { "data-bn-reveal-effect": "rise", "data-bn-reveal-direction": "up" },
    [heading, script],
    rect,
  );
  return { root, heading, script };
}

const WRAPPER_SCRIPT = buildRevealArmingScript({ threshold: 0.2, staggerMs: 80, once: true });

function runWrapper(rect: Rect, opts: Parameters<typeof harness>[0] = {}) {
  const w = wrapper(rect);
  const h = harness({ ...opts, currentScript: w.script });
  vm.runInNewContext(WRAPPER_SCRIPT, h.ctx);
  return { ...w, h };
}

const armed = (n: FakeEl) => n.getAttribute("data-bn-reveal-armed") === "1";
const revealed = (n: FakeEl) => n.getAttribute("data-bn-reveal-in") === "1";
/** The rule the CSS encodes: children hidden iff armed and not yet in. */
const hidden = (n: FakeEl) => armed(n) && !revealed(n);

test("wrapper: above-the-fold content is revealed at mount, no observer callback needed", () => {
  const { root, h } = runWrapper({ top: 80, bottom: 400 });
  assert.ok(armed(root), "the entrance animation still arms");
  // TUL-495: revealed BEFORE arm (sync), so first paint is never blank while
  // rAF waits on a busy main thread. flushFrames is a no-op re-check.
  assert.ok(revealed(root), "hero in the viewport stayed hidden waiting for rAF");
  h.flushFrames();
  assert.ok(revealed(root));
  assert.ok(!hidden(root));
});

test("wrapper: below-the-fold waits for the observer, then reveals", () => {
  const { root, h } = runWrapper({ top: 2000, bottom: 2300 });
  h.flushFrames();
  assert.ok(hidden(root), "below the fold may start hidden to animate in on scroll");
  h.fireIntersection(root, true);
  assert.ok(revealed(root));
});

test("wrapper: safety timeout reveals anything still hidden", () => {
  const { root, h } = runWrapper({ top: 2000, bottom: 2300 });
  h.flushFrames();
  assert.ok(hidden(root));
  assert.equal(REVEAL_SAFETY_MS, 1500);
  const safety = h.timers.find((t) => t.ms === REVEAL_SAFETY_MS);
  assert.ok(safety, `no ${REVEAL_SAFETY_MS}ms safety timer was scheduled`);
  h.advance(REVEAL_SAFETY_MS);
  assert.ok(revealed(root), "content still hidden after the safety deadline");
});

test("wrapper: load and DOMContentLoaded re-check the fold", () => {
  const { root, h } = runWrapper({ top: 2000, bottom: 2300 });
  h.flushFrames();
  assert.ok(hidden(root));
  root.rect = { top: 10, bottom: 300 }; // layout settled, it is on screen now
  for (const fn of h.listeners["window:load"] ?? []) fn();
  assert.ok(revealed(root));
});

test("wrapper: no IntersectionObserver = never armed, content visible", () => {
  const { root } = runWrapper({ top: 2000, bottom: 2300 }, { intersectionObserver: false });
  assert.ok(!armed(root) && !hidden(root));
});

test("wrapper: reduced motion = never armed, no hidden state at all", () => {
  const { root, h } = runWrapper({ top: 2000, bottom: 2300 }, { reducedMotion: true });
  assert.ok(!armed(root) && !hidden(root));
  assert.equal(h.observed.length, 0);
});

test("wrapper: an observer that throws on construction leaves content visible", () => {
  const w = wrapper({ top: 2000, bottom: 2300 });
  const h = harness({ currentScript: w.script });
  const Boom = class {
    constructor() {
      throw new Error("no");
    }
  };
  (h.ctx.window as Record<string, unknown>).IntersectionObserver = Boom;
  h.ctx.IntersectionObserver = Boom;
  vm.runInNewContext(WRAPPER_SCRIPT, h.ctx);
  assert.ok(!armed(w.root), "armed before the observer existed");
});

test("wrapper: no JS = the server markup never carries the hidden pose", () => {
  const node = {
    id: "rv",
    kind: "reveal",
    props: {},
    children: [{ id: "h", kind: "heading", props: { text: "Tu mirada, tu estilo.", level: 1 } }],
  } as unknown as BuilderNode;
  const html = renderToStaticMarkup(
    renderBuilderNodes([node], {
      mode: "freeform",
      includeRendererStyles: false,
      includeFontLinks: false,
    }) as Parameters<typeof renderToStaticMarkup>[0],
  );
  assert.ok(html.includes("Tu mirada, tu estilo."));
  assert.ok(!html.includes('data-bn-reveal-armed="1"'), "server markup armed the hidden pose");
  assert.doesNotMatch(html, /\sdata-bn-reveal-armed=/, "server markup carries the armed attribute");
  // The static sheet hides children ONLY behind the armed attribute.
  const hidingRules = BUILDER_NODE_RENDERER_CSS.split("\n").filter(
    (l) => l.includes(".site-builder-node--reveal") && /opacity:0/.test(l),
  );
  assert.ok(hidingRules.length > 0);
  for (const rule of hidingRules) {
    assert.match(rule, /\[data-bn-reveal-armed="1"\]/, `ungated hiding rule: ${rule}`);
  }
});

test("wrapper CSS: backstop animation, reduced-motion guard, and in-state beats the offset pose", () => {
  const css = BUILDER_NODE_RENDERER_CSS;
  assert.match(css, /@keyframes bn-reveal-backstop\{to\{opacity:1;/);
  assert.match(
    css,
    /\.site-builder-node--reveal\[data-bn-reveal-armed="1"\]:not\(\[data-bn-reveal-in="1"\]\)>:not\(script\)\{animation:bn-reveal-backstop [^}]* 1500ms both\}/,
    "CSS backstop must reveal at the same 1500ms deadline as the JS safety net",
  );
  assert.match(
    css,
    /@media \(prefers-reduced-motion:reduce\)\{\.site-builder-node--reveal\[data-bn-reveal-armed="1"\]>:not\(script\)\{opacity:1;[^}]*animation:none\}\}/,
  );
  // The rise/direction pose carries 4 attribute/class selectors; the in-state
  // must carry more, or a revealed heading stays shifted by the rise distance.
  const inRule = css
    .split("\n")
    .find((l) => l.includes('[data-bn-reveal-in="1"]') && l.includes("opacity:1;transform:none"));
  assert.ok(inRule, "in-state rule missing");
  const selector = inRule.slice(0, inRule.indexOf("{"));
  const weight = (selector.match(/\[|\./g) ?? []).length;
  assert.ok(weight >= 5, `in-state selector too weak (${weight}): ${selector}`);
});

// ── page-level scroll lanes (play-once / reveal-style) ──────────────────────

const LANE = {
  flag: "__bnTestLane",
  attr: "data-bn-anim-once",
  sheetAttr: "data-bn-test-armed",
  armedCss: ".x{opacity:0}",
};
const LANE_SCRIPT = buildScrollLaneRuntimeScript(LANE);

function runLane(nodes: FakeEl[], opts: Parameters<typeof harness>[0] = {}) {
  const head = el("head");
  const body = el("body", {}, nodes);
  const h = harness({ ...opts, head, body });
  vm.runInNewContext(LANE_SCRIPT, h.ctx);
  const sheet = () => head.children.find((c) => LANE.sheetAttr in c.attrs) ?? null;
  return { h, head, body, sheet };
}

test("lane: on-screen node revealed at mount; off-screen waits; safety drops the sheet", () => {
  const top = el("h2", { [LANE.attr]: "" }, [], { top: 100, bottom: 200 });
  const below = el("h2", { [LANE.attr]: "" }, [], { top: 3000, bottom: 3100 });
  const r = runLane([top, below]);
  assert.deepEqual(r.h.observed, [top, below], "observer must be observing before arming");
  assert.ok(r.sheet(), "hidden pose armed");
  // TUL-495: fold is revealed sync before arm; flushFrames is a re-check only.
  assert.ok(top.hasAttribute("data-bn-revealed"), "above the fold waited for rAF before reveal");
  r.h.flushFrames();
  assert.ok(top.hasAttribute("data-bn-revealed"));
  assert.ok(!below.hasAttribute("data-bn-revealed"));
  assert.ok(r.h.timers.some((t) => t.ms === REVEAL_SAFETY_MS), "no safety timer");
  r.h.advance(REVEAL_SAFETY_MS);
  assert.equal(r.sheet(), null, "armed sheet survived the safety deadline");
});

test("lane: reduced motion and no IntersectionObserver never arm", () => {
  const n1 = el("h2", { [LANE.attr]: "" }, [], { top: 3000, bottom: 3100 });
  assert.equal(runLane([n1], { reducedMotion: true }).sheet(), null);
  const n2 = el("h2", { [LANE.attr]: "" }, [], { top: 3000, bottom: 3100 });
  const noIo = runLane([n2], { intersectionObserver: false });
  assert.equal(noIo.sheet(), null);
});
