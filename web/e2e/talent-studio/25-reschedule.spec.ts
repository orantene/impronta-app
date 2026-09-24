import { test } from "@playwright/test";
import { walkTalentJourney } from "./_journey";

for (const width of [1440, 390] as const) {
  test("25-reschedule at " + width, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 1440 ? 900 : 844 });
    await walkTalentJourney(page, "/talent/calendar", "Calendar");
  });
}
