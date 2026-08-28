"use client";

import { pack } from "@rrweb/packer";
import { record } from "rrweb";
import type { eventWithTime } from "@rrweb/types";
import { ReplayRingBuffer, type PackedChunk } from "./buffer";
import { SUPPORT_REPLAY_MASK } from "./mask-config";

type Stop = () => void;

let stop: Stop | null = null;
let checkpoint: ReturnType<typeof setInterval> | null = null;
const buffer = new ReplayRingBuffer();
let batch: string[] = [];
let batchFrom = 0;
let batchBytes = 0;

function flushBatch(): void {
  if (batch.length === 0) return;
  const packed = batch.join("\n");
  const toTs = Date.now();
  buffer.push(packed, batchFrom || toTs, toTs);
  batch = [];
  batchFrom = 0;
  batchBytes = 0;
}

function asPacked(event: unknown): string {
  if (typeof event === "string") return event;
  try {
    return pack(event as eventWithTime);
  } catch {
    return JSON.stringify(event);
  }
}

export function startReplayBuffer(): void {
  if (stop || typeof window === "undefined") return;
  buffer.clear();
  stop = record({
    ...SUPPORT_REPLAY_MASK,
    packFn: pack,
    emit(event) {
      const packed = asPacked(event);
      if (batch.length === 0) batchFrom = Date.now();
      batch.push(packed);
      batchBytes += packed.length;
      if (batch.length >= 40 || batchBytes >= 180_000) flushBatch();
    },
    checkoutEveryNms: 30_000,
  }) as Stop;
  checkpoint = setInterval(() => {
    try {
      record.takeFullSnapshot?.();
    } catch {
      /* ignore */
    }
    flushBatch();
  }, 30_000);
}

export function stopReplayBuffer(): PackedChunk[] {
  flushBatch();
  if (checkpoint) {
    clearInterval(checkpoint);
    checkpoint = null;
  }
  if (stop) {
    stop();
    stop = null;
  }
  return buffer.snapshot();
}

export function snapshotReplayBuffer(): PackedChunk[] {
  flushBatch();
  return buffer.snapshot();
}

export function takeReplayCheckpoint(): void {
  try {
    record.takeFullSnapshot?.();
  } catch {
    /* ignore */
  }
  flushBatch();
}
