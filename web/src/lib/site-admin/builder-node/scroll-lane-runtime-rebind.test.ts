/**
 * scroll-lane-runtime-rebind.test.ts — the scroll lanes (play-once, reveal)
 * must observe nodes that arrive AFTER the runtime bound.
 *
 * The defect this guards was seen live on improntamodels.com (2026-09-16):
 * open the published page, click Edit. The builder swaps the canvas in place,
 * so every section becomes a new DOM node. The runtime had bound once at
 * DOMContentLoaded to the nodes that existed then; its guard flag refused a
 * second bind; and the armed sheet it injected kept every replacement at
 * opacity 0. Ten sections, invisible, forever. Same hole on any client-side
 * route change or block re-render.
 *
 * The scripts are strings, so the test EXECUTES them in a vm against a small
 * fake DOM with capturing IntersectionObserver / MutationObserver stubs, then
 * simulates the canvas swap and asserts the new nodes are observed.
 *
 * Run: node_modules/.bin/tsx --test \
 *   src/lib/site-admin/builder-node/scroll-lane-runtime-rebind.test.ts
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import vm from "node:vm";
import { renderToStaticMarkup } from "react-dom/server";

import {
  BuilderNodeRendererStyles,
  BuilderNodeRevealRuntime,
} from "./render";
import type { BuilderNode } from "./types";

const ONCE_TREE: BuilderNode[] = [
  {
    id: "h1",
    kind: "heading",
    props: {
      text: "Hello",
      level: 2,
      style: { animationPreset: "rise", animationTrigger: "scroll", animationRepeat: "once" },
    },
  } as BuilderNode,
];

function scriptFrom(html: string, marker: string): string {
  const re = new RegExp(`<script[^>]*${marker}[^>]*>([\\s\\S]*?)</script>`);
  const m = re.exec(html);
  assert.ok(m, `runtime <script ${marker}> not found`);
  return m[1]!;
}

type FakeEl = {
  nodeType: number;
  attrs: Record<string, string>;
  children: FakeEl[];
  matches(sel: string): boolean;
  querySelectorAll(sel: string): FakeEl[];
  hasAttribute(n: string): boolean;
  setAttribute(n: string, v: string): void;
  parentNode: FakeEl | null;
  textContent: string;
  appendChild(c: FakeEl): void;
  removeChild(c: FakeEl): void;
};

function el(attrs: Record<string, string> = {}, children: FakeEl[] = []): FakeEl {
  const node: FakeEl = {
    nodeType: 1,
    attrs,
    children,
    parentNode: null,
    textContent: "",
    matches(sel) {
      const attr = sel.slice(1, -1);
      return attr in node.attrs;
    },
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
    hasAttribute: (n) => n in node.attrs,
    setAttribute(n, v) {
      node.attrs[n] = v;
    },
    appendChild(c) {
      c.parentNode = node;
      node.children.push(c);
    },
    removeChild(c) {
      node.children = node.children.filter((x) => x !== c);
    },
  };
  for (const c of children) c.parentNode = node;
  return node;
}

function runLane(script: string, attr: string) {
  const observed: FakeEl[] = [];
  let mutationCb: ((recs: { addedNodes: FakeEl[] }[]) => void) | null = null;
  const head = el();
  const first = el({ [attr]: "" });
  const body = el({}, [el({}, [first])]);
  const ctx = {
    window: {} as Record<string, unknown>,
    document: {
      readyState: "complete",
      head,
      body,
      createElement: () => el(),
      querySelector: (sel: string) =>
        head.children.find((c) => sel.includes(Object.keys(c.attrs)[0] ?? "\u0000")) ?? null,
      addEventListener: () => {},
    },
    IntersectionObserver: class {
      observe(n: FakeEl) {
        observed.push(n);
      }
      unobserve() {}
    },
    MutationObserver: class {
      constructor(cb: typeof mutationCb) {
        mutationCb = cb;
      }
      observe() {}
    },
  };
  (ctx.window as { matchMedia?: unknown }).matchMedia = () => ({ matches: false });
  vm.runInNewContext(script, ctx);
  return { observed, head, body, first, mutate: (added: FakeEl[]) => mutationCb?.([{ addedNodes: added }]) };
}

for (const lane of [
  {
    name: "play-once",
    attr: "data-bn-anim-once",
    html: () =>
      renderToStaticMarkup(
        BuilderNodeRendererStyles({ nodes: ONCE_TREE }) as Parameters<typeof renderToStaticMarkup>[0],
      ),
    marker: "data-builder-node-anim-once-runtime",
    sheetAttr: "data-bn-anim-once-armed",
  },
  {
    name: "reveal",
    attr: "data-bn-reveal",
    html: () =>
      renderToStaticMarkup(BuilderNodeRevealRuntime() as Parameters<typeof renderToStaticMarkup>[0]),
    marker: "data-builder-node-reveal-runtime",
    sheetAttr: "data-bn-reveal-armed-sheet",
  },
]) {
  test(`${lane.name}: nodes added after bind (editor canvas swap) are observed`, () => {
    const script = scriptFrom(lane.html(), lane.marker);
    const r = runLane(script, lane.attr);

    // Initial bind: the node present at DOMContentLoaded is observed and the
    // hidden pose is armed.
    assert.deepEqual(r.observed, [r.first]);
    assert.ok(
      r.head.children.some((c) => lane.sheetAttr in c.attrs),
      "armed sheet must be appended once nodes exist",
    );

    // Edit is clicked: the canvas is replaced. New section, new node, a
    // grandchild of what the mutation record reports as added.
    const fresh = el({ [lane.attr]: "" });
    const canvas = el({}, [el({}, [fresh])]);
    r.mutate([canvas]);
    assert.ok(
      r.observed.includes(fresh),
      "a node mounted after the runtime bound must still be observed, or the " +
        "armed sheet holds it at opacity 0 forever",
    );

    // A node that carries data-bn-revealed was moved, not born: leave it be.
    const done = el({ [lane.attr]: "", "data-bn-revealed": "" });
    r.mutate([done]);
    assert.ok(!r.observed.includes(done), "an already-revealed node is not re-observed");

    // Text nodes and other non-elements in the record are ignored.
    r.mutate([{ nodeType: 3 } as unknown as FakeEl]);
    assert.equal(r.observed.length, 2);
  });

  test(`${lane.name}: no lane node on the page -> nothing is armed`, () => {
    const script = scriptFrom(lane.html(), lane.marker);
    const r = runLane(script, "data-bn-unrelated");
    assert.equal(r.observed.length, 0);
    assert.ok(
      !r.head.children.some((c) => lane.sheetAttr in c.attrs),
      "the hidden pose must not be injected when nothing opts in",
    );
  });
}
