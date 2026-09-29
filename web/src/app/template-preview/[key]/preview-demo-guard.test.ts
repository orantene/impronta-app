/**
 * Demo preview safety (Maison audit P0): the theme preview never books or
 * inquires for real, and says so when a booking control is tapped.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  classifyPreviewClick,
  previewDemoNote,
  type GuardElement,
} from "./preview-demo-guard";

/** Tiny fake element: a chain of {tag, attrs} from target up to root. */
function el(chain: Array<{ tag: string; attrs?: Record<string, string> }>): GuardElement {
  const make = (i: number): GuardElement => ({
    getAttribute: (n) => chain[i]?.attrs?.[n] ?? null,
    closest(selector) {
      for (let j = i; j < chain.length; j++) {
        const node = chain[j]!;
        for (const part of selector.split(",").map((s) => s.trim())) {
          const m = /^([a-z]*)(?:\[([a-z-]+)(?:=['"]([^'"]*)['"])?\])?$/.exec(part);
          if (!m) continue;
          const [, tag, attr, val] = m;
          if (tag && tag !== node.tag) continue;
          if (attr) {
            const v = node.attrs?.[attr];
            if (v == null) continue;
            if (val != null && v !== val) continue;
          }
          if (!tag && !attr) continue;
          return make(j);
        }
      }
      return null;
    },
  });
  return make(0);
}

test("Seleccionar / Reservar inside the demo catalog island → note (sheet is demo)", () => {
  const t = el([{ tag: "button" }, { tag: "div", attrs: { "data-booking-mode": "demo" } }]);
  assert.equal(classifyPreviewClick(t), "note");
});

test("Hablar / confirm inside the demo booking sheet → note", () => {
  const t = el([{ tag: "span" }, { tag: "button" }, { tag: "div", attrs: { "data-catalog-booking": "demo" } }]);
  assert.equal(classifyPreviewClick(t), "note");
});

test("a link that leaves the preview (/book, wa.me) is blocked", () => {
  assert.equal(classifyPreviewClick(el([{ tag: "a", attrs: { href: "/book?o=1" } }])), "block");
  assert.equal(
    classifyPreviewClick(el([{ tag: "span" }, { tag: "a", attrs: { href: "https://wa.me/1" } }])),
    "block",
  );
});

test("in-page anchors and unrelated buttons are left alone", () => {
  assert.equal(classifyPreviewClick(el([{ tag: "a", attrs: { href: "#services" } }])), null);
  assert.equal(classifyPreviewClick(el([{ tag: "button" }, { tag: "nav" }])), null);
  assert.equal(classifyPreviewClick(null), null);
});

test("note copy EN/ES", () => {
  assert.equal(previewDemoNote("en"), "Demo only · nothing was booked");
  assert.equal(previewDemoNote("es"), "Solo demo · no se reservó nada");
});

test("theme preview renders with no tenant, so services_catalog booking is demo", () => {
  const preview = readFileSync(join(process.cwd(), "src/app/template-preview/[key]/theme-preview.tsx"), "utf8");
  // No freeformContext → no tenant. My content binds preset sources, and
  // those always carry catalogBookingLive: false.
  assert.doesNotMatch(preview, /freeformContext=/);
  assert.match(preview, /freeformDataSources=\{mine\?\.dataSources\}/);
  const mine = readFileSync(
    join(process.cwd(), "src/lib/talent-site/server/preview-my-content.server.ts"),
    "utf8",
  );
  assert.match(mine, /catalogBookingLive: false/);
  assert.match(preview, /<ThemeTokenPreviewFrame initialTokens=\{effectiveTokens\} locale=/);
  const render = readFileSync(
    join(process.cwd(), "src/lib/site-admin/builder-node/render.tsx"),
    "utf8",
  );
  assert.match(render, /catalogBookingLive \? "live" : "demo"/);
  const frame = readFileSync(join(process.cwd(), "src/app/template-preview/[key]/theme-preview-frame-client.tsx"), "utf8");
  assert.match(frame, /classifyPreviewClick/);
  assert.match(frame, /tulala:ask-question/);
  assert.match(frame, /preview-demo-note/);
});
