/**
 * Journeys 2 / 24–25 — Desk product wiring static contracts.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

const WEB_SRC = join(process.cwd(), "src");

describe("desk shell wiring", () => {
  it("Desk page loads queue via loadDeskPage + SupportDeskShell", () => {
    const page = readFileSync(join(WEB_SRC, "app/desk/page.tsx"), "utf8");
    assert.match(page, /loadDeskPage/);
    assert.match(page, /SupportDeskShell/);
    assert.match(page, /isSupportDeskEnabled|loadDeskPage/);
  });

  it("local QA stub redirects to /desk (no mockup-wait copy)", () => {
    const page = readFileSync(
      join(WEB_SRC, "app/(workspace)/platform/admin/support/desk/page.tsx"),
      "utf8",
    );
    assert.match(page, /redirect/);
    assert.match(page, /SUPPORT_DESK_HOST_PATH|\/desk/);
    assert.doesNotMatch(page, /mockup/i);
    assert.doesNotMatch(page, /Phase 0\.5/);
  });

  it("HQ shell exposes Open Support Desk when deskEnabled", () => {
    const shell = readFileSync(
      join(WEB_SRC, "app/(workspace)/platform/admin/support/SupportHqShell.tsx"),
      "utf8",
    );
    assert.match(shell, /deskEnabled/);
    assert.match(shell, /supportDeskOpenFromHqHref/);
    assert.match(shell, /deskOpenFromHq/);
  });

  it("Desk shell reuses HQ actions (no second ticket write path)", () => {
    const shell = readFileSync(
      join(WEB_SRC, "components/support-desk/SupportDeskShell.tsx"),
      "utf8",
    );
    assert.match(shell, /hqReplySupportTicketAction/);
    assert.match(shell, /hqChangeStatusAction/);
    assert.match(shell, /hqReopenTicketAction/);
    assert.match(shell, /hqClaimSelfAction/);
    assert.match(shell, /hqLoadTicketDetailAction/);
    assert.match(shell, /clientSendKey/);
  });

  it("hqReopenTicketAction wraps supportEngine.reopenTicket", () => {
    const src = readFileSync(join(WEB_SRC, "lib/support/hq-actions.ts"), "utf8");
    assert.match(src, /export async function hqReopenTicketAction/);
    assert.match(src, /supportEngine\.reopenTicket/);
  });
});
