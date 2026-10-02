import assert from "node:assert/strict";
import { test } from "node:test";

import {
  DEFAULT_INBOUND_FORWARD_TO,
  resolveInboundForwardTo,
} from "./resend-inbound-forward";

test("resolveInboundForwardTo defaults to platform owner Gmail", () => {
  const prev = process.env.RESEND_INBOUND_FORWARD_TO;
  delete process.env.RESEND_INBOUND_FORWARD_TO;
  assert.equal(resolveInboundForwardTo(), DEFAULT_INBOUND_FORWARD_TO);
  if (prev !== undefined) process.env.RESEND_INBOUND_FORWARD_TO = prev;
});

test("resolveInboundForwardTo respects env override", () => {
  const prev = process.env.RESEND_INBOUND_FORWARD_TO;
  process.env.RESEND_INBOUND_FORWARD_TO = " ops@example.com ";
  assert.equal(resolveInboundForwardTo(), "ops@example.com");
  if (prev !== undefined) process.env.RESEND_INBOUND_FORWARD_TO = prev;
  else delete process.env.RESEND_INBOUND_FORWARD_TO;
});
