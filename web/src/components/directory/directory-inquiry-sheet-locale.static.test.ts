/**
 * TUL-951: the hub/guest inquiry drawer must follow the PAGE language, not the
 * dashboard cookie. The sheet receives `locale` and must hand it to the drawer
 * through DashboardLocaleProvider.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "directory-inquiry-sheet.tsx"), "utf8");

test("DirectoryInquirySheet wraps its body in DashboardLocaleProvider with the page locale", () => {
  assert.match(src, /import \{ DashboardLocaleProvider \} from "@\/i18n\/use-dashboard-locale"/);
  assert.match(src, /<DashboardLocaleProvider locale=\{props\.locale\}>/);
  assert.match(src, /<DirectoryInquirySheetBody \{\.\.\.props\} \/>/);
});
