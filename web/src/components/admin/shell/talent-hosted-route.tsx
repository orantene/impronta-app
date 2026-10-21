"use client";

// TUL-1819: hosts a talent server page (today only /talent/trust) inside the
// talent shell body. The route content is published through the same context the
// workspace shell uses; TalentRouter renders it in place of the SPA page body.

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { pathIsTalentShellHosted } from "./canonical-routes";
import { CanonicalRouteChildrenProvider } from "./internal/canonical-route-children";

export function TalentHostedRoute({ route, children }: { route: ReactNode; children: ReactNode }) {
  const hosted = pathIsTalentShellHosted(usePathname());
  return (
    <CanonicalRouteChildrenProvider value={hosted ? route : null}>
      {!hosted && route}
      {children}
    </CanonicalRouteChildrenProvider>
  );
}
