"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import {
  DashboardSegmentedNav,
  type DashboardSegmentedNavLink,
} from "@/components/dashboard/dashboard-segmented-nav";

const FIELDS_JUMP_LINKS: DashboardSegmentedNavLink[] = [
  { href: "/admin/fields#how-it-works", label: "How it works" },
  { href: "/admin/fields#add-group", label: "Add group" },
  { href: "/admin/fields#groups-and-fields", label: "Groups & fields" },
];

function useLocationHash() {
  const [hash, setHash] = useState("");
  useEffect(() => {
    setHash(typeof window !== "undefined" ? window.location.hash : "");
    const onHash = () => setHash(window.location.hash);
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  return hash;
}

/**
 * Admin area navigation lives in the main dashboard sidebar (`ADMIN_DASHBOARD_GROUPS`).
 * This strip only adds in-page anchors when editing Fields.
 */
export function AdminQuickNav() {
  const pathname = usePathname() ?? "";
  const hash = useLocationHash();
  const onFields = pathname === "/admin/fields" || pathname.startsWith("/admin/fields/");

  const fieldJumpItems = FIELDS_JUMP_LINKS.map((item) => {
    const itemHash = item.href.includes("#") ? `#${item.href.split("#")[1] ?? ""}` : "";
    return {
      ...item,
      active: pathname === "/admin/fields" && itemHash.length > 0 && hash === itemHash,
    };
  });

  if (!onFields) return null;

  return (
    <DashboardSegmentedNav ariaLabel="Fields quick navigation" items={fieldJumpItems} />
  );
}
