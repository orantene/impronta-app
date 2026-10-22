import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { ClientAccountArea } from "@/components/client-account/ClientAccountArea";

const base = { locale: "es", audience: "client", talentName: "Tulala", email: "c@example.com", timeZone: "America/Cancun" } as const;

test("TUL-1089: the message list shows date, time and zone", () => {
  const html = renderToStaticMarkup(
    createElement(ClientAccountArea, {
      ...base, view: { kind: "home", tab: "messages" },
      data: { threads: [{ id: "i1", title: "Boda", lastBody: "Hola", lastAt: "2026-10-21T18:30:00Z" }], profile: { name: "Cli", phone: "", locale: "es", marketingOptIn: false } },
    } as never),
  );
  assert.match(html, /data-thread-at/);
  assert.match(html, /13:30|1:30/);
  assert.match(html, /Cancún/);
});

test("TUL-1089: the thread header and each message are stamped (the reply form needs the app router, so read the source)", () => {
  const src = readFileSync("src/components/client-account/ClientAccountArea.tsx", "utf8");
  assert.match(src, /data-thread-last-at/);
  assert.match(src, /stamp\(m\.createdAt\)/);
  assert.match(src, /stamp\(th\.lastAt\)/);
});
