/**
 * TUL-1686: who the client's private note is FOR, so the review forms say it
 * truthfully. Pure (no DB, no server imports): both client forms use it.
 *
 *   team studio  -> the workspace, by name ("Only {workspace} sees this")
 *   other models -> the talent, as before ("Only {talent} sees this")
 *   unknown      -> neutral wording that names no one ("not shown publicly")
 *
 * "Unknown" is a workspace that could not be read (null / missing), or a team
 * studio with no name to show. Never guess the talent when it may be wrong.
 */

/** The review's workspace, as read on the server. null = could not be read. */
export type NoteWorkspace = { workModel: string | null; name: string | null } | null;

export type PrivateNoteAudience =
  | { kind: "workspace"; name: string }
  | { kind: "talent"; name: string }
  | { kind: "neutral" };

const TEAM_STUDIO = "team_studio";

export function privateNoteAudience(
  workspace: NoteWorkspace | undefined,
  talentName: string | null | undefined,
): PrivateNoteAudience {
  if (!workspace) return { kind: "neutral" };
  if (workspace.workModel === TEAM_STUDIO) {
    const name = workspace.name?.trim();
    return name ? { kind: "workspace", name } : { kind: "neutral" };
  }
  const talent = talentName?.trim();
  return talent ? { kind: "talent", name: talent } : { kind: "neutral" };
}

/** The in-workspace form's message key (messages/*.json `public.reviews.form.*`) and its {name}. */
export function privateNoteLabelKey(audience: PrivateNoteAudience): { key: string; name: string | null } {
  if (audience.kind === "workspace") return { key: "public.reviews.form.privateNoteLabelWorkspace", name: audience.name };
  if (audience.kind === "talent") return { key: "public.reviews.form.privateNoteLabel", name: audience.name };
  return { key: "public.reviews.form.privateNoteLabelNeutral", name: null };
}

/** The /review/{token} page's label, from its own copy object (./review-page-copy). */
export function privateNotePageLabel(
  audience: PrivateNoteAudience,
  t: { privateNote: string; privateNoteWorkspace: string; privateNoteNeutral: string },
): string {
  if (audience.kind === "neutral") return t.privateNoteNeutral;
  const template = audience.kind === "workspace" ? t.privateNoteWorkspace : t.privateNote;
  return template.split("{name}").join(audience.name);
}
