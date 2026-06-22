/**
 * Unit tests for the thumbnail chunking + variant-rank logic introduced in
 * fetch-directory-page.ts (P3-THUMB workstream).
 *
 * These tests use the exported `chunkAndMergeThumbs` helper so they exercise
 * the real production code path without requiring a live Supabase connection.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { chunkAndMergeThumbs } from "@/lib/directory/fetch-directory-page";

// ---------------------------------------------------------------------------
// (a) Hero-only talent resolves a non-null thumbnail URL
// ---------------------------------------------------------------------------

test("hero-only talent resolves a non-null URL via the chunk helper", async () => {
  const heroProfileId = "prof-hero-only";

  // Simulate what loadTalentCardThumbs returns for a hero-only talent:
  // it uses rank card=0 > hero=1, so with only a hero asset it returns the hero URL.
  const mockFn = async (chunk: string[]): Promise<Map<string, string>> => {
    const result = new Map<string, string>();
    if (chunk.includes(heroProfileId)) {
      result.set(heroProfileId, "https://cdn.example.com/hero.jpg");
    }
    return result;
  };

  const out = await chunkAndMergeThumbs([heroProfileId], mockFn);

  assert.ok(out.has(heroProfileId), "hero-only talent must be present in the result map");
  assert.notEqual(out.get(heroProfileId), null, "hero-only talent URL must not be null");
  assert.equal(out.get(heroProfileId), "https://cdn.example.com/hero.jpg");
});

// ---------------------------------------------------------------------------
// (b) >450 ids are chunked — no single call receives an oversized batch
// ---------------------------------------------------------------------------

test("501 ids are split across two chunks, each under the 450 limit", async () => {
  const ids = Array.from({ length: 501 }, (_, i) => `profile-${i}`);
  const receivedChunkSizes: number[] = [];

  const mockFn = async (chunk: string[]): Promise<Map<string, string>> => {
    receivedChunkSizes.push(chunk.length);
    return new Map(chunk.map((id) => [id, `https://cdn.example.com/${id}.jpg`]));
  };

  const out = await chunkAndMergeThumbs(ids, mockFn, 450);

  assert.equal(receivedChunkSizes.length, 2, "501 ids with chunk size 450 must produce exactly 2 calls");
  assert.ok(
    receivedChunkSizes.every((size) => size <= 450),
    `every chunk must be ≤ 450 ids; got: [${receivedChunkSizes.join(", ")}]`,
  );
  assert.equal(receivedChunkSizes[0], 450, "first chunk must be exactly 450");
  assert.equal(receivedChunkSizes[1], 51, "second chunk must be the remainder (51)");
  assert.equal(out.size, 501, "merged result must contain all 501 entries");
});

test("exactly 450 ids go in a single chunk", async () => {
  const ids = Array.from({ length: 450 }, (_, i) => `profile-${i}`);
  const receivedChunkSizes: number[] = [];

  const mockFn = async (chunk: string[]): Promise<Map<string, string>> => {
    receivedChunkSizes.push(chunk.length);
    return new Map();
  };

  await chunkAndMergeThumbs(ids, mockFn, 450);

  assert.equal(receivedChunkSizes.length, 1, "exactly 450 ids must fit in a single chunk");
  assert.equal(receivedChunkSizes[0], 450);
});

test("empty id list returns empty map without calling fn", async () => {
  let callCount = 0;
  const mockFn = async (_chunk: string[]): Promise<Map<string, string>> => {
    callCount++;
    return new Map();
  };

  const out = await chunkAndMergeThumbs([], mockFn, 450);

  assert.equal(callCount, 0, "fn must not be called when id list is empty");
  assert.equal(out.size, 0);
});

test("results from all chunks are merged into a single Map", async () => {
  const ids = ["a", "b", "c", "d", "e"];
  const mockFn = async (chunk: string[]): Promise<Map<string, string>> => {
    return new Map(chunk.map((id) => [id, `url-for-${id}`]));
  };

  const out = await chunkAndMergeThumbs(ids, mockFn, 2);

  assert.equal(out.size, 5);
  for (const id of ids) {
    assert.equal(out.get(id), `url-for-${id}`);
  }
});
