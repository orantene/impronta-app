import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { EN_COPY } from "../test-copy";
import { KitPreviewBody } from "./KitPreview";

test("the preview renders every kit component at 390, 1194 and 1440 with no inline styles and no raw keys", () => {
  const html = renderToStaticMarkup(<KitPreviewBody copy={EN_COPY} />);
  assert.match(html, /class="msgv5 kit-preview"/);
  for (const w of [390, 1194, 1440]) assert.match(html, new RegExp(`data-kit-width="${w}"`));
  for (const marker of ["data-inbox-segments", "data-inbox-chips", "data-inbox-row", "data-skeleton", "data-empty-state", 'data-thread-header="desktop"', 'data-thread-header="mobile"', "data-essentials-strip", "data-message", "data-system-line", "data-day-separator", "data-unread-divider", 'data-card="offer"', 'data-card="payment"', 'data-card="order"', 'data-card="appointment"', 'data-card="times"', 'data-card="change"', 'data-card="identity"', "data-next-step", 'data-composer="idle"', 'data-composer="typing"', 'data-composer="sending"', 'data-composer="failed"', 'data-composer="offline"', 'data-composer="resolved"', 'data-composer="refused"', 'data-composer-mode="note"', "data-refusal=", "data-ok-line", "data-alert-line", "data-summary", "data-panel-section", "data-option-row", 'data-sheet="desktop"', 'data-sheet="mobile-h60"', 'data-sheet="mobile-h92"', 'data-sheet="full"', 'data-tray="desktop"', 'data-tray="mobile"', "data-line-row", "data-ladder"]) {
    assert.match(html, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `preview is missing ${marker}`);
  }
  assert.doesNotMatch(html, /style="/);
  assert.doesNotMatch(html, /dashboard\.messagesV5\./);
  assert.doesNotMatch(html, /—/);
  assert.doesNotMatch(html, /customer/i);
});
