import assert from "node:assert/strict";
import { test } from "node:test";

import { isSupportDeskEnabled, type DeskFlagEnv } from "./desk-flag";

function env(partial: DeskFlagEnv): DeskFlagEnv {
  return partial;
}

test("unset + development → ON (local QA default)", () => {
  assert.equal(
    isSupportDeskEnabled(env({ NODE_ENV: "development" })),
    true,
  );
});

test("unset + production NODE_ENV → OFF", () => {
  assert.equal(
    isSupportDeskEnabled(env({ NODE_ENV: "production" })),
    false,
  );
});

test("unset + VERCEL_ENV=production → OFF even if NODE_ENV=development", () => {
  assert.equal(
    isSupportDeskEnabled(
      env({ NODE_ENV: "development", VERCEL_ENV: "production" }),
    ),
    false,
  );
});

test("unset + VERCEL_ENV=preview → OFF", () => {
  assert.equal(
    isSupportDeskEnabled(env({ NODE_ENV: "production", VERCEL_ENV: "preview" })),
    false,
  );
});

test("explicit 1/true/on forces ON in production", () => {
  for (const v of ["1", "true", "ON", " True "]) {
    assert.equal(
      isSupportDeskEnabled(
        env({
          SUPPORT_DESK_ENABLED: v,
          NODE_ENV: "production",
          VERCEL_ENV: "production",
        }),
      ),
      true,
      v,
    );
  }
});

test("explicit 0/false/off forces OFF in development", () => {
  for (const v of ["0", "false", "off", " False "]) {
    assert.equal(
      isSupportDeskEnabled(
        env({ SUPPORT_DESK_ENABLED: v, NODE_ENV: "development" }),
      ),
      false,
      v,
    );
  }
});
