import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { inboxPreviewText } from "./inbox-preview-text";

// A tiny dictionary standing in for the Spanish dashboard one; "Confirmed" is a key.
const DICT: Record<string, string> = {
  Confirmed: "Confirmada",
  "Thanks!": "¡Gracias!",
  "Awaiting your response.": "Esperando tu respuesta.",
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

test("TUL-379 residual: synthetic awaiting line translates under agency sender", () => {
  // Shell prefixes "Impronta: " when sender is agency; body must still translate.
  assert.equal(
    inboxPreviewText(t, {
      sender: "agency",
      isMock: false,
      preview: "Awaiting your response.",
    }),
    "Esperando tu respuesta.",
  );
  assert.equal(
    inboxPreviewText(t, {
      sender: "system",
      isMock: false,
      preview: "Impronta: Awaiting your response.",
    }),
    "Impronta: Esperando tu respuesta.",
  );
  // Real agency prose that happens to contain a dictionary key stays verbatim.
  assert.equal(
    inboxPreviewText(t, {
      sender: "agency",
      isMock: false,
      preview: "Confirmed",
    }),
    "Confirmed",
  );
});

test("TalentJobShell no longer runs the raw last-message preview through copy.t", () => {
  const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "TalentJobShell.tsx"), "utf8");
  assert.doesNotMatch(src, /copy\.t\(conv\.lastMessage\.preview\)/);
  assert.match(src, /inboxPreviewText\(\(x\) => copy\.t\(x\),/);
});
