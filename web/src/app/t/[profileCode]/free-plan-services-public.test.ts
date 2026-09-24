/**
 * A free talent's services and prices are public on every profile template.
 * Maison already did this; Atelier, Light, Lumen and Noir used to hide them.
 * This file fails if any of the five layouts regrows that gate.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { ServiceMenuBlock } from "./_light/ServiceMenuBlock";
import type { ServiceMenuItem } from "@/lib/talent/services-menu-types";

const here = dirname(fileURLToPath(import.meta.url));

const LAYOUTS = [
  "_atelier/AtelierProfileLayout.tsx",
  "_light/LightProfileLayout.tsx",
  "_lumen/LumenProfileLayout.tsx",
  "_maison/MaisonProfileLayout.tsx",
  "_noir/NoirProfileLayout.tsx",
] as const;

const SERVICE_GATE = /isFreePlan\s*\?\s*\[\s*\]|!\s*isFreePlan\s*&&/;

const SERVICE_NAME = "Gel semipermanente";

const menuItem: ServiceMenuItem = {
  id: "svc-gel",
  name: SERVICE_NAME,
  description: null,
  pricingType: "flat_package",
  amountCents: 30000,
  currency: "MXN",
  taxonomyTermIds: null,
  addOns: [],
  tiers: [],
  isActive: true,
  visibility: "public",
  sortOrder: 0,
  isInstantBook: false,
  childServiceIds: null,
};

describe("free-plan services stay public on every profile template", () => {
  for (const rel of LAYOUTS) {
    it(`${rel} does not gate services or the storefront on isFreePlan`, () => {
      const src = readFileSync(join(here, rel), "utf8");
      assert.equal(
        SERVICE_GATE.test(src),
        false,
        `${rel} hid services or the storefront behind isFreePlan`,
      );
    });
  }

  it("Maison has no isFreePlan at all", () => {
    const src = readFileSync(join(here, "_maison/MaisonProfileLayout.tsx"), "utf8");
    assert.equal(src.includes("isFreePlan"), false, "Maison grew an isFreePlan gate");
  });

  it("the menu block prints a free talent's service name", () => {
    const html = renderToStaticMarkup(
      createElement(ServiceMenuBlock, {
        items: [menuItem],
        locale: "es",
        heading: "Servicios y precios",
      }),
    );
    const visible = html.replace(/<[^>]+>/g, " ");
    assert.match(visible, /Gel semipermanente/);
  });
});
