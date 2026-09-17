/**
 * The OpenAI image request body — one builder for the three generate paths.
 * Pins: the default is a gpt-image model (dall-e-3 was retired from the API
 * on 2026-09-17), gpt-image bodies carry size + quality, a dall-e override
 * still gets a body that model accepts, and the env override wins.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  DEFAULT_OPENAI_IMAGE_MODEL,
  buildOpenAiImageRequestBody,
  readOpenAiImageResponse,
  resolveOpenAiImageModel,
} from "./openai-image-request";

test("default model is a gpt-image model, never dall-e", () => {
  assert.match(DEFAULT_OPENAI_IMAGE_MODEL, /^gpt-image-/);
  assert.equal(resolveOpenAiImageModel({}), DEFAULT_OPENAI_IMAGE_MODEL);
  assert.equal(resolveOpenAiImageModel({ OPENAI_IMAGE_MODEL: "  " }), DEFAULT_OPENAI_IMAGE_MODEL);
});

test("env override wins", () => {
  assert.equal(resolveOpenAiImageModel({ OPENAI_IMAGE_MODEL: " gpt-image-2 " }), "gpt-image-2");
});

test("gpt-image body carries size and quality; defaults are 1024x1024 / high", () => {
  assert.deepEqual(buildOpenAiImageRequestBody({ prompt: "a studio" }), {
    model: DEFAULT_OPENAI_IMAGE_MODEL,
    prompt: "a studio",
    n: 1,
    size: "1024x1024",
    quality: "high",
  });
  assert.deepEqual(
    buildOpenAiImageRequestBody({ prompt: "wide", model: "gpt-image-2", size: "1536x1024", quality: "medium" }),
    { model: "gpt-image-2", prompt: "wide", n: 1, size: "1536x1024", quality: "medium" },
  );
});

test("a dall-e override still gets a body that model accepts", () => {
  assert.deepEqual(
    buildOpenAiImageRequestBody({ prompt: "p", model: "dall-e-3", size: "1536x1024", quality: "high" }),
    { model: "dall-e-3", prompt: "p", n: 1, size: "1024x1024", quality: "hd" },
  );
  assert.equal(buildOpenAiImageRequestBody({ prompt: "p", model: "dall-e-2", quality: "low" }).quality, "standard");
});

test("response reader prefers b64_json and rejects an empty payload", async () => {
  const bytes = await readOpenAiImageResponse({ data: [{ b64_json: Buffer.from("hi").toString("base64") }] });
  assert.equal(bytes.toString(), "hi");
  await assert.rejects(readOpenAiImageResponse({ data: [] }), /no image/);
  await assert.rejects(readOpenAiImageResponse(null), /no image/);
});
