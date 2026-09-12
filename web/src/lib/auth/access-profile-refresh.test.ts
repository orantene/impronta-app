import assert from "node:assert/strict";
import { test } from "node:test";

import {
  ACCESS_PROFILE_REFRESH_VALUE,
  wantsAccessProfileRefresh,
} from "./access-profile-refresh";

test("only the one-shot value busts the access-profile memo", () => {
  assert.equal(wantsAccessProfileRefresh(ACCESS_PROFILE_REFRESH_VALUE), true);
  assert.equal(wantsAccessProfileRefresh(undefined), false);
  assert.equal(wantsAccessProfileRefresh(""), false);
  assert.equal(wantsAccessProfileRefresh("0"), false);
});
