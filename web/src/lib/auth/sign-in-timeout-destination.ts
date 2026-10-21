import { normalizeNextPath } from "@/lib/auth-flow";

/**
 * TUL-1784 (consultant): where a sign-in goes when the access-profile read TIMED OUT. A timed-out read is "we do not
 * know", not "no profile": treating it as no profile sent returning talents and staff to /onboarding/role. So the
 * visitor goes to their requested `next` when it is safe, otherwise to "/" (which re-resolves the right surface from
 * the session). `normalizeNextPath` is the same guard the form uses and falls back to "/" itself. Only a genuinely
 * missing profile row (the read answered, with null) keeps the no-profile routing.
 */
export function signInTimeoutDestination(nextPath: string | null | undefined): string {
  return normalizeNextPath(nextPath, "/");
}
