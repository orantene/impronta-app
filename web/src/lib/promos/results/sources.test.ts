import { test } from "node:test";
import assert from "node:assert/strict";

import { formatSources } from "./sources";

test("groups story+post and qr+print, biggest first, other last", () => {
  const r = formatSources({ ig_story: 2, ig_post: 1, qr: 1, qr_print: 1, wa: 4, unknown: 9, zzz: 1 }, "en");
  assert.deepEqual(r.map((s) => [s.key, s.count]), [["whatsapp", 4], ["instagram", 3], ["qr", 2], ["other", 10]]);
  assert.equal(r[1]!.label, "Instagram");
});

test("empty and zero counts yield nothing; labels follow language", () => {
  assert.deepEqual(formatSources({}, "es"), []);
  assert.deepEqual(formatSources({ wa: 0 }, "es"), []);
  assert.equal(formatSources({ site: 1 }, "es")[0]!.label, "Tu sitio");
});
