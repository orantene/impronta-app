"use client";

import { completeReplayUploadAction, mintReplayUploadAction } from "./replay-actions";
import { snapshotReplayBuffer } from "./recorder";

/** Best-effort: ticket create already succeeded if this fails. */
export async function uploadReplayForTicket(ticketId: string): Promise<void> {
  const chunks = snapshotReplayBuffer();
  if (chunks.length === 0) return;
  const mint = await mintReplayUploadAction({ ticketId, chunkCount: chunks.length, kind: "buffer" });
  if (!mint.ok) return;
  const manifest: Array<{ index: number; path: string; bytes: number }> = [];
  const started = chunks[0]?.fromTs ?? Date.now();
  const ended = chunks[chunks.length - 1]?.toTs ?? Date.now();
  for (const u of mint.uploads) {
    const body = chunks[u.index]?.packed ?? "";
    try {
      await fetch(u.signedUrl, {
        method: "PUT",
        body,
        headers: { "Content-Type": "application/octet-stream" },
      });
    } catch {
      return;
    }
    manifest.push({ index: u.index, path: u.path, bytes: body.length });
  }
  await completeReplayUploadAction({
    sessionId: mint.sessionId,
    chunks: manifest,
    durationMs: Math.max(0, ended - started),
    eventCount: chunks.length,
  });
}
