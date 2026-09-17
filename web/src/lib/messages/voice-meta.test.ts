import test from "node:test";
import assert from "node:assert/strict";
import { readVoiceMetaFromMessageMetadata } from "@/lib/messages/voice-meta";

test("parses a well-formed voice payload", () => {
  const meta = readVoiceMetaFromMessageMetadata({
    voice: {
      attachmentId: "att-1",
      storagePath: "tenant/inquiry/uuid-voice.webm",
      durationMs: 4200,
      mimeType: "audio/webm",
      byteSize: 51200,
    },
  });
  assert.deepEqual(meta, {
    attachmentId: "att-1",
    storagePath: "tenant/inquiry/uuid-voice.webm",
    durationMs: 4200,
    mimeType: "audio/webm",
    byteSize: 51200,
  });
});

test("coerces string numbers from jsonb round-trips and defaults mime", () => {
  const meta = readVoiceMetaFromMessageMetadata({
    voice: {
      attachmentId: "att-2",
      storagePath: "p/q/r.webm",
      durationMs: "3000",
      byteSize: "9999",
    },
  });
  assert.equal(meta?.durationMs, 3000);
  assert.equal(meta?.byteSize, 9999);
  assert.equal(meta?.mimeType, "audio/webm");
});

test("clamps negative / non-finite numbers to 0", () => {
  const meta = readVoiceMetaFromMessageMetadata({
    voice: {
      attachmentId: "att-3",
      storagePath: "p/q/s.webm",
      durationMs: -5,
      byteSize: "not-a-number",
    },
  });
  assert.equal(meta?.durationMs, 0);
  assert.equal(meta?.byteSize, 0);
});

test("returns null without attachmentId or storagePath", () => {
  assert.equal(
    readVoiceMetaFromMessageMetadata({ voice: { storagePath: "p/q/r" } }),
    null,
  );
  assert.equal(
    readVoiceMetaFromMessageMetadata({ voice: { attachmentId: "x" } }),
    null,
  );
  assert.equal(
    readVoiceMetaFromMessageMetadata({ voice: { attachmentId: "  ", storagePath: " " } }),
    null,
  );
});

test("returns null for garbage / absent metadata", () => {
  assert.equal(readVoiceMetaFromMessageMetadata(null), null);
  assert.equal(readVoiceMetaFromMessageMetadata(undefined), null);
  assert.equal(readVoiceMetaFromMessageMetadata("string"), null);
  assert.equal(readVoiceMetaFromMessageMetadata(42), null);
  assert.equal(readVoiceMetaFromMessageMetadata([]), null);
  assert.equal(readVoiceMetaFromMessageMetadata({}), null);
  assert.equal(readVoiceMetaFromMessageMetadata({ voice: null }), null);
  assert.equal(readVoiceMetaFromMessageMetadata({ voice: "x" }), null);
});

// Regression guard for the "voice" message_kind incident: inquiry_messages
// CHECK (supabase/migrations/20261231222000_pos_messaging_state.sql) never
// allowed "voice", so voice-notes.ts inserts as message_kind="text" with a
// metadata.voice payload. Detection everywhere must be metadata-driven, not
// message_kind-driven — this pins both sides so neither regresses silently.
test("insertVoiceRows writes an allowed message_kind, not the unchecked 'voice' value", () => {
  const fs = require("node:fs") as typeof import("node:fs");
  const path = require("node:path") as typeof import("node:path");

  const voiceNotesSrc = fs.readFileSync(
    path.join(__dirname, "../server-actions/voice-notes.ts"),
    "utf8",
  );
  assert.match(voiceNotesSrc, /message_kind:\s*"text"/);
  assert.doesNotMatch(voiceNotesSrc, /message_kind:\s*"voice"/);

  const migrationSrc = fs.readFileSync(
    path.join(__dirname, "../../../../supabase/migrations/20261231222000_pos_messaging_state.sql"),
    "utf8",
  );
  const checkMatch = migrationSrc.match(
    /inquiry_messages_message_kind_check[\s\S]*?CHECK \(message_kind = ANY \(ARRAY\[([\s\S]*?)\]\)\)/,
  );
  assert.ok(checkMatch, "expected to find the message_kind CHECK constraint");
  assert.doesNotMatch(checkMatch![1]!, /'voice'/);
});

test("detects a voice bubble from metadata.voice regardless of message_kind", () => {
  // Mirrors the shape written by insertVoiceRows: message_kind="text",
  // metadata.voice carries the playback data. The reader must not care
  // what message_kind says.
  const meta = readVoiceMetaFromMessageMetadata({
    voice: {
      attachmentId: "att-9",
      storagePath: "tenant/inquiry/uuid-voice.webm",
      durationMs: 1000,
      mimeType: "audio/webm",
      byteSize: 2048,
    },
  });
  assert.ok(meta);
  assert.equal(meta?.attachmentId, "att-9");
});
