/**
 * Wiring setup — turn every POS mode on for the fixture through Settings.
 */
import {
  test,
  expect,
  prepareJourneysPage,
  skipUnlessFixture,
} from "./_harness";
import { ALL_POS_MODES, enableAllPosModes, readEnabledPosModes } from "./_wire";

skipUnlessFixture();

test("WIRE-0: every POS mode is on for the fixture", async ({ page }) => {
  test.setTimeout(180_000);
  await prepareJourneysPage(page);
  await enableAllPosModes(page);
  const modes = await readEnabledPosModes();
  for (const mode of ALL_POS_MODES) {
    expect(modes, `mode ${mode} must be on`).toContain(mode);
  }
});
