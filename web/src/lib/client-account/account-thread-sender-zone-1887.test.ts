import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { ClientAccountArea } from "@/components/client-account/ClientAccountArea";
import { buildClientThread } from "./client-thread-pure";
import { formatZonedWhen } from "./area-pure";
import { stampText } from "./stamp-text";

const inquiry = { id: "i1", message: null, created_at: null };

test("TUL-1887: a talent reply carries the talent's name; mine and hub lines carry none", () => {
  const rows = [
    { id: "m1", body: "Hola", created_at: "2026-10-21T18:00:00Z", sender_user_id: "talent-u" },
    { id: "m2", body: "Gracias", created_at: "2026-10-21T18:05:00Z", sender_user_id: "me" },
    { id: "m3", body: "Nota", created_at: "2026-10-21T18:06:00Z", sender_user_id: "staff-u" },
  ];
  const out = buildClientThread(rows, inquiry, "me", "es", new Map([["talent-u", "Ana Ruiz"]]));
  assert.deepEqual(out.map((m) => m.senderName), ["Ana Ruiz", null, null]);
});

test("TUL-1887: the account thread draws the talent name before the host label (the reply form needs the app router, so read the source)", () => {
  const src = readFileSync("src/components/client-account/ClientAccountArea.tsx", "utf8");
  assert.match(src, /m\.mine \? a\("you"\) : m\.senderName \|\| props\.talentName/);
});

test("TUL-1887: an untitled inbox row names the lineup talent before the host label", () => {
  const html = renderToStaticMarkup(
    createElement(ClientAccountArea, {
      locale: "es", audience: "client", talentName: "Tulala Hub", email: "c@example.com", timeZone: "UTC",
      view: { kind: "home", tab: "messages" },
      data: { threads: [{ id: "i1", title: "", lastBody: "Hola", lastAt: "2026-10-21T18:30:00Z", counterpart: "Ana Ruiz" }], profile: { name: "Cli", phone: "", locale: "es", marketingOptIn: false } },
    } as never),
  );
  assert.match(html, /<strong>Ana Ruiz<\/strong>/);
});

test("TUL-1909: the stamp renders in a non-UTC zone, and the island switches to the viewer zone after mount", () => {
  const cancun = stampText(formatZonedWhen("2026-10-21T18:30:00Z", "America/Cancun", "es"));
  assert.match(cancun, /13:30|1:30/);
  const tokyo = stampText(formatZonedWhen("2026-10-21T18:30:00Z", "Asia/Tokyo", "es"));
  assert.match(tokyo, /3:30/);
  const src = readFileSync("src/components/client-account/LocalStamp.tsx", "utf8");
  assert.match(src, /"use client"/);
  assert.match(src, /useViewerTimeZone\(\)/);
  assert.match(src, /zone \?\? fallbackZone/);
  assert.match(readFileSync("src/app/(workspace)/[tenantSlug]/client/messages/ClientMessagesShell.tsx", "utf8"), /unnamed = !knownName/);
});
