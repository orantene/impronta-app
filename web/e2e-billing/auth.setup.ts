/**
 * Setup project: signs the QA talent (TAL-93900) in once and stores the
 * session. With no credentials it writes an empty state so signed-in
 * scenarios skip cleanly instead of failing.
 */
import { test as setup } from "@playwright/test";
import { AUTH_FILE, hasQaCreds, signIn, writeEmptyAuthState } from "./helpers";

setup("sign in QA talent", async ({ page }) => {
  if (!hasQaCreds()) {
    writeEmptyAuthState();
    return;
  }
  await signIn(page);
  await page.context().storageState({ path: AUTH_FILE });
});
