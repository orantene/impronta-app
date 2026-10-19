/**
 * TUL-639 (real posture): the seeded main CTA ("Book an appointment") follows
 * the talent's REAL selling mode (`resolveSiteCtaMode`: booking posture, plan
 * ceiling, working-hours readiness, accepting-bookings switch), through the
 * ONE wording helper, and its anchor lands on booking (`#book`) wherever
 * booking is on. Inquiry mode keeps `#services` (nothing to book).
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import type { BuilderNode } from "@/lib/site-admin/builder-node/types";
import { localiseSeededDesignLabels, resolveSiteCtaMode, type SiteCtaMode } from "./design-label-locale";
import { mainCtaLabel, mainCtaModeFromPosture } from "./main-cta";

const tree = (): BuilderNode[] =>
  [
    { id: "hero-cta", kind: "button", props: { label: "Book an appointment", href: "#services", tone: "primary" } },
    { id: "ghost", kind: "button", props: { label: "See services", href: "#services", tone: "secondary" } },
    {
      id: "hdr",
      kind: "section",
      props: {
        sectionTypeKey: "site_header",
        sectionProps: {
          primaryCta: { label: "Book an appointment", href: "#services" },
          regions: { right: [{ type: "cta", label: "Book an appointment", href: "#services" }] },
        },
      },
    },
  ] as unknown as BuilderNode[];

const props = (t: BuilderNode[], i: number) => t[i]!.props as { label: string; href: string };
const hdr = (t: BuilderNode[]) =>
  (t[2]!.props as { sectionProps: { primaryCta: { label: string; href: string }; regions: { right: Array<{ label: string; href: string }> } } }).sectionProps;

const MODES: Array<[SiteCtaMode, "instant" | "request" | "message"]> = [
  ["instant", "instant"],
  ["request", "request"],
  ["inquiry", "message"],
];

test("the seeded label follows the real mode, ES and EN, using the one helper's wording", () => {
  for (const [mode, ctaMode] of MODES) {
    for (const loc of ["es", "en"] as const) {
      const t = localiseSeededDesignLabels(tree(), loc, mode);
      assert.equal(props(t, 0).label, mainCtaLabel(ctaMode, loc), `${mode}/${loc} hero`);
      assert.equal(hdr(t).primaryCta.label, mainCtaLabel(ctaMode, loc), `${mode}/${loc} header`);
      assert.equal(hdr(t).regions.right[0]!.label, mainCtaLabel(ctaMode, loc), `${mode}/${loc} header region`);
    }
  }
  assert.equal(mainCtaLabel("instant", "es"), "Reservar cita");
});

test("the anchor lands on booking wherever booking is on, and stays on services for inquiry", () => {
  for (const mode of ["instant", "request"] as const) {
    const t = localiseSeededDesignLabels(tree(), "es", mode);
    assert.equal(props(t, 0).href, "#book", `${mode} hero`);
    assert.equal(hdr(t).primaryCta.href, "#book", `${mode} header`);
    assert.equal(hdr(t).regions.right[0]!.href, "#book", `${mode} header region`);
    assert.equal(props(t, 1).href, "#services", "the ghost See services button stays on services");
  }
  const inquiry = localiseSeededDesignLabels(tree(), "es", "inquiry");
  assert.equal(props(inquiry, 0).href, "#services");
  assert.equal(hdr(inquiry).primaryCta.href, "#services");
});

test("a button the talent re-pointed or retyped is never rewritten", () => {
  const edited = [
    { id: "a", kind: "button", props: { label: "Book an appointment", href: "/contact" } },
    { id: "b", kind: "button", props: { label: "Agenda tu sesión", href: "#services" } },
  ] as unknown as BuilderNode[];
  const t = localiseSeededDesignLabels(edited, "es", "instant");
  assert.equal(props(t, 0).href, "/contact");
  assert.equal(props(t, 1).href, "#services");
  assert.equal(props(t, 1).label, "Agenda tu sesión");
});

test("a real posture resolves to the mode: instant, request (plan or hours ceiling), inquiry (message-first or paused)", () => {
  const base = { sellingDefaults: { bookingPosture: "instant" }, confirmsByHand: false };
  assert.equal(resolveSiteCtaMode(base), "instant");
  assert.equal(resolveSiteCtaMode({ ...base, confirmsByHand: true }), "request");
  assert.equal(resolveSiteCtaMode({ ...base, instantReady: false }), "request");
  assert.equal(resolveSiteCtaMode({ ...base, acceptingBookings: false }), "inquiry");
  assert.equal(resolveSiteCtaMode({ sellingDefaults: { bookingPosture: "inquiry" }, confirmsByHand: false }), "inquiry");
  assert.equal(mainCtaModeFromPosture("inquiry"), "message");
});
