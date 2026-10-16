/**
 * Where "Exit and return to admin" lands (TUL-255). Platform staff started the
 * impersonation from /platform/admin, so they go back there; the bare /admin
 * resolver would drop them into whichever workspace they happen to own.
 */
export function impersonationExitPath(appRole: string | null | undefined): string {
  return appRole === "super_admin" ? "/platform/admin" : "/admin";
}
