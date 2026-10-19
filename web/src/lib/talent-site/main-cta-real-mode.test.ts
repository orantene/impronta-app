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
import { mainCtaLabel, mainCtaModeFromPosture, mainCtaModeFromSiteMode } from "./main-cta";

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

const MODES: Array<[SiteCtaMode, "instant" | "request" | "message" | "buy"]> = [
  ["instant", "instant"],
  ["request", "request"],
  ["inquiry", "message"],
  ["buy", "buy"],
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
  assert.equal(props(localiseSeededDesignLabels(tree(), "es", "request"), 0).label, "Solicitar cita");
  assert.equal(props(localiseSeededDesignLabels(tree(), "en", "request"), 0).label, "Request an appointment");
  assert.equal(props(localiseSeededDesignLabels(tree(), "es", "buy"), 0).label, "Comprar");
  assert.equal(props(localiseSeededDesignLabels(tree(), "en", "buy"), 0).label, "Buy");
});

test("buy mode never falls back to booking wording and opens the catalog (#services), not #book", () => {
  for (const loc of ["es", "en"] as const) {
    const t = localiseSeededDesignLabels(tree(), loc, "buy");
    assert.doesNotMatch(props(t, 0).label, /book|reserv|solicit|request/i);
    assert.equal(props(t, 0).href, "#services");
    assert.equal(hdr(t).primaryCta.href, "#services");
  }
});

test("a null mode (mode unknown) never retargets the anchor", () => {
  const t = localiseSeededDesignLabels(tree(), "es", null);
  assert.equal(props(t, 0).href, "#services");
  assert.equal(hdr(t).primaryCta.href, "#services");
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
  const typed = ["Agenda tu sesión", "Message me", "Comprar", "Buy", "Reservar cita", "Solicitar cita", "Request an appointment", "Escríbeme"];
  const edited = [
    { id: "a", kind: "button", props: { label: "Book an appointment", href: "/contact" } },
    ...typed.map((label, i) => ({ id: `t${i}`, kind: "button", props: { label, href: "#services" } })),
  ] as unknown as BuilderNode[];
  for (const mode of ["instant", "request", "inquiry", "buy"] as SiteCtaMode[]) {
    const t = localiseSeededDesignLabels(edited, "es", mode);
    assert.equal(props(t, 0).href, "/contact");
    typed.forEach((label, i) => {
      assert.equal(props(t, i + 1).href, "#services", `${mode}: ${label} href`);
      if (label === "Agenda tu sesión") assert.equal(props(t, i + 1).label, label);
    });
  }
});

test("a real posture resolves to the mode: instant, request (plan or hours ceiling), inquiry (message-first or paused)", () => {
  const base = { sellingDefaults: { bookingPosture: "instant" }, confirmsByHand: false };
  assert.equal(resolveSiteCtaMode(base), "instant");
  assert.equal(resolveSiteCtaMode({ ...base, confirmsByHand: true }), "request");
  assert.equal(resolveSiteCtaMode({ ...base, instantReady: false }), "request");
  assert.equal(resolveSiteCtaMode({ ...base, acceptingBookings: false }), "inquiry");
  assert.equal(resolveSiteCtaMode({ sellingDefaults: { bookingPosture: "inquiry" }, confirmsByHand: false }), "inquiry");
  assert.equal(mainCtaModeFromPosture("inquiry"), "message");
  assert.equal(mainCtaModeFromSiteMode("buy"), "buy");
  assert.equal(mainCtaModeFromSiteMode("inquiry"), "message");
});

test("a talent selling goods or packages resolves to buy; services or a pause do not", () => {
  const base = { sellingDefaults: { bookingPosture: "instant" }, confirmsByHand: false };
  assert.equal(resolveSiteCtaMode({ ...base, sellsGoods: true }), "buy");
  assert.equal(resolveSiteCtaMode({ ...base, sellsGoods: true, acceptingBookings: false }), "buy", "a shop is not a booking pause");
  assert.equal(resolveSiteCtaMode({ ...base, sellsGoods: false }), "instant");
  assert.equal(resolveSiteCtaMode(base), "instant");
});
