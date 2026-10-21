import assert from "node:assert/strict";
import test from "node:test";

import { roomMessage, type RoomMessageCode } from "./room-messages";

test("every room sentence exists in ES and EN, is plain and has no em dash", () => {
  for (const c of ["room_taken", "room_unavailable", "room_release_failed"] as RoomMessageCode[]) {
    const es = roomMessage(c, "es");
    const en = roomMessage(c, "en");
    assert.ok(es && en && es !== en, c);
    assert.doesNotMatch(`${es} ${en}`, /[—–]|_/);
  }
  assert.equal(roomMessage("room_taken", "es-MX").startsWith("Ese espacio"), true);
  assert.equal(roomMessage("room_taken", null).startsWith("That room"), true);
});
