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
  const payload =
    c.mode === "classic_after_hybrid"
      ? {
          v: 2 as const,
          o: c.offset,
          m: "h1" as const,
          ...(c.hybridContextStamp ? { h: c.hybridContextStamp } : {}),
        }
      : { o: c.offset };
  return toBase64Url(JSON.stringify(payload));
}

export function decodeDirectoryCursor(token: string): DirectoryCursor | null {
  try {
    const raw = fromBase64Url(token);
    const p = JSON.parse(raw) as {
      v?: number;
      o?: number;
      m?: string;
      h?: string;
    };
    if (typeof p.o !== "number" || !Number.isFinite(p.o) || p.o < 0) {
      return null;
    }
    const mode = p.m === "h1" ? ("classic_after_hybrid" as const) : undefined;
    const hybridContextStamp =
      typeof p.h === "string" && p.h.length > 0 ? p.h : undefined;
    return {
      offset: p.o,
      ...(mode ? { mode } : {}),
      ...(hybridContextStamp ? { hybridContextStamp } : {}),
    };
  } catch {
    return null;
  }
}
