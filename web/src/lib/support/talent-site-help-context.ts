/**
 * Pure helpers for talent-site footer Help → marketing contact tickets (TUL-310).
 * Host + profile_code travel as query params, then into ticket metadata / talent_profile_id.
 */

/** Hostname only: no scheme, path, or junk. */
export function sanitizeTalentSiteHost(raw: string | null | undefined): string | null {
  const s = (raw ?? "").trim().toLowerCase();
  if (!s || s.length > 253) return null;
  if (!/^[a-z0-9.-]+$/.test(s)) return null;
  if (s.includes("..") || s.startsWith(".") || s.startsWith("-")) return null;
  if (s.endsWith(".") || s.endsWith("-")) return null;
  return s;
}

/** Public talent code (e.g. TAL-93900). Reject empty / oversized / control chars. */
export function sanitizeTalentProfileCode(raw: string | null | undefined): string | null {
  const s = (raw ?? "").trim();
  if (!s || s.length > 64) return null;
  if (!/^[A-Za-z0-9_-]+$/.test(s)) return null;
  return s;
}

export type TalentSiteHelpContactContext = {
  source: "talent_site_footer";
  host: string | null;
  profileCode: string | null;
};

/** Parse marketing /contact query (or form fields) into a safe attach payload. */
export function parseTalentSiteHelpContactInput(input: {
  source?: string | null;
  host?: string | null;
  code?: string | null;
}): TalentSiteHelpContactContext | null {
  const source = (input.source ?? "").trim().toLowerCase();
  if (source !== "talent-site" && source !== "talent_site" && source !== "talent_site_footer") {
    return null;
  }
  return {
    source: "talent_site_footer",
    host: sanitizeTalentSiteHost(input.host),
    profileCode: sanitizeTalentProfileCode(input.code),
  };
}
