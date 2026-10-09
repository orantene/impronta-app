/**
 * The 18+ confirmation (owner decision 2026-10-01) gates the "Guardar y construir" button on every talent
 * path (myself, both). One helper for every onboarding spec, so the selector lives in one place:
 * tick the box when it shows, require the build button to turn ENABLED, then click it.
 *
 * Only locator methods are used (no `expect`), so the logic is unit-testable with fakes
 * (src/lib/onboarding/e2e-age18.test.ts). The tick and the enabled check retry together because the ready
 * screen re-renders while the link and age lookups settle, which can drop a tick made too early.
 */
export type AgeLocator = {
  waitFor(opts: { state: "visible"; timeout: number }): Promise<unknown>;
  isVisible(): Promise<boolean>;
  isChecked(): Promise<boolean>;
  check(): Promise<unknown>;
};
export type BuildLocator = {
  isEnabled(): Promise<boolean>;
  click(): Promise<unknown>;
};
export type AgePage = { getByTestId(id: string): unknown };

export const AGE18_CHECKBOX_TESTID = "onb-age18-checkbox";
export const BUILD_BUTTON_TESTID = "onb-build";

export async function confirmAge18AndBuild(
  page: AgePage,
  opts: { settleMs?: number; pollMs?: number } = {},
): Promise<void> {
  const age = page.getByTestId(AGE18_CHECKBOX_TESTID) as AgeLocator;
  const build = page.getByTestId(BUILD_BUTTON_TESTID) as BuildLocator;
  const settleMs = opts.settleMs ?? 20_000;
  const pollMs = opts.pollMs ?? 250;
  // The checkbox renders once the age lookup settles; talent-less (studio) paths never show it.
  await age.waitFor({ state: "visible", timeout: Math.min(8_000, settleMs) }).catch(() => undefined);
  const deadline = Date.now() + settleMs;
  for (;;) {
    if ((await age.isVisible().catch(() => false)) && !(await age.isChecked().catch(() => false))) {
      await age.check();
    }
    if (await build.isEnabled().catch(() => false)) break;
    if (Date.now() >= deadline) {
      throw new Error(`the "${BUILD_BUTTON_TESTID}" button never turned enabled within ${settleMs} ms (18+ box ticked: ${await age.isChecked().catch(() => "n/a")})`);
    }
    await new Promise((r) => setTimeout(r, pollMs));
  }
  await build.click();
}
