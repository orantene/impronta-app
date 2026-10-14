/**
 * TUL-16e follow-up: the agency footer and the hub /t/[profileCode] footer
 * build their Tulala links from the resolved marketing origin, so a staging
 * deploy never links to the production apex.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { buildAgencySocketModel } from "./footer-socket";

const STAGING = "https://staging.example.test";

function hrefs(m: ReturnType<typeof buildAgencySocketModel>): string[] {
  return JSON.stringify(m).match(/https?:\/\/[^"\\]+/g) ?? [];
}

test("agency socket model: marketingOrigin moves legal and credit links", () => {
  const urls = hrefs(
    buildAgencySocketModel({ locale: "es", whitelabel: false, footerLinks: [], marketingOrigin: STAGING }),
  );
  assert.ok(urls.length > 0);
  for (const u of urls) assert.ok(!u.startsWith("https://tulala.digital"), u);
  assert.ok(urls.some((u) => u.startsWith(STAGING)));
});

test("agency socket model: no origin keeps production", () => {
  const urls = hrefs(buildAgencySocketModel({ locale: "en", whitelabel: false, footerLinks: [] }));
  assert.ok(urls.some((u) => u.startsWith("https://tulala.digital")));
});

test("both footer renderers pass resolveMarketingOrigin()", () => {
  for (const f of ["src/components/agency-footer-socket.tsx", "src/app/t/[profileCode]/_shared/ProfileFooterSocket.tsx"]) {
    const src = readFileSync(join(process.cwd(), f), "utf8");
    assert.match(src, /marketingOrigin: resolveMarketingOrigin\(\)/, f);
  }
});
