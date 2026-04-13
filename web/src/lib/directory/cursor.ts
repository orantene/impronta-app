import type { DirectoryCursor } from "./types";

function toBase64Url(json: string): string {
  return Buffer.from(json, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function fromBase64Url(s: string): string {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + pad;
  return Buffer.from(b64, "base64").toString("utf8");
}

export function encodeDirectoryCursor(c: DirectoryCursor): string {
  return toBase64Url(JSON.stringify({ o: c.offset }));
}

export function decodeDirectoryCursor(token: string): DirectoryCursor | null {
  try {
    const raw = fromBase64Url(token);
    const o = JSON.parse(raw) as { o?: number };
    if (typeof o.o === "number" && Number.isFinite(o.o) && o.o >= 0) {
      return { offset: o.o };
    }
    return null;
  } catch {
    return null;
  }
}
