import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

/** TUL-1622 defence in depth: the two provider calls that sat behind their callers' checks also check the switch. */
const read = (rel: string) => readFileSync(join(__dirname, "..", "..", rel), "utf8");

describe("master switch inside embedTextForSearch and transcribeAudio", () => {
  it("embeddings: checked before the key is read or the API is called", () => {
    const src = read("lib/ai/openai-embeddings.ts");
    const fn = src.slice(src.indexOf("async function embedTextForSearchUncached"));
    const at = fn.indexOf("isAiMasterEnabled()");
    assert.ok(at > 0);
    assert.ok(at < fn.indexOf("resolveOpenAiApiKey()"));
    assert.ok(at < fn.indexOf("api.openai.com"));
    assert.match(fn.slice(at, at + 80), /return null/);
  });

  it("transcription: checked before the key is read or the client is built, and reads as unavailable", () => {
    const src = read("lib/ai/transcribe.server.ts");
    const fn = src.slice(src.indexOf("export async function transcribeAudio"));
    const at = fn.indexOf("isAiMasterEnabled()");
    assert.ok(at > 0);
    assert.ok(at < fn.indexOf("resolveOpenAiApiKey()"));
    assert.ok(at < fn.indexOf("new OpenAI("));
    assert.match(fn.slice(at, at + 120), /code: "not_configured"/);
  });
});
