/**
 * TUL-1326: the per-site AI toggle also gates the JSON and markdown endpoints.
 * AI bots are refused when access is OFF or unreadable; everyone else is untouched.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";

import { AI_BOT_USER_AGENTS, aiReadVerdict, isAiBotUserAgent } from "./ai-bot-gate";
import { aiReadVerdictForRequest, readAiAccessFlag } from "./ai-bot-gate.server";

const WEB = path.resolve(__dirname, "../../..");
const read = (p: string) => fs.readFileSync(path.join(WEB, p), "utf8");

const BROWSER = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1";
const CHATGPT = "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; ChatGPT-User/1.0; +https://openai.com/bot";

test("AI bots are recognised by token, case-insensitively; browsers and search engines are not", () => {
  for (const bot of AI_BOT_USER_AGENTS) {
    assert.equal(isAiBotUserAgent(`Mozilla/5.0 (compatible; ${bot}/1.2; +https://x.test)`), true, bot);
    assert.equal(isAiBotUserAgent(bot.toUpperCase()), true, bot);
  }
  for (const ua of [BROWSER, "Googlebot/2.1 (+http://www.google.com/bot.html)", "bingbot/2.0", "curl/8.4.0", "", null, undefined]) {
    assert.equal(isAiBotUserAgent(ua), false, String(ua));
  }
});

test("the list covers the training and the answer agents named on the card", () => {
  for (const ua of ["GPTBot", "ClaudeBot", "Google-Extended", "CCBot", "Bytespider", "OAI-SearchBot", "ChatGPT-User", "PerplexityBot", "Claude-SearchBot", "Claude-User"]) {
    assert.ok(AI_BOT_USER_AGENTS.includes(ua), ua);
  }
});

test("verdict: an AI bot needs an explicit ON; OFF and unreadable are refused; everyone else is allowed whatever the flag", () => {
  assert.equal(aiReadVerdict(CHATGPT, true), "allow");
  assert.equal(aiReadVerdict(CHATGPT, false), "refuse");
  assert.equal(aiReadVerdict(CHATGPT, null), "refuse");
  for (const flag of [true, false, null]) {
    assert.equal(aiReadVerdict(BROWSER, flag), "allow");
    assert.equal(aiReadVerdict(null, flag), "allow");
  }
});

// ─── the server half, against a recording fake ────────────────────────────────

function fakeAdmin(result: { data: unknown; error: unknown } | "throw") {
  const calls: Array<{ table: string; col: string; val: string }> = [];
  return {
    calls,
    from(table: string) {
      return {
        select: () => ({
          eq: (col: string, val: string) => {
            calls.push({ table, col, val });
            return {
              maybeSingle: async () => {
                if (result === "throw") throw new Error("boom");
                return result;
              },
            };
          },
        }),
      };
    },
  };
}
const req = (ua?: string) => new Request("https://x.test/api/public/booking/business-catalog", { headers: ua ? { "user-agent": ua } : {} });

test("reads the right switch: talent site by profile, workspace by tenant", async () => {
  const a = fakeAdmin({ data: { ai_crawlers_allowed: true }, error: null });
  assert.equal(await readAiAccessFlag(a as never, { talentProfileId: "tp1" }), true);
  assert.deepEqual(a.calls, [{ table: "talent_sites", col: "talent_profile_id", val: "tp1" }]);
  const b = fakeAdmin({ data: { ai_crawlers_allowed: false }, error: null });
  assert.equal(await readAiAccessFlag(b as never, { tenantId: "t1" }), false);
  assert.deepEqual(b.calls, [{ table: "agency_branding", col: "tenant_id", val: "t1" }]);
});

test("no row means the platform default (ON); a read error or throw is null (unreadable)", async () => {
  assert.equal(await readAiAccessFlag(fakeAdmin({ data: null, error: null }) as never, { tenantId: "t" }), true);
  assert.equal(await readAiAccessFlag(fakeAdmin({ data: { ai_crawlers_allowed: null }, error: null }) as never, { tenantId: "t" }), true);
  assert.equal(await readAiAccessFlag(fakeAdmin({ data: null, error: { message: "x" } }) as never, { tenantId: "t" }), null);
  assert.equal(await readAiAccessFlag(fakeAdmin("throw") as never, { tenantId: "t" }), null);
});

test("per request: AI bot + OFF = refuse; AI bot + unreadable = refuse; AI bot + ON = allow", async () => {
  const off = fakeAdmin({ data: { ai_crawlers_allowed: false }, error: null });
  assert.equal(await aiReadVerdictForRequest(off as never, req(CHATGPT), { talentProfileId: "tp1" }), "refuse");
  const broken = fakeAdmin({ data: null, error: { message: "x" } });
  assert.equal(await aiReadVerdictForRequest(broken as never, req(CHATGPT), { talentProfileId: "tp1" }), "refuse");
  const thrown = fakeAdmin("throw");
  assert.equal(await aiReadVerdictForRequest(thrown as never, req(CHATGPT), { tenantId: "t1" }), "refuse");
  const on = fakeAdmin({ data: { ai_crawlers_allowed: true }, error: null });
  assert.equal(await aiReadVerdictForRequest(on as never, req(CHATGPT), { talentProfileId: "tp1" }), "allow");
});

test("per request: a browser, a guest or a request with no UA is never refused and costs no switch read", async () => {
  for (const ua of [BROWSER, undefined]) {
    const off = fakeAdmin({ data: { ai_crawlers_allowed: false }, error: null });
    assert.equal(await aiReadVerdictForRequest(off as never, req(ua), { talentProfileId: "tp1" }), "allow");
    assert.equal(off.calls.length, 0);
  }
});

test("the business catalog route is gated before it returns any data, with the right switch", () => {
  const route = read("src/app/api/public/booking/business-catalog/route.ts");
  const gate = route.indexOf("aiReadVerdictForRequest(");
  assert.ok(gate > 0, "gate present");
  assert.match(route, /loaded\.talentProfileId \? \{ talentProfileId: loaded\.talentProfileId \} : \{ tenantId: host\.tenantId \}/);
  assert.match(route, /status: 403/);
  assert.match(route, /ai_access_off/);
  assert.ok(gate < route.indexOf("toBusinessCatalogServices(loaded.offerings"), "gate before any service is mapped");
  // refusals are never cached; no shared cache may hold a 200 for a bot the switch refuses
  assert.match(route, /"Cache-Control": "no-store"/);
  assert.doesNotMatch(route.replace(/\/\/.*$/gm, ""), /s-maxage/);
  assert.match(route, /Vary: "User-Agent"/);
  // the refusal still carries CORS so a browser caller can read the reason
  assert.match(route, /\.\.\.CORS, "Cache-Control": "no-store"/);
});
