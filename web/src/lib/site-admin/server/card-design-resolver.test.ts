import assert from "node:assert/strict";
import { test } from "node:test";

import {
  CARD_DESIGN_DEFAULT_FAMILY,
  CARD_DESIGN_FAMILIES,
  DEFAULT_CARD_DESIGN,
  cardDesignToCssVars,
  projectCardDesign,
  type CardDesign,
} from "./card-design-shape";
import {
  attachCardDesigns,
  resolveCardDesignsForRows,
} from "@/components/marketing/directory/shared";

// --- projection (pure) -----------------------------------------------------

test("projectCardDesign reads the card subset from live theme_json", () => {
  const design = projectCardDesign({
    "template.directory-card-family": "editorial-noir",
    "card.surface": "#0f0f0f",
    "card.name-color": "#f4f1ea",
    "card.muted": "#8a8478",
    // unrelated tokens are ignored
    "color.primary": "#123456",
  });
  assert.deepEqual(design, {
    family: "editorial-noir",
    surface: "#0f0f0f",
    nameColor: "#f4f1ea",
    muted: "#8a8478",
  });
});

test("projectCardDesign defaults the family and omits unset/blank colors", () => {
  assert.deepEqual(projectCardDesign({}), {
    family: CARD_DESIGN_DEFAULT_FAMILY,
  });
  assert.deepEqual(projectCardDesign(null), {
    family: CARD_DESIGN_DEFAULT_FAMILY,
  });
  // blank string color → omitted (so the cascade fallback inherits the theme)
  const blank = projectCardDesign({
    "template.directory-card-family": "magazine",
    "card.surface": "   ",
  });
  assert.equal(blank.family, "magazine");
  assert.equal("surface" in blank, false);
});

test("projectCardDesign rejects an unknown family → classic default", () => {
  const design = projectCardDesign({
    "template.directory-card-family": "not-a-real-family",
  });
  assert.equal(design.family, CARD_DESIGN_DEFAULT_FAMILY);
});

test("cardDesignToCssVars emits only the set colors", () => {
  assert.deepEqual(
    cardDesignToCssVars({
      family: "editorial-noir",
      surface: "#0f0f0f",
      nameColor: "#f4f1ea",
      muted: "#8a8478",
    }),
    {
      "--token-card-surface": "#0f0f0f",
      "--token-card-name-color": "#f4f1ea",
      "--token-card-muted": "#8a8478",
    },
  );
  // default design pins no card vars (everything inherits the theme)
  assert.deepEqual(cardDesignToCssVars(DEFAULT_CARD_DESIGN), {});
});

// --- per-row cross-tenant resolution ---------------------------------------

test("two rows from two tenants get two DIFFERENT design objects", async () => {
  const themeByTenant: Record<string, Record<string, string>> = {
    "tenant-noir": {
      "template.directory-card-family": "editorial-noir",
      "card.surface": "#0f0f0f",
      "card.name-color": "#f4f1ea",
    },
    "tenant-mag": {
      "template.directory-card-family": "magazine",
      "card.surface": "#f4f1ea",
      "card.name-color": "#171717",
    },
  };
  const resolve = async (tenantId: string): Promise<CardDesign> =>
    projectCardDesign(themeByTenant[tenantId] ?? null);

  const rows = [
    { agencyTenantId: "tenant-noir" },
    { agencyTenantId: "tenant-mag" },
  ];
  const byTenant = await resolveCardDesignsForRows(rows, resolve);

  const noir = byTenant.get("tenant-noir");
  const mag = byTenant.get("tenant-mag");
  assert.ok(noir && mag);
  assert.notDeepEqual(noir, mag);
  assert.equal(noir.family, "editorial-noir");
  assert.equal(noir.surface, "#0f0f0f");
  assert.equal(mag.family, "magazine");
  assert.equal(mag.surface, "#f4f1ea");
});

test("resolveCardDesignsForRows resolves each DISTINCT tenant exactly once", async () => {
  const calls: string[] = [];
  const resolve = async (tenantId: string): Promise<CardDesign> => {
    calls.push(tenantId);
    return { family: "classic" };
  };
  const rows = [
    { agencyTenantId: "t1" },
    { agencyTenantId: "t1" }, // duplicate tenant → resolved once
    { agencyTenantId: "t2" },
    { agencyTenantId: null }, // independents → skipped, never resolved
  ];
  const byTenant = await resolveCardDesignsForRows(rows, resolve);
  assert.deepEqual(calls.sort(), ["t1", "t2"]);
  assert.equal(byTenant.size, 2);
});

test("attachCardDesigns rides each row's design along; independents fall back", () => {
  const byTenant = new Map<string, CardDesign>([
    ["t1", { family: "editorial-noir", surface: "#0f0f0f" }],
  ]);
  const rows: Array<{
    id: string;
    agencyTenantId: string | null;
    design?: CardDesign;
  }> = [
    { id: "a", agencyTenantId: "t1" },
    { id: "b", agencyTenantId: "t2" }, // not in map
    { id: "c", agencyTenantId: null }, // independent
  ];
  const out = attachCardDesigns(rows, byTenant);
  assert.equal(out[0].design?.family, "editorial-noir");
  assert.equal(out[1].design, undefined);
  assert.equal(out[2].design, undefined);
});

// --- registry parity guard -------------------------------------------------

test("CARD_DESIGN_FAMILIES matches the registry's directory-card-family enum", async () => {
  // Imported lazily so the pure shape module itself never pulls the registry
  // into the client bundle — this is a server/test-only parity check.
  const { TOKEN_REGISTRY } = await import("@/lib/site-admin/tokens/registry");
  const spec = TOKEN_REGISTRY["template.directory-card-family"];
  assert.ok(spec, "template.directory-card-family must exist in the registry");
  for (const family of CARD_DESIGN_FAMILIES) {
    assert.ok(
      spec.validator.safeParse(family).success,
      `family '${family}' is not a valid registry value`,
    );
  }
  // classic must be a real family (it's the resolver fallback)
  assert.ok(CARD_DESIGN_FAMILIES.includes(CARD_DESIGN_DEFAULT_FAMILY));
});
