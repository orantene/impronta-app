const MAX_MS = 3 * 60 * 1000;
const MAX_BYTES = 5 * 1024 * 1024;

export type PackedChunk = {
  seq: number;
  packed: string;
  fromTs: number;
  toTs: number;
  bytes: number;
};

/**
 * In-memory ring of packed rrweb events. Drops the oldest chunks until the
 * window is under 3 minutes and 5MB packed, whichever bound is tighter.
 */
export class ReplayRingBuffer {
  private chunks: PackedChunk[] = [];
  private seq = 0;
  private bytes = 0;

  push(packed: string, fromTs: number, toTs: number): void {
    const bytes = packed.length;
    this.chunks.push({ seq: this.seq, packed, fromTs, toTs, bytes });
    this.seq += 1;
    this.bytes += bytes;
    this.trim();
  }

  private trim(): void {
    const cutoff = Date.now() - MAX_MS;
    while (this.chunks.length > 0 && (this.bytes > MAX_BYTES || this.chunks[0]!.fromTs < cutoff)) {
      const gone = this.chunks.shift();
      if (!gone) break;
      this.bytes -= gone.bytes;
    }
  }

  snapshot(): PackedChunk[] {
    this.trim();
    return this.chunks.slice();
  }

  get eventCount(): number {
    return this.chunks.length;
  }

  get totalBytes(): number {
    return this.bytes;
  }

  clear(): void {
    this.chunks = [];
    this.bytes = 0;
  }
}
