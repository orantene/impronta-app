/**
 * The one rule behind the public "Verified" mark.
 *
 * ─── THE RULE, from the Verification Zone spec (2026-09-06) ─────────────────
 *
 *   Verified  =  identity verified
 *             OR (phone verified AND a social account connected)
 *
 * Only those three signals count. Everything else a profile can hold is real
 * and useful and says nothing about whether this is a real, reachable person:
 *
 *   skills_verified   an agency vouching for craft, not identity
 *   media_authentic   a photo provenance check, not a person check
 *
 * ─── WHAT THE BRIEF SAID, AND WHAT THE DATA SAID ────────────────────────────
 *
 * The brief was that "the directory tier counts badges of any kind, so 45 admin
 * skill checks read as trust". Measured on production before writing this, that
 * is NOT what happens: the discover index's `trust_counts` CTE already filters
 * `scope = 'platform'`, and all 45 `skills_verified` badges are `scope =
 * 'agency'`, so they have never counted. Zero profiles are above basic on
 * agency badges alone.
 *
 *   Nalea   identity/platform + skills_verified/agency   -> verified (1 badge)
 *   Tina    identity + media_authentic /platform + skills/agency -> silver (2)
 *
 * The defect is real but smaller and differently shaped: the tier is a COUNT of
 * any platform badge, so `media_authentic` buys a rung, and a count ladder is
 * not the spec's rule. Tina reads "silver" for holding a photo-provenance check.
 *
 * ─── WHY THIS DERIVES FROM BADGES, NOT FROM `trust_tier` ────────────────────
 *
 * `trust_tier` is computed inside the `talent_discover_index` MATERIALIZED VIEW
 * and is stale until the next refresh. The spec requires that "a profile that
 * loses a badge loses the mark the same minute", which a matview cannot promise.
 * So the public mark reads the badge rows directly and the matview's tier stays
 * what it is for filtering and ranking — a separate change, because recreating
 * that view means dropping and rebuilding its indexes and is not something to
 * bundle with a UI change.
 */

/** Badge kinds that count toward the public mark. Nothing else does. */
export const VERIFYING_BADGE_KINDS = ["identity", "phone", "social"] as const;
export type VerifyingBadgeKind = (typeof VERIFYING_BADGE_KINDS)[number];

export type TrustBadgeRow = {
  badge_kind: string;
  status: string;
  scope: string;
  verified_at: string | null;
  expires_at: string | null;
};

export type VerifiedLine = {
  kind: VerifyingBadgeKind;
  /** "ID verified", "Phone verified", "Instagram connected" — hover copy. */
  label: string;
  /** ISO date the badge was verified, or null when the row never recorded one. */
  verifiedAt: string | null;
};

export type VerifiedMark = {
  verified: boolean;
  /** One line per signal that counted, for the hover. Empty when not verified. */
  lines: VerifiedLine[];
};

const LABELS: Record<VerifyingBadgeKind, string> = {
  identity: "ID verified",
  phone: "Phone verified",
  social: "Social account connected",
};

/**
 * A badge counts only when it is verified, platform-scoped and unexpired.
 *
 * `scope` is load-bearing: an agency vouching for its own talent must never
 * mint a platform trust signal, which is the whole reason the 45 agency skill
 * badges are invisible here.
 */
function counts(row: TrustBadgeRow, now: Date): boolean {
  if (row.status !== "verified") return false;
  if (row.scope !== "platform") return false;
  if (row.expires_at && new Date(row.expires_at) <= now) return false;
  return (VERIFYING_BADGE_KINDS as readonly string[]).includes(row.badge_kind);
}

export function buildVerifiedMark(
  badges: readonly TrustBadgeRow[] | null | undefined,
  now: Date = new Date(),
): VerifiedMark {
  const held = new Map<VerifyingBadgeKind, string | null>();
  for (const row of badges ?? []) {
    if (!counts(row, now)) continue;
    const kind = row.badge_kind as VerifyingBadgeKind;
    // Keep the EARLIEST verification date: "verified since" reads better than
    // the date of the most recent re-check, and a re-issued badge should not
    // make a long-standing account look new.
    const existing = held.get(kind);
    if (existing === undefined) held.set(kind, row.verified_at);
    else if (row.verified_at && existing && row.verified_at < existing) {
      held.set(kind, row.verified_at);
    } else if (existing === null) held.set(kind, row.verified_at);
  }

  const hasIdentity = held.has("identity");
  const verified = hasIdentity || (held.has("phone") && held.has("social"));
  if (!verified) return { verified: false, lines: [] };

  // Listed in ladder order so the hover reads the same way every time.
  const lines: VerifiedLine[] = [];
  for (const kind of VERIFYING_BADGE_KINDS) {
    if (!held.has(kind)) continue;
    lines.push({ kind, label: LABELS[kind], verifiedAt: held.get(kind) ?? null });
  }
  return { verified: true, lines };
}

/**
 * "ID verified · March 2026" — the hover line a visitor reads.
 *
 * Month precision on purpose: the day someone photographed their passport is
 * not a visitor's business, and a precise timestamp invites the reader to treat
 * a check as fresher or staler than it is.
 */
export function formatVerifiedLine(line: VerifiedLine, locale = "en"): string {
  if (!line.verifiedAt) return line.label;
  const d = new Date(line.verifiedAt);
  if (Number.isNaN(d.getTime())) return line.label;
  const when = d.toLocaleDateString(locale === "es" ? "es" : "en", {
    month: "long",
    year: "numeric",
  });
  return `${line.label} · ${when}`;
}
