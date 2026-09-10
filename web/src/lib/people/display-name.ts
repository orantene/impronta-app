/**
 * display-name.ts — a person's name, or the absence of one.
 *
 * THE DEFECT THIS MODULE IS THE FIX FOR. `loadWorkspaceTeamMembers` used to
 * read a member's name as
 *
 *     profile?.display_name?.trim() || row.profile_id.slice(0, 8)
 *
 * so a member whose profile carries no `display_name` arrived with eight
 * characters of their auth user id ALREADY SUBSTITUTED as their name. Every
 * "unnamed person" fallback downstream was therefore dead code that could not
 * fire, and what an operator actually saw in the People list and the Team
 * drawer was a raw identifier: `33330001`. A hex fragment is not a name, and no
 * screen could tell it from one.
 *
 * THE RULE. A reader returns what it has. `""` means "this workspace does not
 * know this person's name" — a real answer, distinct from any name — and the
 * SCREEN decides how to say so, in the reader's language, at the moment it
 * renders. The People list says "Unnamed person"; the website page cards
 * deliberately print nothing at all. Both are correct, and neither is possible
 * if the reader has already answered for them.
 *
 * PURITY: no imports. Read from a server reader, a client drawer and plain
 * node tests alike.
 */

/** A profile row, as narrow as a name needs it. */
export type NamedProfile = { readonly display_name?: string | null } | null | undefined;

/**
 * The name this workspace holds for a person, or `""` when it holds none.
 *
 * NEVER a placeholder, NEVER an identifier, and never the caller's guess. A
 * whitespace-only `display_name` is absence too: it renders as nothing, so
 * treating it as a name would put a blank row in a list of people.
 */
export function personDisplayName(profile: NamedProfile): string {
  return profile?.display_name?.trim() ?? "";
}

/**
 * What a screen shows in place of a missing name.
 *
 * The caller passes its OWN translated string, because this module has no
 * translator and a server-rendered English placeholder would disagree with the
 * operator's language on first paint. This exists so the two halves of the rule
 * — absence, and what to say about it — are named together rather than
 * rediscovered as a `||` at each call site.
 */
export function personNameOr(name: string, whenAbsent: string): string {
  return name.trim() === "" ? whenAbsent : name;
}
