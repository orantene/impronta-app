import assert from "node:assert/strict";
import test from "node:test";

import { talentSiteSourceLine } from "./talent-site-source-line";

test("own talent site only", () => {
  const ts = { host_kind: "talent_site" };
  assert.equal(talentSiteSourceLine({ sourceContext: ts, originDomain: "jor.com", locale: "es" }), "Este cliente llegó desde tu sitio web (jor.com).");
  assert.equal(talentSiteSourceLine({ sourceContext: ts, originDomain: "jor.com", locale: "en" }), "This client came from your website (jor.com).");
  assert.equal(talentSiteSourceLine({ sourceContext: ts, locale: "en" }), "This client came from your website.");
  assert.equal(talentSiteSourceLine({ sourceContext: { host_kind: "hub" } }), null);
  assert.equal(talentSiteSourceLine({ sourceContext: { host_kind: "agency" } }), null);
  assert.equal(talentSiteSourceLine({ sourceContext: null }), null);
});
