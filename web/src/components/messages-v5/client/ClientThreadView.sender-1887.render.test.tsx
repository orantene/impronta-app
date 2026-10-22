import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import type { ThreadMessage } from "@/lib/messaging/types";

import { ClientThreadView, type ClientThreadViewProps } from "./ClientThreadView";
import { EN_CLIENT, EN_KIT } from "./test-copy";

function msg(over: Partial<ThreadMessage> & { id: string }): ThreadMessage {
  return { inquiryId: "inq", kind: "text", body: "hi", payload: null, senderUserId: null, guestSessionId: null, createdAt: "2026-09-17T09:00:00.000Z", editedAt: null, deletedAt: null, thread: "private", internal: false, delivery: null, ...over };
}

const base: ClientThreadViewProps = {
  copy: EN_CLIENT,
  kit: EN_KIT,
  locale: "en",
  business: { name: "Tulala Hub", handlerFirstName: null },
  messages: [],
  offers: [],
  payCode: null,
  now: new Date("2026-09-17T10:00:00.000Z"),
  composer: { value: "", phase: "idle" },
  onSaveToEmail: null,
};

test("TUL-1887: a talent reply is labelled with the talent, a hub line keeps the business label", () => {
  const html = renderToStaticMarkup(
    <ClientThreadView
      {...base}
      messages={[
        msg({ id: "t1", senderUserId: "talent-user", senderLabel: "Ana Ruiz", body: "Happy to help" }),
        msg({ id: "h1", senderUserId: "staff", body: "Hub reply", createdAt: "2026-09-17T09:05:00.000Z" }),
      ]}
    />,
  );
  assert.match(html, /Ana Ruiz · /);
  assert.match(html, /Tulala Hub · /);
  assert.equal((html.match(/Tulala Hub · /g) ?? []).length, 1);
});
