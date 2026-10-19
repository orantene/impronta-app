/**
 * Whether the proxy lets `/api/dev/*` and `/dev/*` through without host gating (TUL-1269).
 *
 * A `Host: something.local` header is client-controlled, so it may only count where the server is
 * not a Vercel deployment. On Vercel the flag comes from deployment env alone: previews, or an
 * explicit TULALA_ALLOW_DEV_SURFACES. Production never gets it from a Host header.
 */
export type DevSurfaceEnv = {
  TULALA_ALLOW_DEV_SURFACES?: string;
  NODE_ENV?: string;
  VERCEL_ENV?: string;
  VERCEL?: string;
};

export function allowDevSurfacesFor(env: DevSurfaceEnv, hostHeader: string | null): boolean {
  if (env.TULALA_ALLOW_DEV_SURFACES === "1") return true;
  if (env.NODE_ENV === "development") return true;
  if (env.VERCEL_ENV === "preview") return true;
  // Isolated harness hosts (`*.local`) survive Edge HMR that re-reads an empty env (D-022); a
  // header is only believable off Vercel.
  if (env.VERCEL) return false;
  return (hostHeader ?? "").split(":")[0].toLowerCase().endsWith(".local");
}
