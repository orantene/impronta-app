import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import {
  EVENTUSER_SUPPORT_DECISIONS,
  GUEST_REQUESTER_MAIL_TRIGGERS,
  GUEST_UNREACHABLE_EVENTUSER_TRIGGERS,
  resolveGuestSupportAudience,
  shouldEmitGuestAgentReply,
  shouldEmitGuestRequesterMail,
} from "./guest-notification-audience";

const NULL_REQUESTER = {
  requesterUserId: null,
  contactEmail: "prospect@example.com",
  contactName: "Maya",
};

test("pure guest ticket with contact_email resolves a non-empty audience", () => {
  const audience = resolveGuestSupportAudience(NULL_REQUESTER);
  assert.ok(audience.length > 0, "Oran replies into the void if this is empty");
  assert.equal(audience[0]?.kind, "guest");
  if (audience[0]?.kind === "guest") {
    assert.equal(audience[0].email, "prospect@example.com");
    assert.equal(audience[0].displayName, "Maya");
  }
});

test("every guest-reachable trigger has a non-empty audience for a null requester", () => {
  for (const trigger of GUEST_REQUESTER_MAIL_TRIGGERS) {
    const audience = resolveGuestSupportAudience(NULL_REQUESTER);
    assert.ok(
      audience.length > 0,
      `${trigger}: null requester + contact_email must resolve a guest, not []`,
    );
    assert.equal(audience[0]?.kind, "guest");
  }
});

test("eventUser decisions are exhaustive and either have a sibling or are documented unreachable", () => {
  const aSiblings = EVENTUSER_SUPPORT_DECISIONS.filter((d) => d.decision === "a").map(
    (d) => d.sibling,
  );
  for (const sibling of aSiblings) {
    assert.ok(
      (GUEST_REQUESTER_MAIL_TRIGGERS as readonly string[]).includes(sibling!),
      `${sibling} is (a) but missing from GUEST_REQUESTER_MAIL_TRIGGERS`,
    );
  }
  for (const d of EVENTUSER_SUPPORT_DECISIONS.filter((x) => x.decision === "b")) {
    assert.equal(d.sibling, null);
    assert.ok(
      (GUEST_UNREACHABLE_EVENTUSER_TRIGGERS as readonly string[]).includes(d.trigger),
      `${d.trigger} is (b) but missing from GUEST_UNREACHABLE_EVENTUSER_TRIGGERS`,
    );
  }
});

test("catalog-entries-support.ts eventUser blocks are all listed in EVENTUSER_SUPPORT_DECISIONS", () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const src = readFileSync(
    join(here, "../notifications/catalog-entries-support.ts"),
    "utf8",
  );
  const blocks = src.split(/const [A-Z0-9_]+: CatalogEntry = /).slice(1);
  const eventUserTriggers: string[] = [];
  for (const block of blocks) {
    if (!block.includes("resolveAudience: eventUser(")) continue;
    const match = block.match(/triggers:\s*\[([^\]]+)\]/);
    assert.ok(match, "eventUser entry missing triggers array");
    const triggers = [...match[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
    eventUserTriggers.push(...triggers);
  }
  const listed = new Set<string>(EVENTUSER_SUPPORT_DECISIONS.map((d) => d.trigger));
  for (const trigger of eventUserTriggers) {
    assert.ok(
      listed.has(trigger),
      `${trigger} uses eventUser but has no (a)/(b) decision. Add a guest sibling or document why not.`,
    );
  }
});

test("shouldEmitGuestRequesterMail is true only for pure guests with email", () => {
  assert.equal(
    shouldEmitGuestRequesterMail({
      surface: "guest",
      requesterUserId: null,
      contactEmail: "a@b.com",
    }),
    true,
  );
  assert.equal(
    shouldEmitGuestAgentReply({
      surface: "guest",
      requesterUserId: null,
      contactEmail: null,
    }),
    false,
  );
  assert.equal(
    shouldEmitGuestRequesterMail({
      surface: "client",
      requesterUserId: null,
      contactEmail: "a@b.com",
    }),
    false,
  );
});
