"use client";

/**
 * Full-page host for the shared tenant management sections. Provides the
 * `onChanged` refresh hook (router.refresh) that re-runs the server page
 * loader after a mutation.
 */

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { TenantSectionStack } from "../tenant-sections";
import type { TenantManagementDetail } from "../../../tenant-management-data";

export function TenantDetailPageBody({
  detail,
}: {
  detail: TenantManagementDetail;
}) {
  const router = useRouter();
  const onChanged = useCallback(() => router.refresh(), [router]);
  return (
    <TenantSectionStack detail={detail} onChanged={onChanged} mode="page" />
  );
}
