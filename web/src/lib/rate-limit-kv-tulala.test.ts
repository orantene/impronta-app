import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { isMemoryLimiterAllowed, memorySlidingWindow } from "./rate-limit-kv-tulala";

const QA = "https://fxlankepwnvelxjrahwk.supabase.co";
const PROD = "https://pluhdapdnuiulvxmyspd.supabase.co";

describe("tulala memory limiter (QA stand-in for Upstash)", () => {
  test("allowed only off-production AND on the isolated branch", () => {
    assert.equal(isMemoryLimiterAllowed({ NODE_ENV: "development", NEXT_PUBLIC_SUPABASE_URL: QA } as NodeJS.ProcessEnv), true);
    assert.equal(isMemoryLimiterAllowed({ NODE_ENV: "test", NEXT_PUBLIC_SUPABASE_URL: QA } as NodeJS.ProcessEnv), true);
    assert.equal(isMemoryLimiterAllowed({ NODE_ENV: "production", NEXT_PUBLIC_SUPABASE_URL: QA } as NodeJS.ProcessEnv), false);
    assert.equal(isMemoryLimiterAllowed({ NODE_ENV: "development", NEXT_PUBLIC_SUPABASE_URL: PROD } as NodeJS.ProcessEnv), false);
    assert.equal(isMemoryLimiterAllowed({ NODE_ENV: "development" } as NodeJS.ProcessEnv), false);
  });

  test("sliding window refuses the (n+1)th hit and frees it after the window", async () => {
    let t = 1_000_000;
    const w = memorySlidingWindow(2, 1000, () => t);
    assert.equal((await w.limit("a")).success, true);
    assert.equal((await w.limit("a")).success, true);
    const third = await w.limit("a");
    assert.equal(third.success, false);
    assert.equal(third.reset, 1_001_000);
    assert.equal((await w.limit("b")).success, true, "keys are independent");
    t += 1001;
    assert.equal((await w.limit("a")).success, true);
  });
});
