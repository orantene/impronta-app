/**
 * Journeys 2 / 24–25 — Desk product wiring static contracts.
 * Portal reuses HQ Support guts; flag stays OFF on Vercel by default.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

const WEB_SRC = join(process.cwd(), "src");

describe("desk shell wiring", () => {
  it("Desk page mounts HQ Support via SupportDeskPortal (not a parallel inbox)", () => {
    const page = readFileSync(join(WEB_SRC, "app/desk/page.tsx"), "utf8");
    assert.match(page, /loadDeskPage/);
    assert.match(page, /SupportDeskPortal/);
    assert.doesNotMatch(page, /SupportDeskShell/);
  });

  it("SupportDeskPortal wraps SupportHqShell + NotificationPermissionCard", () => {
    const portal = readFileSync(
      join(WEB_SRC, "components/support-desk/SupportDeskPortal.tsx"),
      "utf8",
    );
    assert.match(portal, /SupportHqShell/);
    assert.match(portal, /NotificationPermissionCard/);
    assert.doesNotMatch(portal, /mockup/i);
  });

  it("HQ support page redirects to Desk portal when flag is on", () => {
    const page = readFileSync(
      join(WEB_SRC, "app/(workspace)/platform/admin/support/page.tsx"),
      "utf8",
    );
    assert.match(page, /isSupportDeskEnabled/);
    assert.match(page, /supportDeskPortalRedirectHref/);
    assert.match(page, /redirect\(/);
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

  it("HQ shell still exposes Open Support Desk when deskEnabled (legacy entry)", () => {
    const shell = readFileSync(
      join(WEB_SRC, "app/(workspace)/platform/admin/support/SupportHqShell.tsx"),
      "utf8",
    );
    assert.match(shell, /deskEnabled/);
    assert.match(shell, /supportDeskOpenFromHqHref/);
    assert.match(shell, /deskOpenFromHq/);
  });

  it("legacy SupportDeskShell kept hq-actions wiring (superseded by portal)", () => {
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
