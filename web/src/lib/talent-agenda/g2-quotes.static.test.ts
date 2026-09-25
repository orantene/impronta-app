/**
 * G2.2 — Quotes write real rows (static contract).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.dirname(fileURLToPath(import.meta.url));

describe("G2.2 quote writers", () => {
  it("create-quote writes inquiry_offers and booking_deliverables", () => {
    const src = readFileSync(path.join(ROOT, "create-quote.ts"), "utf8");
    assert.ok(src.includes('.from("inquiries")'));
    assert.ok(src.includes('.from("inquiry_offers")'));
    assert.ok(src.includes('.from("booking_deliverables")'));
    assert.ok(src.includes("status: \"draft\""));
  });

  it("AgendaQuotes calls createOwnEventQuote / createOwnProjectQuote", () => {
    const ui = readFileSync(
      path.join(
        ROOT,
        "../../components/admin/shell/internal/talent/agenda/AgendaQuotes.tsx",
      ),
      "utf8",
    );
    assert.ok(ui.includes("createOwnEventQuote"));
    assert.ok(ui.includes("createOwnProjectQuote"));
    assert.ok(!ui.includes("Project quote drafted. Attach deliverables on the booking after the client accepts."));
  });
});
