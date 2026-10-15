import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

import { isPathAllowedForHostKind } from "@/lib/saas/gate";
import { agencyContactHref } from "./agency-contact-href";

describe("agencyContactHref", () => {
  it("hub hosts get an absolute marketing URL (relative /contact 404s there)", () => {
    assert.equal(isPathAllowedForHostKind("hub", "/contact"), false);
    const href = agencyContactHref("/t/TAL-00031", { profileCode: "TAL-00031", hostKind: "hub" });
    assert.match(href, /^https:\/\/tulala\.digital\/contact\?/);
    assert.match(href, /source=hub-profile/);
    assert.match(href, /code=TAL-00031/);
    assert.equal(agencyContactHref("/es/t/TAL-00031", { hostKind: "hub" }), "https://tulala.digital/es/contact");
  });

  it("unknown host kind falls back to the absolute URL", () => {
    assert.match(agencyContactHref("/t/X"), /^https:\/\/tulala\.digital\/contact$/);
  });

  it("relative only where reachable: agency (CMS rewrite) and marketing (allow-list)", () => {
    assert.equal(isPathAllowedForHostKind("marketing", "/contact"), true);
    assert.equal(agencyContactHref("/t/TAL-00031", { hostKind: "agency" }), "/contact");
    assert.equal(agencyContactHref("/es/t/TAL-00031", { hostKind: "marketing" }), "/es/contact");
    const href = agencyContactHref("/t/TAL-00031", { profileCode: "TAL-00031", hostKind: "agency" });
    assert.match(href, /^\/contact\?.*source=hub-profile.*code=TAL-00031/);
  });
});

describe("ProfileDiscoveryCta footer (GRK-050)", () => {
  it("Contact the agency is a /contact link, not ContactTalentButton/chat", () => {
    const src = readFileSync(
      path.join(
        process.cwd(),
        "src/components/directory/profile-discovery-cta.tsx",
      ),
      "utf8",
    );
    assert.match(src, /agencyContactHref/);
    assert.match(src, /contactImpronta/);
    // Footer must not wire the agency-contact label through the inquiry button.
    const footerBlock = src.slice(src.lastIndexOf("return ("));
    assert.doesNotMatch(
      footerBlock,
      /ContactTalentButton[\s\S]*contactImpronta|contactImpronta[\s\S]*ContactTalentButton/,
    );
  });
});
