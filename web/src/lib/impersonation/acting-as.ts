import type { AccessProfileWithDisplayName } from "@/lib/access-profile";

/**
 * TUL-164 (DS-31). Whether the talent dashboard is a REAL impersonation, and
 * what to call the person being acted as. Pure on purpose: the layout feeds it
 * the result of `resolveDashboardIdentity()` (cookie validated against the
 * actor), so "acting as" is never inferred from the owner merely being signed in.
 */
export type TalentActingAs = {
  /** The impersonated person's display name, or null when none is on file. */
  name: string | null;
} | null;

/** A display name only. An email, or its local part, is never a name. */
function cleanDisplayName(raw: string | null | undefined): string | null {
  const trimmed = raw?.trim();
  if (!trimmed || trimmed.includes("@")) return null;
  return trimmed;
}

export function resolveTalentActingAs(
  identity: {
    isImpersonating: boolean;
    effectiveProfile: AccessProfileWithDisplayName | null;
  } | null,
): TalentActingAs {
  if (!identity || !identity.isImpersonating) return null;
  return { name: cleanDisplayName(identity.effectiveProfile?.display_name) };
}

/** The top-bar "Acting as" chip exists only while staff really impersonate. */
export function shouldShowTalentActingChip(actingAs: TalentActingAs | undefined): boolean {
  return actingAs != null;
}

/**
 * TUL-205. The user id a dashboard shell must load its data for: the person
 * being acted as while staff really impersonate, otherwise the signed-in actor.
 * Never the actor's id under impersonation, or the shell shows the staff
 * member's own data (or none, which skips the shell and the banner).
 */
export function resolveShellUserId(
  actorUserId: string,
  identity: { isImpersonating: boolean; effectiveUserId: string } | null,
): string {
  if (!identity || !identity.isImpersonating) return actorUserId;
  return identity.effectiveUserId || actorUserId;
}

export type ActingAsRole = "talent" | "client";

export function actingAsBannerCopy(locale: string, name: string | null, role: ActingAsRole) {
  const es = locale.toLowerCase().startsWith("es");
  const roleLabel =
    role === "client" ? (es ? "Cliente" : "Client") : es ? "Talento" : "Talent";
  return {
    effectiveName: name ?? (es ? "otro usuario" : "another user"),
    roleLabel,
    readOnlyLine: es ? "Estás actuando como" : "You are acting as",
    v1ReadOnlyQaLine: es
      ? "Vista de solo lectura. Los cambios están desactivados mientras actúas como este usuario."
      : "Read-only view. Changes are disabled while you are acting as this user.",
    returnCta: es ? "Salir y volver a admin" : "Exit and return to admin",
    ariaLabel: es ? "Aviso de suplantación" : "Impersonation notice",
  };
}

export function talentActingAsBannerCopy(locale: string, name: string | null) {
  return actingAsBannerCopy(locale, name, "talent");
}
