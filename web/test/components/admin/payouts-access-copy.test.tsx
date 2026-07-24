// Contract test for the Payouts access-denied string.
//
// Two ways this silently regresses, both of which a user hit in production:
//
//   1. The copy drifts back to saying "admin". The payouts gate is
//      `agency.payout_account.manage`, which lives in OWNER_CAPS (not
//      ADMIN_CAPS) in lib/access/roles.ts — so telling a workspace *admin*
//      that the page is "workspace admin only" describes a permission they
//      appear to hold, and reads as a broken page rather than a role boundary.
//   2. The Spanish translation is keyed on the exact English string. Edit the
//      server copy without editing the dictionary key and the message silently
//      falls back to English inside a Spanish workspace — which is exactly how
//      it shipped: an English permission error on an otherwise Spanish page.
import { describe, expect, it } from "vitest";
import { PAYOUTS_OWNER_ONLY_ERROR } from "@/app/(workspace)/[tenantSlug]/admin/payouts/payouts-access-copy";
import { translateDashboardText } from "@/components/admin/shell/internal/dashboard-i18n";

describe("Payouts access-denied copy", () => {
  it("names the owner, not the admin", () => {
    expect(PAYOUTS_OWNER_ONLY_ERROR).toMatch(/owner/i);
    expect(PAYOUTS_OWNER_ONLY_ERROR).not.toMatch(/admin/i);
  });

  it("has a Spanish translation keyed on the exact server string", () => {
    const es = translateDashboardText(PAYOUTS_OWNER_ONLY_ERROR, "es");
    // `translateDashboardText` is identity on a dictionary miss, so "unchanged"
    // is precisely the key-drift failure this test exists to catch.
    expect(es).not.toBe(PAYOUTS_OWNER_ONLY_ERROR);
    expect(es).toMatch(/propietaria/i);
  });
});
