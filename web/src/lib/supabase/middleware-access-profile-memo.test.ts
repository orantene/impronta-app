import assert from "node:assert/strict";
import { test } from "node:test";

import { forgetAccessProfileMemo, loadAccessProfileMemo } from "./middleware";

test("memo is bypassed when onboarding stamped the refresh cookie after the entry", async () => {
  const userId = "memo-test-user";
  forgetAccessProfileMemo(userId);
  let calls = 0;
  let role: string | null = null;
  const load = (async () => {
    calls += 1;
    return { app_role: role } as never;
  }) as never;
  const client = {} as never;

  const first = await loadAccessProfileMemo(client, userId, null, load);
  assert.equal(first.fromMemo, false);
  assert.equal(calls, 1);

  // Within the TTL, no cookie: memo served (the stale "no role" result).
  role = "talent";
  const second = await loadAccessProfileMemo(client, userId, null, load);
  assert.equal(second.fromMemo, true);
  assert.equal((second.profile as { app_role: string | null }).app_role, null);

  // The build route stamps the cookie: the older entry is stale.
  const stamp = String(Date.now());
  await new Promise((r) => setTimeout(r, 2));
  const third = await loadAccessProfileMemo(client, userId, stamp, load);
  assert.equal(third.fromMemo, false);
  assert.equal((third.profile as { app_role: string }).app_role, "talent");
  assert.equal(calls, 2);

  // The fresh entry postdates the stamp, so it is memoised again.
  const fourth = await loadAccessProfileMemo(client, userId, stamp, load);
  assert.equal(fourth.fromMemo, true);
  assert.equal(calls, 2);
  forgetAccessProfileMemo(userId);
});
