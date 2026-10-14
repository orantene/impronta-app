import test from "node:test";
import assert from "node:assert/strict";

import { withSoloProfileCopy } from "./solo-profile-copy";

const base = (key: string) => `base:${key}`;

test("TUL-707: independent profile drops agency wording in ES and EN", () => {
  const es = withSoloProfileCopy(base, "es");
  for (const key of [
    "public.profile.footerCtaBody",
    "public.profile.moreFromRoster",
    "public.profile.cta.contactImpronta",
  ]) {
    assert.doesNotMatch(es(key), /agencia|representado|roster|base:/i, key);
  }
  assert.match(withSoloProfileCopy(base, "en")("public.profile.cta.contactImpronta"), /directly/);
  assert.equal(es("public.other"), "base:public.other");
});
