/**
 * P0 panels (valeria interaction audit): Send quote, Finish and collect, Request
 * payment as panels on the shared agenda frame. Static contract.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { blankComments } from "@/lib/quality/supabase-unchecked-read";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const read = (rel: string) => readFileSync(path.join(HERE, rel), "utf8");
const code = (rel: string) => blankComments(read(rel));

describe("shared panel frame", () => {
  const frame = code("AgendaPanelFrame.tsx");
  it("traps focus, closes on Escape, pads the safe area and takes a sticky footer", () => {
    assert.match(frame, /e\.key !== "Tab"/);
    assert.match(frame, /e\.key === "Escape"/);
    assert.match(frame, /safe-area-inset-bottom/);
    assert.match(frame, /footer\?: ReactNode/);
    assert.match(frame, /max-md:inset-x-0 max-md:bottom-0/);
  });
  it("TaskShell renders in the frame with panel", () => {
    const shell = code("primitives/TaskShell.tsx");
    assert.match(shell, /panel\?: boolean/);
    assert.match(shell, /<AgendaPanelFrame/);
  });
});

describe("Finish and collect is a stepped panel", () => {
  const src = code("AgendaFinishCollect.tsx");
  it("has method, confirm and done steps and opens as a panel", () => {
    assert.match(src, /type Step = "method" \| "confirm" \| "done"/);
    assert.match(src, /<TaskShell[\s\S]*panel/);
    assert.match(src, /setStep\("confirm"\)/);
    assert.match(src, /setStep\("done"\)/);
  });
  it("only reaches done after completeBooking succeeds", () => {
    const at = src.indexOf("completeBooking({ bookingId })");
    assert.ok(at > 0);
    assert.ok(src.indexOf('setStep("done")') > at);
  });
});

describe("Request payment panel and QR", () => {
  it("uses the real createPaymentLink writer and only shows success with a url", () => {
    const src = code("AgendaPayRequest.tsx");
    assert.match(src, /createPaymentLink\(/);
    assert.match(src, /if \(url\)/);
    assert.match(src, /PayQrPopover/);
  });
  it("QR popover encodes the link and has Download", () => {
    const src = code("AgendaPayQr.tsx");
    assert.match(src, /encodeQr\(url\)/);
    assert.match(src, /copy\.t\("Download"\)/);
    assert.match(src, /image\/png/);
  });
});

describe("Send quote panel", () => {
  it("creates through the inquiry funnel writer and is opened from Today and Messages", () => {
    const panel = code("SendQuotePanel.tsx");
    assert.match(panel, /messagingTalentSendQuote\(/);
    assert.match(panel, /loadTalentClients/);
    const router = read("../../talent.tsx");
    assert.match(router, /<SendQuotePanelHost/);
    assert.match(read("../pages/TodayPage.tsx"), /onSendQuote=\{openSendQuotePanel\}/);
    assert.match(read("../pages/messages/MessagesPage.tsx"), /openSendQuotePanel/);
  });
  it("the writer prices from HER catalog row and never inserts an inquiry directly", () => {
    const writes = code("../../../../../../lib/server-actions/messaging-talent-writes.ts");
    assert.match(writes, /loadTalentOfferingsForEditor\(actor\.talentProfileId\)/);
    assert.match(writes, /createInquiryFromIntent\(/);
    assert.doesNotMatch(writes, /from\("inquiries"\)\s*\.insert/);
  });
});

describe("Money Record payment opens Finish over Money", () => {
  it("renders the Finish panel in place instead of navigating to the booking", () => {
    const money = code("../../../../../talent/money/MoneyHomePage.tsx");
    assert.match(money, /<AgendaFinishCollect/);
    assert.match(money, /setFinishFor\(r\)/);
    assert.doesNotMatch(money, /collect=1/);
  });
});

describe("house rules on the new panel files", () => {
  const files = ["AgendaFinishCollect.tsx", "AgendaPayRequest.tsx", "AgendaPayQr.tsx", "SendQuotePanel.tsx", "AgendaPanelFrame.tsx"];
  it("no hex literals and no em dashes", () => {
    for (const f of files) {
      const src = code(f);
      assert.doesNotMatch(src, /#[0-9a-fA-F]{3,8}\b/, `${f} hex`);
      assert.ok(!read(f).includes("—"), `${f} em dash`);
    }
  });
});
