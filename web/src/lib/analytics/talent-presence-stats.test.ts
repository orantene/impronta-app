import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildTalentPresenceStats,
  classifyReferrer,
  deltaPct,
  topPresenceSources,
} from "./talent-presence-stats";

const S30 = "2026-09-14T00:00:00.000Z";
const S60 = "2026-08-15T00:00:00.000Z";
const view = (created_at: string, referrer?: string) => ({
  created_at,
  payload: referrer === undefined ? {} : { referrer },
});

describe("classifyReferrer", () => {
  it("maps known hosts and treats empty as direct", () => {
    assert.equal(classifyReferrer("https://www.google.com.mx/search?q=x").key, "google");
    assert.equal(classifyReferrer("https://l.instagram.com/?u=1").key, "instagram");
    assert.equal(classifyReferrer("https://wa.me/52").key, "whatsapp");
    assert.equal(classifyReferrer("https://book-jor.tulala.digital/").key, "tulala");
    assert.equal(classifyReferrer("").key, "direct");
    assert.equal(classifyReferrer(undefined).key, "direct");
    assert.deepEqual(classifyReferrer("https://www.blog.example/x"), {
      key: "other",
      host: "blog.example",
    });
  });
});

describe("deltaPct", () => {
  it("is null on a zero baseline and rounds otherwise", () => {
    assert.equal(deltaPct(5, 0), null);
    assert.equal(deltaPct(15, 10), 50);
    assert.equal(deltaPct(5, 10), -50);
    assert.equal(deltaPct(0, 4), -100);
  });
});

describe("topPresenceSources", () => {
  it("ranks, limits to 3 and computes share", () => {
    const rows = [
      view("2026-09-20T00:00:00Z", "https://google.com"),
      view("2026-09-20T00:00:00Z", "https://google.com/x"),
      view("2026-09-20T00:00:00Z", "https://instagram.com"),
      view("2026-09-20T00:00:00Z"),
      view("2026-09-20T00:00:00Z", "https://a.example"),
    ];
    const top = topPresenceSources(rows, 3);
    assert.equal(top.length, 3);
    assert.equal(top[0].key, "google");
    assert.equal(top[0].visits, 2);
    assert.equal(top[0].sharePct, 40);
  });
});

describe("buildTalentPresenceStats", () => {
  it("slices windows and computes deltas", () => {
    const s = buildTalentPresenceStats({
      start30Iso: S30,
      start60Iso: S60,
      views: [
        view("2026-09-20T00:00:00Z", "https://google.com"),
        view("2026-09-21T00:00:00Z", "https://google.com"),
        view("2026-09-01T00:00:00Z"),
        view("2026-08-01T00:00:00Z"),
      ],
      requests: [{ created_at: "2026-09-20T00:00:00Z" }],
      confirmed: [{ created_at: "2026-09-01T00:00:00Z" }],
    });
    assert.deepEqual(s.last30d, { visits: 2, requests: 1, confirmed: 0 });
    assert.deepEqual(s.prior30d, { visits: 1, requests: 0, confirmed: 1 });
    assert.equal(s.deltaPct.visits, 100);
    assert.equal(s.deltaPct.requests, null);
    assert.equal(s.deltaPct.confirmed, -100);
    assert.equal(s.topSources[0].key, "google");
    assert.equal(s.isEmpty, false);
  });

  it("reports empty when there is no data", () => {
    const s = buildTalentPresenceStats({
      start30Iso: S30,
      start60Iso: S60,
      views: [],
      requests: [],
      confirmed: [],
    });
    assert.equal(s.isEmpty, true);
    assert.deepEqual(s.topSources, []);
  });
});

import { classifyUtmSource, classifyVisitSource } from "./talent-presence-stats";

describe("utm_source preference", () => {
  it("maps common aliases", () => {
    assert.equal(classifyUtmSource("ig")?.key, "instagram");
    assert.equal(classifyUtmSource("WhatsApp")?.key, "whatsapp");
    assert.equal(classifyUtmSource("wa")?.key, "whatsapp");
    assert.equal(classifyUtmSource("fb")?.key, "facebook");
    assert.deepEqual(classifyUtmSource("newsletter"), { key: "other", host: "newsletter" });
    assert.equal(classifyUtmSource(""), null);
    assert.equal(classifyUtmSource(undefined), null);
  });
  it("prefers utm_source over referrer, falls back to referrer", () => {
    assert.equal(classifyVisitSource({ utm_source: "ig", referrer: "https://google.com/" }).key, "instagram");
    assert.equal(classifyVisitSource({ referrer: "https://google.com/" }).key, "google");
    assert.equal(classifyVisitSource({}).key, "direct");
    assert.equal(classifyVisitSource(null).key, "direct");
  });
  it("groups stripped-referrer visits under the utm source", () => {
    const rows = [
      { created_at: "2026-10-01T00:00:00Z", payload: { utm_source: "ig" } },
      { created_at: "2026-10-02T00:00:00Z", payload: { utm_source: "instagram" } },
      { created_at: "2026-10-03T00:00:00Z", payload: {} },
    ];
    const top = topPresenceSources(rows);
    assert.equal(top[0].key, "instagram");
    assert.equal(top[0].visits, 2);
  });
});
