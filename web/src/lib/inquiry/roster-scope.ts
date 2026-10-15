/** P0: on a per-talent page the guest roster is that talent only; with no talent it is unchanged. */
export function scopeRosterToTalent<T extends { id: string }>(roster: readonly T[], talentProfileId: string | null | undefined): T[] {
  return talentProfileId ? roster.filter((r) => r.id === talentProfileId) : [...roster];
}
