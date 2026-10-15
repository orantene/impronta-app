/** Message-catalog keys for the client trust tiers (label, hint, rationale). */
export const TRUST_TIER_KEYS = {
  basic: { label: "dashboard.talentDrawers.agency.trustBasicLabel", hint: "dashboard.talentDrawers.agency.trustBasicHint", rationale: "dashboard.talentDrawers.agency.trustBasicRationale" },
  verified: { label: "dashboard.talentDrawers.agency.trustVerifiedLabel", hint: "dashboard.talentDrawers.agency.trustVerifiedHint", rationale: "dashboard.talentDrawers.agency.trustVerifiedRationale" },
  silver: { label: "dashboard.talentDrawers.agency.trustSilverLabel", hint: "dashboard.talentDrawers.agency.trustSilverHint", rationale: "dashboard.talentDrawers.agency.trustSilverRationale" },
  gold: { label: "dashboard.talentDrawers.agency.trustGoldLabel", hint: "dashboard.talentDrawers.agency.trustGoldHint", rationale: "dashboard.talentDrawers.agency.trustGoldRationale" },
} as const;
