/**
 * Journey 7 — Desk presence must use the private support.presence.* topic
 * with privateChannel:true (server-auth via realtime.messages RLS).
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import { supportPresenceChannel } from "@/lib/support/support-types";

const WEB_SRC = join(process.cwd(), "src");

describe("desk presence (journey 7)", () => {
  it("channel name is support.presence.{ticketId}", () => {
    assert.equal(
      supportPresenceChannel("11111111-1111-1111-1111-111111111111"),
      "support.presence.11111111-1111-1111-1111-111111111111",
    );
  });

  it("SupportDeskShell joins private presence + uses supportPresenceChannel", () => {
    const src = readFileSync(
      join(WEB_SRC, "components/support-desk/SupportDeskShell.tsx"),
      "utf8",
    );
    assert.match(src, /supportPresenceChannel\s*\(/);
    assert.match(src, /privateChannel:\s*true/);
    assert.doesNotMatch(src, /tulala\.presence\.support/);
  });

  it("migration seeds private realtime.messages policies", () => {
    const mig = readFileSync(
      join(
        process.cwd(),
        "..",
        "supabase/migrations/20261231330000_support_desk_presence_private.sql",
      ),
      "utf8",
    );
    assert.match(mig, /support\.presence\.%/);
    assert.match(mig, /is_platform_admin/);
    assert.match(mig, /support_presence_broadcast_read/);
    assert.match(mig, /support_presence_broadcast_write/);
  });
});
