/**
 * Talent profile_code helpers.
 *
 * Live codes are numeric (`TAL-<digits>`). Retired vanity codes live in
 * `talent_profile_code_aliases` and resolve through
 * `public.resolve_talent_profile_code`.
 */

export const TALENT_PROFILE_CODE_NUMERIC_RE = /^TAL-[0-9]+$/;

export function isNumericTalentProfileCode(code: string): boolean {
  return TALENT_PROFILE_CODE_NUMERIC_RE.test(code);
}

export type ResolvedTalentProfileCode = {
  profileId: string;
  /** Live canonical code on talent_profiles.profile_code. */
  profileCode: string;
  /** The code the caller asked for. */
  requestedCode: string;
  isAlias: boolean;
};

type RpcRow = {
  profile_id: string;
  profile_code: string;
  requested_code: string;
  is_alias: boolean;
};

type RpcClient = {
  rpc: (
    fn: "resolve_talent_profile_code",
    args: { p_code: string },
  ) => PromiseLike<{ data: RpcRow[] | RpcRow | null; error: { message?: string } | null }>;
};

/** Normalize a path/query profile code segment. */
export function normalizeTalentProfileCodeInput(raw: string): string {
  return decodeURIComponent(raw).trim();
}

/**
 * Resolve a TAL code or retired vanity alias to the live profile row.
 * Returns null when the code is unknown (or the RPC is unreachable).
 */
export async function resolveTalentProfileCode(
  client: RpcClient,
  rawCode: string,
): Promise<ResolvedTalentProfileCode | null> {
  const requestedCode = normalizeTalentProfileCodeInput(rawCode);
  if (!requestedCode) return null;

  const { data, error } = await client.rpc("resolve_talent_profile_code", {
    p_code: requestedCode,
  });
  if (error) return null;

  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.profile_id || !row.profile_code) return null;

  return {
    profileId: row.profile_id,
    profileCode: row.profile_code,
    requestedCode: row.requested_code ?? requestedCode,
    isAlias: Boolean(row.is_alias),
  };
}

/**
 * Build the permanent redirect target for an aliased /t/<old> request.
 * Preserves the remainder of the path after the code segment and the query.
 */
export function talentProfileAliasRedirectPath(input: {
  canonicalCode: string;
  pathname: string;
  requestedCode: string;
  search?: string;
}): string | null {
  const { canonicalCode, pathname, requestedCode, search } = input;
  if (!canonicalCode || canonicalCode === requestedCode) return null;

  const marker = `/t/${requestedCode}`;
  const idx = pathname.indexOf(marker);
  if (idx === -1) {
    // Fall back: replace the first /t/<segment> only.
    const rebuilt = pathname.replace(
      /\/t\/[^/]+/,
      `/t/${encodeURIComponent(canonicalCode)}`,
    );
    if (rebuilt === pathname) return null;
    return `${rebuilt}${search ?? ""}`;
  }

  const before = pathname.slice(0, idx);
  const after = pathname.slice(idx + marker.length);
  return `${before}/t/${encodeURIComponent(canonicalCode)}${after}${search ?? ""}`;
}
