import type { CapabilityKey } from "@/lib/access";

/**
 * TUL-1708: the capability each WRITE action in the talent profile taxonomy
 * & fields area (profile sections, skills, extras, hub face, field values,
 * contexts, languages, service areas) requires, passed straight into
 * `requireWorkspaceStaffAction({ capability })`. The guard's default
 * capability is `agency.workspace.view`, which a `viewer` holds — every
 * writer below names its own so a viewer can no longer mutate talent
 * profile content. Reads keep the default and are not listed here.
 *
 * `agency.roster.edit` ("Edit overlay data... for a rostered talent",
 * editor role and above) is the capability already gating this exact
 * surface — the admin shell's roster/[id] actions, extended-actions and
 * media-release files all use it, and the drawers that call every action
 * below (`src/components/admin/shell/internal/**`) sit behind the same
 * roster editor. `agency.roster.invite` (manager and above) is used only
 * for the two actions that send a claim-invite communication on the
 * agency's behalf, matching the bar `agency.roster.invite` already sets
 * for outbound roster invitations.
 *
 * One map per source file, grouped under this single shared module per
 * `web/src/lib/server-actions`'s existing convention of one small
 * capability-map file alongside the write-capabilities precedent in
 * `web/src/lib/messaging/write-capabilities.ts`.
 */

export const PROFILE_SECTIONS_WRITE_CAPABILITY = {
  updateTalentAbout: "agency.roster.edit",
  updateTalentLocation: "agency.roster.edit",
  updateTalentRates: "agency.roster.edit",
  updateTalentAvailability: "agency.roster.edit",
  updateTalentCredits: "agency.roster.edit",
  updateTalentLimits: "agency.roster.edit",
  updateTalentSocialProof: "agency.roster.edit",
  updateTalentMediaAlbums: "agency.roster.edit",
  updateTalentDocuments: "agency.roster.edit",
  updateRosterMeta: "agency.roster.edit",
  commitTalentProfileShellAdmin: "agency.roster.edit",
  assignTalentTaxonomyBySlug: "agency.roster.edit",
  removeTalentTaxonomyBySlug: "agency.roster.edit",
  emitProfileEvent: "agency.roster.edit",
  // Sends/resends a claim-invite email or SMS on the agency's behalf —
  // the same bar as inviting talent onto the roster in the first place.
  sendTalentClaimInvite: "agency.roster.invite",
  resendTalentClaimInvite: "agency.roster.invite",
} as const satisfies Record<string, CapabilityKey>;

export const SKILLS_WRITE_CAPABILITY = {
  addSkill: "agency.roster.edit",
  addSkills: "agency.roster.edit",
  setTalentProfileSkills: "agency.roster.edit",
  updateSkill: "agency.roster.edit",
  removeSkill: "agency.roster.edit",
  verifySkill: "agency.roster.edit",
  unverifySkill: "agency.roster.edit",
  reorderSkills: "agency.roster.edit",
  setFeaturedSkill: "agency.roster.edit",
  upsertAgencySkillOverride: "agency.roster.edit",
  clearAgencySkillOverride: "agency.roster.edit",
  addAspiration: "agency.roster.edit",
  removeAspiration: "agency.roster.edit",
  requestNewTaxonomyTerm: "agency.roster.edit",
} as const satisfies Record<string, CapabilityKey>;

export const EXTRAS_WRITE_CAPABILITY = {
  createTrustBadge: "agency.roster.edit",
  updateTrustBadge: "agency.roster.edit",
  createPermissionRequest: "agency.roster.edit",
  respondToPermissionRequest: "agency.roster.edit",
  revokeDataGrant: "agency.roster.edit",
  addExternalCalendar: "agency.roster.edit",
  removeExternalCalendar: "agency.roster.edit",
  addAgencyMedia: "agency.roster.edit",
  removeAgencyMedia: "agency.roster.edit",
  reorderAgencyMedia: "agency.roster.edit",
  computeProfileCompleteness: "agency.roster.edit",
  touchTalentLastActive: "agency.roster.edit",
} as const satisfies Record<string, CapabilityKey>;

export const HUB_FACE_WRITE_CAPABILITY = {
  actionSetTalentHubCover: "agency.roster.edit",
  actionSetTalentHubSelection: "agency.roster.edit",
  actionSetTalentHubMediaCaption: "agency.roster.edit",
  actionSetTalentHubMediaVisibility: "agency.roster.edit",
  actionReorderTalentHubMedia: "agency.roster.edit",
} as const satisfies Record<string, CapabilityKey>;

export const FIELD_VALUES_WRITE_CAPABILITY = {
  setTalentFieldValue: "agency.roster.edit",
  setTalentFieldVisibility: "agency.roster.edit",
} as const satisfies Record<string, CapabilityKey>;

export const CONTEXTS_WRITE_CAPABILITY = {
  setTalentProfileContexts: "agency.roster.edit",
} as const satisfies Record<string, CapabilityKey>;

export const LANGUAGES_WRITE_CAPABILITY = {
  saveTalentLanguages: "agency.roster.edit",
  setTalentLanguages: "agency.roster.edit",
} as const satisfies Record<string, CapabilityKey>;

export const SERVICE_AREAS_WRITE_CAPABILITY = {
  saveTalentServiceAreas: "agency.roster.edit",
} as const satisfies Record<string, CapabilityKey>;
