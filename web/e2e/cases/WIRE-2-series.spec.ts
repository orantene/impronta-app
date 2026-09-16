/**
 * 2.1 New series + Generate sessions (W40/W10).
 * Ground truth: `session_series` row; sessions generated once, idempotent on
 * a second run. Refusal: a second series in the same room and window →
 * `overlapping_room`, and no second row.
 */
import { test, expect, prepareJourneysPage, signInJourneysStaff, skipUnlessFixture } from "./_harness";
import { isolatedService, JOURNEYS_TENANT_ID } from "./_isolated-db";
import { WIRE_SENTENCE, clickUntil } from "./_wire";

skipUnlessFixture();

const WEEKDAY_SHORT = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

async function fillSeries(page: import("@playwright/test").Page, input: { title: string; startsOn: string; endsOn: string; weekday: string; time: string }) {
  const editor = page.getByTestId("series-editor");
  await editor.getByTestId("series-title").fill(input.title);
  const dates = editor.locator('input[type="date"]');
  await dates.nth(0).fill(input.startsOn);
  await dates.nth(1).fill(input.endsOn);
  const day = editor.getByTestId("series-days").getByRole("button", { name: input.weekday, exact: true });
  if ((await day.getAttribute("aria-pressed")) !== "true") await day.click();
  // Only that weekday: switch every other one off.
  for (const other of WEEKDAY_SHORT.filter((d) => d !== input.weekday)) {
    const b = editor.getByTestId("series-days").getByRole("button", { name: other, exact: true });
    if ((await b.getAttribute("aria-pressed")) === "true") await b.click();
  }
  await editor.locator('input[type="time"]').fill(input.time);
  const firstValue = async (testId: string) => {
    const options = await editor.getByTestId(testId).locator("option").evaluateAll((els) => els.map((o) => (o as HTMLOptionElement).value));
    return options.find((v) => v.length > 0) ?? null;
  };
  const room = await firstValue("series-room");
  expect(room, "failed-fixture: no room to pick").toBeTruthy();
  await editor.getByTestId("series-room").selectOption(room!);
  const person = await firstValue("series-instructor");
  expect(person, "failed-fixture: no instructor to pick").toBeTruthy();
  await editor.getByTestId("series-instructor").selectOption(person!);
  await editor.getByTestId("series-seats").fill("5");
}

test("WIRE-2.1 new series generates sessions once; a second series in the same room is refused", async ({ page }) => {
  test.setTimeout(300_000);
  await prepareJourneysPage(page);
  const sb = isolatedService();
  const stamp = Date.now();
  const title = `WIRE series ${stamp}`;
  const start = new Date(Date.now() + 2 * 86_400_000);
  const end = new Date(start.getTime() + 13 * 86_400_000);
  const ymd = (d: Date) => d.toISOString().slice(0, 10);
  const weekday = WEEKDAY_SHORT[(start.getUTCDay() + 6) % 7];
  const time = "06:15";

  const seriesIds: string[] = [];
  try {
    await signInJourneysStaff(page, "/admin/appointments?view=series");
    await expect(page.getByTestId("appointments-tab-series")).toBeVisible({ timeout: 30_000 });
    await clickUntil(page.getByTestId("appointments-new-series"), page.getByTestId("series-editor"));
    await fillSeries(page, { title, startsOn: ymd(start), endsOn: ymd(end), weekday, time });
    await page.getByTestId("series-save").click();
    await expect(page.getByTestId("series-editor-message")).toHaveText("Series saved.", { timeout: 30_000 });

    const { data: series } = await sb.from("session_series").select("id, title, seats, weekdays, local_time").eq("tenant_id", JOURNEYS_TENANT_ID).eq("title", title).maybeSingle();
    expect(series, "session_series row").toBeTruthy();
    const seriesId = (series as { id: string }).id;
    seriesIds.push(seriesId);
    expect(Number((series as { seats: number }).seats)).toBe(5);

    // Generate: N created; again: 0 created, N reused; the count never doubles.
    await page.getByTestId("series-generate-until").fill(ymd(end));
    await page.getByTestId("series-generate").click();
    await expect(page.getByTestId("series-editor-message")).toContainText(/created/i, { timeout: 60_000 });
    const first = (await page.getByTestId("series-editor-message").textContent()) ?? "";
    const created = Number(/(\d+)\s*sessions? created/i.exec(first)?.[1] ?? "-1");
    expect(created, `first generate must create sessions: ${first}`).toBeGreaterThan(0);
    const countSessions = async () => {
      const { count } = await sb.from("sessions").select("id", { count: "exact", head: true }).eq("series_id", seriesId);
      return count ?? 0;
    };
    await expect.poll(countSessions, { timeout: 20_000 }).toBe(created);
    await page.getByTestId("series-generate").click();
    await expect(page.getByTestId("series-editor-message")).toHaveText(`0 sessions created, ${created} already existed.`, { timeout: 60_000 });
    expect(await countSessions()).toBe(created);

    // Refusal: the same room, day and time again.
    await page.getByTestId("series-editor-close").click();
    await clickUntil(page.getByTestId("appointments-new-series"), page.getByTestId("series-editor"));
    await fillSeries(page, { title: `${title} clash`, startsOn: ymd(start), endsOn: ymd(end), weekday, time });
    await page.getByTestId("series-save").click();
    await expect(page.getByTestId("series-editor-message")).toHaveText(WIRE_SENTENCE.overlappingRoom, { timeout: 30_000 });
    const { count: clash } = await sb.from("session_series").select("id", { count: "exact", head: true }).eq("tenant_id", JOURNEYS_TENANT_ID).eq("title", `${title} clash`);
    expect(clash).toBe(0);
  } finally {
    for (const id of seriesIds) {
      const { data: rows } = await sb.from("sessions").select("id").eq("series_id", id);
      const ids = ((rows ?? []) as { id: string }[]).map((r) => r.id);
      if (ids.length) {
        await sb.from("capacity_pools").delete().in("subject_id", ids);
        await sb.from("sessions").delete().in("id", ids);
      }
      await sb.from("session_series").delete().eq("id", id);
    }
  }
});
