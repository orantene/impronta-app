"use client";

import * as React from "react";
import {
  usePathname,
  useRouter,
  useSearchParams,
} from "next/navigation";

import { parsePlan, type Plan } from "./capability-catalog";
import { UpgradeModal } from "./upgrade-modal";
import { useUpgradeModal } from "./upgrade-context";

/**
 * GlobalUpgradeModal — single modal instance mounted at the admin
 * shell level. Reads activePlan from `?plan=` so any admin page can
 * open it via UpgradeModalContext without prop-drilling.
 */
export function GlobalUpgradeModal() {
  const router = useRouter();
  const pathname = usePathname() ?? "/admin";
  const searchParams = useSearchParams();
  const { open, setOpen } = useUpgradeModal();

  const activePlan: Plan = parsePlan(searchParams?.get("plan") ?? undefined);

  function handleSelect(plan: Plan) {
    const params = new URLSearchParams(
      searchParams ? Array.from(searchParams.entries()) : [],
    );
    if (plan === "free") {
      params.delete("plan");
    } else {
      params.set("plan", plan);
    }
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  return (
    <UpgradeModal
      open={open}
      onOpenChange={setOpen}
      activePlan={activePlan}
      onSelect={handleSelect}
    />
  );
}
