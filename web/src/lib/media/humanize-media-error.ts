/**
 * TUL-87 — the media library must never show a developer error.
 *
 * When a media API request is answered with an HTML page (a 404, a redirect, a
 * sign-in wall) `res.json()` throws `SyntaxError: Unexpected token '<'`, and a
 * dropped connection throws `Failed to fetch`. Both used to reach the owner
 * verbatim. This maps those to one plain sentence; anything else the server
 * said on purpose (a quota message, a file-type refusal) passes through.
 *
 * Plain module (no "use client"): shared by the library hook, both drawers and
 * the image field.
 */

const UNREACHABLE_RE =
  /syntaxerror|unexpected token|not valid json|unexpected end of json|<!doctype|<html|failed to fetch|networkerror|load failed|request failed|http (404|502|503|504)/i;

/** Locale key holding the plain-language sentence (en + es in messages/). */
export const MEDIA_UNREACHABLE_KEY = "dashboard.mediaLibrary.unreachable";

export function isMediaUnreachableError(raw: string | null | undefined): boolean {
  return typeof raw === "string" && UNREACHABLE_RE.test(raw);
}

export function humanizeMediaError(
  raw: string,
  t: (key: string) => string,
): string {
  return isMediaUnreachableError(raw) ? t(MEDIA_UNREACHABLE_KEY) : raw;
}

/**
 * True when a file name is a storage id (a UUID or a long hex run) rather than
 * something a person named. Library uploads are stored under their id, so the
 * URL's last segment would otherwise surface as `5593b56e-...` in the field.
 */
export function isOpaqueFilename(name: string): boolean {
  const stem = name.replace(/\.[a-z0-9]{2,5}$/i, "");
  return (
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(stem) ||
    /^[0-9a-f]{20,}$/i.test(stem)
  );
}

/**
 * Parse a media API response as JSON without ever throwing a `SyntaxError`.
 * A non-JSON body becomes an error whose message `humanizeMediaError` maps.
 */
export async function readMediaJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`HTTP ${res.status} not valid JSON`);
  }
}
