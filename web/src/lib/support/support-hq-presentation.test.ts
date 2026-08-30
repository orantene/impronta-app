import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import {
  HQ_GUEST_AUDIENCE_ID,
  guestHasNoReplyChannel,
  hqQueueRequesterEmail,
  hqQueueSearchHaystack,
  surfaceIcon,
} from "./support-hq-presentation";

test("hqQueueSearchHaystack includes contactEmail", () => {
  const hay = hqQueueSearchHaystack({
    ticket: {
      subject: "Plans",
      category: "product",
      contactEmail: "prospect@example.com",
      contactName: "Maya",
    },
    tenantName: null,
    requesterName: null,
    requesterEmail: null,
  });
  assert.ok(hay.includes("prospect@example.com"));
});

test("queue row mapper surfaces contactEmail as requesterEmail", () => {
  assert.equal(
    hqQueueRequesterEmail({ contactEmail: "prospect@example.com" }),
    "prospect@example.com",
  );
});

test("TicketContextCard source surfaces contactEmail and the no-reply badge", () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const src = readFileSync(
    join(here, "../../app/(workspace)/platform/admin/support/TicketContextCard.tsx"),
    "utf8",
  );
  assert.ok(src.includes("guestHasNoReplyChannel"));
  assert.ok(src.includes("ticket.contactEmail"));
  assert.ok(src.includes("noReplyChannel"));
});

test("AudienceId includes guest and surfaceIcon has a guest branch before fallthrough", () => {
  assert.equal(HQ_GUEST_AUDIENCE_ID, "guest");
  const guest = surfaceIcon("guest");
  const client = surfaceIcon("client");
  const unknown = surfaceIcon("something-else");
  assert.equal(guest.glyph, "○");
  assert.notEqual(guest.glyph, client.glyph);
  assert.equal(unknown.glyph, "●");
  assert.notEqual(guest.glyph, unknown.glyph);

  const src = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "support-hq-presentation.ts"),
    "utf8",
  );
  const guestIdx = src.indexOf('surface === "guest"');
  const fallthroughIdx = src.indexOf("return { glyph:");
  assert.ok(guestIdx > 0);
  assert.ok(guestIdx < fallthroughIdx || src.indexOf('if (surface === "guest")') < src.lastIndexOf("return {"));
});

test("escalated guest with no contact_email is a no-reply-channel ticket", () => {
  assert.equal(
    guestHasNoReplyChannel({
      surface: "guest",
      contactEmail: null,
      escalatedAt: "2026-08-01T00:00:00Z",
      handledBy: "human",
      waitingOn: "support",
    }),
    true,
  );
  assert.equal(
    guestHasNoReplyChannel({
      surface: "guest",
      contactEmail: "a@b.com",
      escalatedAt: "2026-08-01T00:00:00Z",
      handledBy: "human",
      waitingOn: "support",
    }),
    false,
  );
});
