/**
 * CTA audit for the three gallery designs: each design's services_catalog
 * node carries no hardcoded CTA label, so every row follows the talent's
 * booking mode (instant / request / inquiry) and quote pricing.
 */
import test from "node:test";
import assert from "node:assert/strict";

import type { BuilderNode } from "@/lib/site-admin/builder-node/types";
import { catalogRowCtaLabel } from "@/components/public-booking/catalog-booking-logic";
import type { TalentBookingPosture } from "@/lib/talent/selling-booking-settings";
import { buildFolioPayload, buildMaisonV2Payload } from "./collection/designs";
import { buildMaisonDesignPayload } from "./maison/design-payload";

function findAll(nodes: readonly BuilderNode[], kind: string): BuilderNode[] {
  const out: BuilderNode[] = [];
  for (const n of nodes) {
    if (n.kind === kind) out.push(n);
    const kids = "children" in n && Array.isArray(n.children) ? (n.children as BuilderNode[]) : [];
    out.push(...findAll(kids, kind));
  }
  return out;
}

const DESIGNS = {
  maison: buildMaisonDesignPayload,
  "maison-v2": buildMaisonV2Payload,
  folio: buildFolioPayload,
} as const;

const service = {
  kind: "service" as const,
  bookingMode: null,
  priceType: "flat_package" as const,
  priceDisplay: "exact" as const,
  amountCents: 45000,
  visibility: "public" as const,
  variants: [],
  addOns: [],
  durationMinutes: 60,
};

const EXPECT: Record<TalentBookingPosture, { es: string; en: string }> = {
  instant: { es: "Seleccionar", en: "Select" },
  request: { es: "Solicitar cita", en: "Request appointment" },
  inquiry: { es: "Consultar", en: "Ask about this" },
};

for (const [slug, build] of Object.entries(DESIGNS)) {
  test(`${slug}: catalog CTA derives from booking mode`, () => {
    const p = build();
    const catalogs = findAll([...p.shellTree, ...p.homeTree], "services_catalog");
    assert.ok(catalogs.length >= 1, `${slug} has a services_catalog`);
    for (const c of catalogs) {
      const inspectorLabel = ((c.props as { ctaLabel?: string }).ctaLabel ?? "").trim();
      assert.equal(inspectorLabel, "", `${slug} catalog must not hardcode a CTA label`);
      for (const posture of Object.keys(EXPECT) as TalentBookingPosture[]) {
        for (const locale of ["es", "en"] as const) {
          const label = catalogRowCtaLabel({
            selected: false,
            offering: service,
            locale,
            inspectorLabel,
            bookingPosture: posture,
          });
          assert.equal(label, EXPECT[posture][locale], `${slug} ${posture} ${locale}`);
        }
      }
      // Quote-priced services ask for a quote in every mode.
      for (const posture of Object.keys(EXPECT) as TalentBookingPosture[]) {
        const label = catalogRowCtaLabel({
          selected: false,
          offering: { ...service, priceDisplay: "quote" as const, amountCents: null },
          locale: "es",
          inspectorLabel,
          bookingPosture: posture,
        });
        assert.equal(label, "Pedir cotización", `${slug} quote ${posture}`);
      }
      // Plan ceiling (confirms by hand) turns instant into a request.
      assert.equal(
        catalogRowCtaLabel({ selected: false, offering: service, locale: "es", inspectorLabel, bookingPosture: "instant", confirmsByHand: true }),
        "Solicitar cita",
      );
    }
  });

  test(`${slug}: no design button promises instant booking`, () => {
    const p = build();
    const buttons = findAll([...p.shellTree, ...p.homeTree], "button");
    for (const b of buttons) {
      const label = String((b.props as { label?: string }).label ?? "");
      assert.doesNotMatch(label, /\b(book now|reservar)\b/i, `${slug} button "${label}"`);
    }
  });
}
