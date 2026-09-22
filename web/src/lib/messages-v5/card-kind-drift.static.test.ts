import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";

import type { GuestMessageKind } from "@/lib/inquiry/guest-chat-contract";

import { CLIENT_CARD_KINDS } from "./client-thread-view";

/**
 * D-MSG-304. Times and offer-state rendered as text bubbles for weeks because
 * GuestMessageKind and VISIBLE_KINDS were hand lists that drifted from
 * CLIENT_CARD_KINDS while every gate stayed green. This assignment is a type
 * error if a card kind is missing from the union, and the source checks fail
 * the messaging lane without a full tsc.
 */
const _inUnion: readonly GuestMessageKind[] = CLIENT_CARD_KINDS;
void _inUnion;

function guestMessageKindBlock(): string {
  const file = fs.readFileSync(path.join(process.cwd(), "src/lib/inquiry/guest-chat-contract.ts"), "utf8");
  const start = file.indexOf("export type GuestMessageKind =");
  assert.ok(start >= 0, "GuestMessageKind union missing");
  const rest = file.slice(start);
  // The union's comment contains a semicolon ("passes every non-note kind
  // through;"). Strip line comments before taking the type terminator.
  const stripped = rest.replace(/\/\/[^\n]*/g, "");
  const end = stripped.indexOf(";");
  assert.ok(end > 0, "GuestMessageKind union has no terminator");
  return stripped.slice(0, end);
}

test("every CLIENT_CARD_KINDS member is in GuestMessageKind and VISIBLE_KINDS", () => {
  const union = guestMessageKindBlock();
  for (const kind of CLIENT_CARD_KINDS) {
    assert.match(union, new RegExp(`"${kind}"`), `${kind} missing from GuestMessageKind`);
  }
  const actions = fs.readFileSync(
    path.join(process.cwd(), "src/app/t/[profileCode]/_actions/guest-chat-actions.ts"),
    "utf8",
  );
  const visible = actions.slice(actions.indexOf("const VISIBLE_KINDS"), actions.indexOf("const VISIBLE_KINDS") + 500);
  assert.match(visible, /\.\.\.CLIENT_CARD_KINDS/, "VISIBLE_KINDS must spread CLIENT_CARD_KINDS");
  for (const kind of CLIENT_CARD_KINDS) {
    assert.ok(
      visible.includes(`"${kind}"`) || visible.includes("...CLIENT_CARD_KINDS"),
      `${kind} is not covered by VISIBLE_KINDS`,
    );
  }
});
