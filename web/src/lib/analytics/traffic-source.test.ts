/**
 * F6: AI and search traffic measurement. Classes and names only; no full URL,
 * no query string, no raw utm token is ever stored (TUL-751).
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";

import {
  TRAFFIC_CHANNELS,
  classifyTrafficSource,
  groupTrafficChannels,
  referrerHost,
  trafficPayloadFields,
  utmSourceToken,
} from "./traffic-source";

const WEB = path.resolve(__dirname, "../../..");
const read = (p: string) => fs.readFileSync(path.join(WEB, p), "utf8");

test("AI assistants are recognised by referrer origin", () => {
  const cases: Array<[string, string]> = [
    ["https://chatgpt.com", "chatgpt"],
    ["https://chat.openai.com", "chatgpt"],
    ["https://www.perplexity.ai", "perplexity"],
    ["https://claude.ai", "claude"],
    ["https://gemini.google.com", "gemini"],
    ["https://copilot.microsoft.com", "copilot"],
    ["https://meta.ai", "meta-ai"],
  ];
  for (const [ref, source] of cases) assert.deepEqual(classifyTrafficSource({ referrer: ref }), { channel: "ai", source }, ref);
});

test("Gemini is AI even though it lives on a google.com host; plain Google is search", () => {
  assert.equal(classifyTrafficSource({ referrer: "https://gemini.google.com" }).channel, "ai");
  assert.deepEqual(classifyTrafficSource({ referrer: "https://www.google.com" }), { channel: "search", source: "google" });
  assert.deepEqual(classifyTrafficSource({ referrer: "https://www.google.com.mx" }), { channel: "search", source: "google" });
});

test("search, social and messaging", () => {
  assert.deepEqual(classifyTrafficSource({ referrer: "https://www.bing.com" }), { channel: "search", source: "bing" });
  assert.deepEqual(classifyTrafficSource({ referrer: "https://duckduckgo.com" }), { channel: "search", source: "duckduckgo" });
  assert.deepEqual(classifyTrafficSource({ referrer: "https://l.instagram.com" }), { channel: "social", source: "instagram" });
  assert.deepEqual(classifyTrafficSource({ referrer: "https://t.co" }), { channel: "social", source: "x" });
  assert.deepEqual(classifyTrafficSource({ referrer: "https://wa.me" }), { channel: "messaging", source: "whatsapp" });
});

test("utm_source names the source when the referrer is missing (assistants tag their links)", () => {
  assert.deepEqual(classifyTrafficSource({ utmSource: "chatgpt.com" }), { channel: "ai", source: "chatgpt" });
  assert.deepEqual(classifyTrafficSource({ utmSource: "Perplexity" }), { channel: "ai", source: "perplexity" });
  // The link's own word beats a generic referrer.
  assert.deepEqual(classifyTrafficSource({ utmSource: "chatgpt.com", referrer: "https://www.google.com" }), { channel: "ai", source: "chatgpt" });
});

test("unknown or junk utm_source is ignored, never echoed", () => {
  for (const utm of ["mybigcampaign", "a b", "https://evil.test/x?token=1", "", null, 42, "x".repeat(80)]) {
    const r = classifyTrafficSource({ utmSource: utm });
    assert.deepEqual(r, { channel: "direct", source: "direct" });
  }
  assert.doesNotMatch(JSON.stringify(classifyTrafficSource({ utmSource: "mybigcampaign", referrer: "https://news.test/a?token=SECRET" })), /SECRET|mybigcampaign/);
});

test("own domains are internal, other sites are other, nothing is direct", () => {
  assert.deepEqual(classifyTrafficSource({ referrer: "https://luna.tulala.digital" }), { channel: "internal", source: "internal" });
  assert.deepEqual(classifyTrafficSource({ referrer: "https://shop.test", ownHosts: ["shop.test"] }), { channel: "internal", source: "internal" });
  assert.deepEqual(classifyTrafficSource({ referrer: "https://blog.example.org" }), { channel: "other", source: "other" });
  assert.deepEqual(classifyTrafficSource({ referrer: "" }), { channel: "direct", source: "direct" });
  assert.deepEqual(classifyTrafficSource({ referrer: "android-app://com.google.android.gm" }), { channel: "direct", source: "direct" });
});

test("what is stored is two fixed words, never a URL or a query string", () => {
  const stored = trafficPayloadFields(classifyTrafficSource({ referrer: "https://chatgpt.com/c/abc?code=SECRET", utmSource: "chatgpt.com" }));
  assert.deepEqual(stored, { traffic_channel: "ai", traffic_source: "chatgpt" });
  assert.doesNotMatch(JSON.stringify(stored), /SECRET|\/c\/|\?|https?:/);
  assert.equal(referrerHost("https://www.Example.com/a?b=1"), "example.com");
  assert.equal(referrerHost("not a url"), null);
});

test("utm token from a query string: plain short tokens only", () => {
  assert.equal(utmSourceToken("?utm_source=ChatGPT.com&x=1"), "chatgpt.com");
  assert.equal(utmSourceToken("?utm_source=a%20b"), null);
  assert.equal(utmSourceToken("?utm_source=" + "z".repeat(60)), null);
  assert.equal(utmSourceToken("?foo=1"), null);
  assert.equal(utmSourceToken(null), null);
});

test("reporting: channels with their sources; history without a stored class is classified from the referrer", () => {
  const rows = [
    { payload: { traffic_channel: "ai", traffic_source: "chatgpt" } },
    { payload: { traffic_channel: "ai", traffic_source: "chatgpt" } },
    { payload: { traffic_channel: "ai", traffic_source: "claude" } },
    { payload: { traffic_channel: "search", traffic_source: "google" } },
    { payload: { referrer: "https://www.bing.com" } },
    { payload: { referrer: "https://perplexity.ai" } },
    { payload: {} },
    { payload: null },
    { payload: { traffic_channel: "evil", traffic_source: "x y" } },
  ];
  const out = groupTrafficChannels(rows);
  const ai = out.find((c) => c.channel === "ai");
  assert.equal(ai?.visits, 4);
  assert.deepEqual(ai?.sources, [
    { source: "chatgpt", visits: 2 },
    { source: "claude", visits: 1 },
    { source: "perplexity", visits: 1 },
  ]);
  assert.equal(out.find((c) => c.channel === "search")?.visits, 2);
  // Junk stored values never become a channel.
  assert.ok(out.every((c) => (TRAFFIC_CHANNELS as readonly string[]).includes(c.channel)));
  assert.equal(out.reduce((n, c) => n + c.visits, 0), rows.length);
  assert.equal(out[0].channel, "ai");
  assert.equal(out[0].sharePct, Math.round((4 / rows.length) * 100));
  assert.deepEqual(groupTrafficChannels([]), []);
});

test("wiring: the events route stamps the class last and stores no token; the client sends only the token", () => {
  const route = read("src/app/api/analytics/events/route.ts");
  assert.match(route, /classifyTrafficSource\(\{ referrer: safeReferrer, utmSource: utm_source/);
  assert.match(route, /\.\.\.traffic,\n  \};/);
  const mergedBlock = route.slice(route.indexOf("const mergedPayload"), route.indexOf("// `talent_id` belongs"));
  assert.doesNotMatch(mergedBlock, /utm_source/);
  const client = read("src/lib/analytics/track-client.ts");
  assert.match(client, /utmSourceToken\(window\.location\?\.search/);
  assert.doesNotMatch(client, /location\.href|location\.search\s*[,}]/);
});
