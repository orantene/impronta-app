/**
 * TUL-516 W3-4: every collection theme hero carries the shared booking CTA (`#book`).
 */
import assert from "node:assert/strict";
import test from "node:test";

import type { BuilderNode } from "@/lib/site-admin/builder-node/types";
import {
  HERO_BOOK_HREF,
  HERO_BOOK_LABEL,
  sharedHeroBookingCtaRow,
} from "./hero-booking-cta";
import {
  buildFolioPayload,
  buildFramePayload,
  buildGridlinePayload,
  buildMaisonV2Payload,
  buildMonoPayload,
  buildSolacePayload,
} from "./collection/designs";

function findButtons(nodes: readonly BuilderNode[]): Array<{ label?: string; href?: string; tone?: string }> {
  const out: Array<{ label?: string; href?: string; tone?: string }> = [];
  const walk = (list: readonly BuilderNode[]) => {
    for (const n of list) {
      if (n.kind === "button") out.push((n.props ?? {}) as { label?: string; href?: string; tone?: string });
      if (n.kind === "masthead") {
        const p = (n.props ?? {}) as { ctaLabel?: string; ctaHref?: string };
        if (p.ctaLabel) out.push({ label: p.ctaLabel, href: p.ctaHref, tone: "primary" });
      }
      const kids = "children" in n && Array.isArray(n.children) ? (n.children as BuilderNode[]) : [];
      walk(kids);
    }
  };
  walk(nodes);
  return out;
}

test("sharedHeroBookingCtaRow is #book + Book an appointment", () => {
  assert.deepEqual(sharedHeroBookingCtaRow(), {
    primaryLabel: HERO_BOOK_LABEL,
    primaryHref: HERO_BOOK_HREF,
    secondaryLabel: "See services",
    secondaryHref: "#services",
  });
  assert.equal(HERO_BOOK_HREF, "#book");
});

const PAYLOADS = {
  "maison-v2": buildMaisonV2Payload,
  gridline: buildGridlinePayload,
  solace: buildSolacePayload,
  mono: buildMonoPayload,
  frame: buildFramePayload,
  folio: buildFolioPayload,
} as const;

for (const [slug, build] of Object.entries(PAYLOADS)) {
  test(`${slug}: hero/cover booking CTA uses shared #book engine`, () => {
    const p = build();
    const buttons = findButtons(p.homeTree);
    const book = buttons.find((b) => b.href === "#book" || b.label === HERO_BOOK_LABEL);
    assert.ok(book, `${slug} must expose a #book / Book an appointment CTA in the home tree`);
    assert.equal(book.href, "#book");
  });
}
