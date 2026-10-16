import assert from "node:assert/strict";
import { test } from "node:test";

import { supportOutboundThreading } from "./support-outbound-threading";
import { matchTicketFromInbound } from "./support-inbound-match";

const ID = "11111111-2222-3333-4444-555555555555";
const ENV = { SUPPORT_INBOUND_DOMAIN: "in.example.test", SUPPORT_INBOUND_SECRET: "s3cret" };

test("off until the inbound domain is configured", () => {
  assert.equal(supportOutboundThreading("support.message.agent", { ticketId: ID, platformFrom: true }, "e1", {}), null);
});

test("requester support mail gets a Reply-To that routes back to the same ticket", () => {
  const t = supportOutboundThreading("support.message.agent", { ticketId: ID, platformFrom: true }, "e1", ENV);
  assert.ok(t);
  assert.ok(t.replyTo.startsWith("support+") && t.replyTo.endsWith("@in.example.test"));
  const match = matchTicketFromInbound({ to: t.replyTo }, "s3cret");
  assert.deepEqual(match, { ticketId: ID });
  const viaHeader = matchTicketFromInbound({ to: "x@y.test", inReplyTo: t.headers["Message-ID"] }, "s3cret");
  assert.deepEqual(viaHeader, { ticketId: ID });
});

test("non-support or non-platform mail is untouched", () => {
  assert.equal(supportOutboundThreading("booking.confirmed", { ticketId: ID, platformFrom: true }, "e1", ENV), null);
  assert.equal(supportOutboundThreading("support.message.agent", { ticketId: ID }, "e1", ENV), null);
});

test("a forged token for another ticket does not match", () => {
  const t = supportOutboundThreading("support.message.agent", { ticketId: ID, platformFrom: true }, "e1", ENV)!;
  const forged = t.replyTo.replace(/-[a-z2-7]{16}@/, "-aaaaaaaaaaaaaaaa@");
  assert.deepEqual(matchTicketFromInbound({ to: forged }, "s3cret"), { unmatched: "invalid_token" });
});
