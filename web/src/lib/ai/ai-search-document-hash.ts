import { createHash } from "node:crypto";

/** Stable hash for talent_embeddings.document_hash and invalidation checks. */
export function hashAiSearchDocument(document: string): string {
  return createHash("sha256").update(document, "utf8").digest("hex");
}
