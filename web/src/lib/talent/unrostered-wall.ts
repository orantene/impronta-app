/**
 * The talent home wall ("Profile created — you're in") is only for a talent
 * who has no agency roster and no site of their own.
 * A roster membership or a published personal site means Today is theirs.
 */
export type UnrosteredWallFacts = {
  hasRoster: boolean;
  hasOwnSite: boolean;
};

export function showUnrosteredTalentWall(facts: UnrosteredWallFacts): boolean {
  return facts.hasRoster === false && facts.hasOwnSite === false;
}

/** A personal site counts once it is published. A draft row does not. */
export function talentSiteRowIsOwnSite(row: {
  status?: string | null;
  sitePublishedAt?: string | null;
  hasPublishedSnapshot?: boolean;
} | null): boolean {
  if (!row) return false;
  if (row.status === "published") return true;
  if (row.sitePublishedAt) return true;
  return row.hasPublishedSnapshot === true;
}
