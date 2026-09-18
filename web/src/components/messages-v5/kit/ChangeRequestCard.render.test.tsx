import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { ChangeRequestCard } from "./ChangeRequestCard";
import { EN_COPY } from "./test-copy";

const rows = [
  { label: "From", value: "Sat Sep 19 · 11:00 · Dani", muted: true },
  { label: "To", value: "Sun Sep 20 · 10:00 · Dani" },
  { label: "Policy", value: "Free change, more than 24h away" },
  { label: "Deposit", value: "kept · $40" },
];
const base = { title: "Move to Sunday", clientName: "Carla", rows, copy: EN_COPY, onAction: () => {} };

test("preview: impact rows, original stays, Cancel + Send to client", () => {
  const html = renderToStaticMarkup(<ChangeRequestCard {...base} mode="preview" />);
  assert.match(html, /card k-change me/);
  assert.match(html, /pill due">Preview/);
  assert.match(html, /Original stays until Carla confirms/);
  assert.match(html, /data-change-action="cancel"/);
  assert.match(html, /btn primary sm[^>]*data-change-action="send"[^>]*>Send to Carla/);
});

test("requested from the link: needs your reply, Draft v3; applied and declined have no action; busy", () => {
  const req = renderToStaticMarkup(<ChangeRequestCard {...base} mode="requested" rows={[{ label: "Remove one hostess · keep DJ package", value: "your call" }]} />);
  assert.match(req, /pill due">Needs your reply/);
  assert.match(req, /Carla · from the thread link/);
  assert.match(req, /Accept the change and v3 opens prefilled/);
  assert.match(req, /data-change-action="draft"[^>]*>Draft v3/);
  assert.doesNotMatch(renderToStaticMarkup(<ChangeRequestCard {...base} mode="applied" />), /data-change-action/);
  assert.match(renderToStaticMarkup(<ChangeRequestCard {...base} mode="declined" />), /pill lost">Declined/);
  assert.match(renderToStaticMarkup(<ChangeRequestCard {...base} mode="preview" busy />), />Sending</);
});
