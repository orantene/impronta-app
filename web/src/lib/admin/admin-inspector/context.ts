import { parseAdminPanelParams } from "@/lib/admin/admin-panel-search-params";

import type { InspectorContext } from "./types";

export function buildInspectorContext(
  pathname: string,
  searchParams: URLSearchParams,
): InspectorContext {
  const o: Record<string, string | undefined> = {};
  searchParams.forEach((v, k) => {
    if (!(k in o)) o[k] = v;
  });
  const { apanel, aid } = parseAdminPanelParams(o);
  return { pathname, searchParams, apanel, aid };
}

export function isUuidPathSegment(segment: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    segment,
  );
}

export function pathSegments(pathname: string): string[] {
  return pathname.split("/").filter(Boolean);
}
