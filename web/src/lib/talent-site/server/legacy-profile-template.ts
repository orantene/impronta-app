import "server-only";

/**
 * `talent_profiles.profile_template` for the My website live card: names a
 * site built by hand before the design catalog (e.g. `maison`). Read-only; a
 * miss or error is null, which the card shows as "Custom design".
 */
export async function loadLegacyProfileTemplate(
  sb: { from: (table: "talent_profiles") => unknown },
  talentProfileId: string,
): Promise<string | null> {
  try {
    const query = sb.from("talent_profiles") as {
      select: (cols: string) => {
        eq: (col: string, v: string) => {
          maybeSingle: () => PromiseLike<{ data: { profile_template?: string | null } | null }>;
        };
      };
    };
    const { data } = await query.select("profile_template").eq("id", talentProfileId).maybeSingle();
    return data?.profile_template ?? null;
  } catch {
    return null;
  }
}
