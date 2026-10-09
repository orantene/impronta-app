import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { translateDashboardText } from "../dashboard-i18n";
import { INBOX_PREVIEW_AWAITING, INBOX_PREVIEW_BOOKED } from "./inbox-generated-previews";
import { inboxPreviewText } from "./inbox-preview-text";

// A tiny dictionary standing in for the Spanish dashboard one; "Confirmed" is a key.
const DICT: Record<string, string> = {
  Confirmed: "Confirmada",
  "Thanks!": "¡Gracias!",
  [INBOX_PREVIEW_AWAITING]: "Esperando tu respuesta.",
  [INBOX_PREVIEW_BOOKED]: "Reserva confirmada. Revisa la pestaña de logística.",
  "Booking confirmed. Check logistics tab.": "Reserva confirmada. Revisa la pestaña de logística.",
};
const t = (s: string) => DICT[s] ?? s;

test("a client's own message equal to a dictionary key is shown verbatim", () => {
  assert.equal(inboxPreviewText(t, { sender: "client", isMock: false, preview: "Confirmed" }), "Confirmed");
  assert.equal(inboxPreviewText(t, { sender: "you", isMock: false, preview: "Thanks!" }), "Thanks!");
  assert.equal(inboxPreviewText(t, { sender: "coordinator", isMock: false, preview: "Confirmed" }), "Confirmed");
  assert.equal(inboxPreviewText(t, { sender: "agency", isMock: false, preview: "Confirmed" }), "Confirmed");
});

test("system previews and mock conversations are translated", () => {
  assert.equal(inboxPreviewText(t, { sender: "system", isMock: false, preview: "Confirmed" }), "Confirmada");
  assert.equal(inboxPreviewText(t, { sender: "client", isMock: true, preview: "Thanks!" }), "¡Gracias!");
  // TUL-519: synthetic talent rows use system + the catalog English keys.
  assert.equal(
    inboxPreviewText(t, {
      sender: "system",
      isMock: false,
      preview: "Awaiting your response.",
    }),
    "Esperando tu respuesta.",
  );
});

test("TUL-518: bridge-generated coordinator placeholders translate on Spanish", () => {
  assert.equal(
    inboxPreviewText(t, { sender: "coordinator", isMock: false, preview: INBOX_PREVIEW_AWAITING }),
    "Esperando tu respuesta.",
  );
  assert.equal(
    inboxPreviewText(t, { sender: "coordinator", isMock: false, preview: INBOX_PREVIEW_BOOKED }),
    "Reserva confirmada. Revisa la pestaña de logística.",
  );
  assert.equal(translateDashboardText(INBOX_PREVIEW_AWAITING, "es"), "Esperando tu respuesta.");
  assert.equal(
    translateDashboardText(INBOX_PREVIEW_BOOKED, "es"),
    "Reserva confirmada. Revisa la pestaña de logística.",
  );
});

test("TalentJobShell no longer runs the raw last-message preview through copy.t", () => {
  const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "TalentJobShell.tsx"), "utf8");
  assert.doesNotMatch(src, /copy\.t\(conv\.lastMessage\.preview\)/);
  assert.match(src, /inboxPreviewText\(\(x\) => copy\.t\(x\),/);
});
