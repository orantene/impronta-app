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
