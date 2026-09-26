import assert from "node:assert/strict";
import { test } from "node:test";
import { threadTokenAllowedOnHost } from "./thread-token-host";

const TENANT_A = "33330000-0000-4000-8000-000000000333";
const TENANT_B = "33330000-0000-4000-8000-000000000334";

test("agency host matching the token tenant is allowed", () => {
  assert.equal(
    threadTokenAllowedOnHost(TENANT_A, { kind: "agency", tenantId: TENANT_A }),
    true,
  );
});

test("agency Host B must not open Host A's token (Story 7 isolation)", () => {
  assert.equal(
    threadTokenAllowedOnHost(TENANT_A, { kind: "agency", tenantId: TENANT_B }),
    false,
  );
});

test("hub host matching the token tenant is allowed", () => {
  assert.equal(
    threadTokenAllowedOnHost(TENANT_A, { kind: "hub", tenantId: TENANT_A }),
    true,
  );
});

test("hub host with a different tenant refuses (share-route parity)", () => {
  assert.equal(
    threadTokenAllowedOnHost(TENANT_A, { kind: "hub", tenantId: TENANT_B }),
    false,
  );
});

test("marketing apex allows any valid token (talent front-door / Story 1)", () => {
  assert.equal(
    threadTokenAllowedOnHost(TENANT_A, { kind: "marketing", tenantId: null }),
    true,
  );
});

test("app host allows any valid token", () => {
  assert.equal(
    threadTokenAllowedOnHost(TENANT_A, { kind: "app", tenantId: null }),
    true,
  );
});

test("empty token tenant is never allowed", () => {
  assert.equal(
    threadTokenAllowedOnHost("", { kind: "agency", tenantId: TENANT_A }),
    false,
  );
});
