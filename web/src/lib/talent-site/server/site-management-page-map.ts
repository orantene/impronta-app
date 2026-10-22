/**
 * Pure row -> view-model mapping for the `/talent/site` manager's page list.
 * Split out of site-management-actions.ts ("use server" files may only export
 * async actions, and that file is size-ratcheted). Behaviour is unchanged.
 */
import type { MaxSiteManagerPage } from "./site-management-types";

type ManagerPageRow = {
  id: string;
  slug: string;
  title: string;
  nav_label: string | null;
  status: string;
  is_home: boolean;
  sort_order: number;
  published_at: string | null;
  updated_at: string;
};

export function mapManagerPageRows(pageRows: unknown): MaxSiteManagerPage[] {
  return ((pageRows ?? []) as ManagerPageRow[]).map((p) => ({
    id: p.id,
    slug: p.slug,
    title: p.title,
    navLabel: p.nav_label,
    status: p.status,
    isHome: p.is_home,
    sortOrder: p.sort_order,
    publishedAt: p.published_at,
    updatedAt: p.updated_at,
  }));
}
