// Website settings must load ONCE. QA 2026-09-29: an unstable `t` in the
// loader effect's deps re-ran every server-action load on every render
// (34+ POST /talent/site in seconds) and the screen sat on "Loading…".
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, screen, waitFor } from "@testing-library/react";

import { testRender } from "../../helpers/test-render";

const calls = vi.hoisted(() => ({ defaults: 0, offerings: 0, switches: 0, languages: 0 }));

vi.mock("@/lib/talent/services-settings-actions", () => ({
  loadSellingDefaults: vi.fn(async () => {
    calls.defaults += 1;
    return { ok: true, defaults: { bookingPosture: "request" } };
  }),
  saveSellingDefaults: vi.fn(),
}));
vi.mock("@/lib/talent/offerings-actions", () => ({
  loadTalentOfferingsForEditor: vi.fn(async () => {
    calls.offerings += 1;
    return { ok: true, items: [] };
  }),
}));
vi.mock("@/lib/talent/offering-booking-rules-action", () => ({ patchOfferingBookingRules: vi.fn() }));
vi.mock("@/components/talent/website-settings/website-settings-gate-action", () => ({
  loadHoursMinNoticeAction: vi.fn(async () => null),
}));
vi.mock("@/components/talent/website-settings/website-settings-switches-action", () => ({
  loadSiteSwitchesAction: vi.fn(async () => {
    calls.switches += 1;
    return null;
  }),
  saveSiteSwitchesAction: vi.fn(),
}));
vi.mock("@/lib/server-actions/talent-self", () => ({
  loadTalentLanguages: vi.fn(async () => {
    calls.languages += 1;
    return { ok: true, data: { storedPrimary: "es", primary: "es", secondary: [], platformDefaultLocale: "en", options: [] } };
  }),
  updateTalentLanguages: vi.fn(),
}));
vi.mock("@/lib/talent/translation-coverage-actions", () => ({
  loadTranslationCoverage: vi.fn(async () => ({ ok: false })),
  suggestTalentPrimaryLocaleAction: vi.fn(async () => null),
}));
vi.mock("@/components/talent/site/TalentMaxSiteSettingsPanels", () => ({ MaxSiteSettingsPanels: () => null }));
vi.mock("@/components/admin/shell/internal/state", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  useAdminShell: () => ({ toast: vi.fn() }),
}));

import { WebsiteSettingsScreen } from "@/components/talent/website-settings/WebsiteSettingsScreen";

afterEach(cleanup);

describe("WebsiteSettingsScreen loader", () => {
  it("loads each source once and leaves the loading state", async () => {
    testRender(<WebsiteSettingsScreen talentId="t1" onClose={() => {}} />);
    await waitFor(() => expect(screen.queryByText("Loading…")).toBeNull());
    await new Promise((r) => setTimeout(r, 50));
    expect(calls).toEqual({ defaults: 1, offerings: 1, switches: 1, languages: 1 });
  });
});
