import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

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

// TUL-582: a Gratis talent sees no "Mi presencia" card on Hoy and a Pro prompt
// on the profile. That is plan gating by design, not a missing card: the whole
// analytics payload (and so the presence model) is withheld below pro/max, and
// the card renders nothing without it. Pinned so a refactor cannot either leak
// the numbers to Gratis or hide them from Pro.
describe("presence card plan gating (TUL-582)", () => {
  const read = (...p: string[]) => readFileSync(join(process.cwd(), ...p), "utf8");

  it("analytics are entitled to pro and max only", () => {
    const src = read("src", "lib", "analytics", "talent-analytics.ts");
    assert.match(src, /return tier === "pro" \|\| tier === "max";/);
    assert.match(src, /if \(!talentTierHasPageAnalytics\(owned\.tier\)\) return null;/);
  });

  it("the Hoy card renders nothing without the presence model and is mounted on Hoy", () => {
    const card = read("src", "components", "admin", "shell", "internal", "talent", "shared", "presence-stats-card.tsx");
    assert.match(card, /if \(talentTier !== "free"\) return null;/);
    assert.match(card, /Pro and Max plans/);
    assert.match(card, /planes Pro y Max/);
    const today = read("src", "components", "admin", "shell", "internal", "talent", "pages", "TodayPage.tsx");
    assert.match(today, /<TalentPresenceStatsCard \/>/);
  });
});
