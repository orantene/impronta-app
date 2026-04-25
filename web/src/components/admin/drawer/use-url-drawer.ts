"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/**
 * useUrlDrawer — persist a drawer's open id in the URL via `?d=<id>`.
 *
 * Same shape as React.useState, but state is mirrored into the query string
 * so:
 *   - Browser back/forward closes/reopens the drawer
 *   - Deep links share the open drawer (`/admin/account?d=plan`)
 *   - Page refresh restores it
 *
 * The default `paramName` is `d`; pass a different name to host two drawers
 * on the same page (e.g. `d` for primary, `d2` for nested detail).
 *
 *   const [openId, setOpenId] = useUrlDrawer<DrawerId>();
 *
 * The id type is up to the caller — use a string-union for type safety.
 *
 * Why scroll: false → setting query params would otherwise bounce the page to
 * the top, jarring on a long account page when you simply open a drawer.
 */
export function useUrlDrawer<TId extends string>(paramName = "d"): [
  TId | null,
  (next: TId | null) => void,
] {
  const pathname = usePathname() ?? "/";
  const searchParams = useSearchParams();
  const router = useRouter();

  const current = (searchParams?.get(paramName) ?? null) as TId | null;

  const setOpenId = React.useCallback(
    (next: TId | null) => {
      const sp = new URLSearchParams(searchParams?.toString() ?? "");
      if (next) sp.set(paramName, next);
      else sp.delete(paramName);
      const qs = sp.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, paramName, router, searchParams],
  );

  return [current, setOpenId];
}
