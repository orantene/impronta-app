"use client";

import * as React from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

/**
 * PlanViewbar — black sticky-top utility strip from the
 * site-control-center mockup. Lets a workspace operator simulate the
 * UX at any plan tier (Free / Studio / Agency / Network) and jump
 * between the major admin views with one click.
 *
 * Plan toggle writes to `?plan=` (no scroll); View select uses
 * router.push to change route.
 */

type Plan = "free" | "studio" | "agency" | "network";

const PLANS: ReadonlyArray<{ key: Plan; label: string }> = [
  { key: "free", label: "Free" },
  { key: "studio", label: "Studio" },
  { key: "agency", label: "Agency" },
  { key: "network", label: "Network" },
];

const PLAN_ACTIVE_BG: Record<Plan, string> = {
  free: "#eae7db",
  studio: "#2a5fd1",
  agency: "#8b6d1f",
  network: "#146b3a",
};
const PLAN_ACTIVE_FG: Record<Plan, string> = {
  free: "#0b0b0d",
  studio: "#ffffff",
  agency: "#ffffff",
  network: "#ffffff",
};

const VIEWS: ReadonlyArray<{ value: string; label: string; href: string }> = [
  { value: "site", label: "Site", href: "/admin/site" },
  { value: "profile", label: "Profile settings", href: "/admin/profile" },
  { value: "account", label: "Account", href: "/admin/account" },
  { value: "setup", label: "Setup", href: "/admin/site-settings/structure" },
  { value: "edit", label: "Edit mode", href: "/admin/site-settings/structure" },
];

function detectActiveView(pathname: string): string {
  if (pathname.startsWith("/admin/site-settings")) return "setup";
  if (pathname.startsWith("/admin/profile")) return "profile";
  if (pathname.startsWith("/admin/account")) return "account";
  if (pathname.startsWith("/admin/site")) return "site";
  return "site";
}

export function PlanViewbar() {
  const router = useRouter();
  const pathname = usePathname() ?? "/admin";
  const searchParams = useSearchParams();
  const planParam = (searchParams?.get("plan") ?? "free") as string;
  const activePlan: Plan = (PLANS.find((p) => p.key === planParam)?.key ??
    "free") as Plan;
  const activeView = detectActiveView(pathname);

  function setPlan(plan: Plan) {
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

  function setView(value: string) {
    const dest = VIEWS.find((v) => v.value === value);
    if (!dest) return;
    const params = new URLSearchParams(
      searchParams ? Array.from(searchParams.entries()) : [],
    );
    const qs = params.toString();
    router.push(qs ? `${dest.href}?${qs}` : dest.href);
  }

  return (
    <div
      className={cn(
        "sticky top-0 z-[60] flex items-center gap-1.5 border-b px-3.5 py-2.5 sm:px-5",
      )}
      style={{
        backgroundColor: "#0b0b0d",
        borderBottomColor: "rgba(255,255,255,0.06)",
        color: "#f2f2f2",
      }}
    >
      <span className="mr-2 hidden text-[11px] font-semibold uppercase tracking-[0.18em] text-white/55 sm:inline">
        Plan
      </span>
      {PLANS.map((p) => {
        const active = p.key === activePlan;
        return (
          <button
            key={p.key}
            type="button"
            onClick={() => setPlan(p.key)}
            className={cn(
              "inline-flex shrink-0 items-center rounded-full px-3 py-1.5 text-[12px] font-semibold transition-colors duration-150",
              "border",
              active
                ? ""
                : "border-white/10 bg-transparent text-white/55 hover:border-white/25 hover:text-white/85",
            )}
            style={
              active
                ? {
                    backgroundColor: PLAN_ACTIVE_BG[p.key],
                    color: PLAN_ACTIVE_FG[p.key],
                    borderColor: PLAN_ACTIVE_BG[p.key],
                  }
                : undefined
            }
            aria-pressed={active}
          >
            {p.label}
          </button>
        );
      })}
      <div className="flex-1" />
      <span className="mr-2 hidden text-[11px] font-semibold uppercase tracking-[0.18em] text-white/55 sm:inline">
        View
      </span>
      <select
        value={activeView}
        onChange={(e) => setView(e.target.value)}
        className={cn(
          "shrink-0 cursor-pointer rounded-full border px-3 py-1.5 text-[12px] font-semibold focus:outline-none focus:ring-2 focus:ring-white/30",
        )}
        style={{
          backgroundColor: "rgba(255,255,255,0.06)",
          borderColor: "rgba(255,255,255,0.1)",
          color: "#f2f2f2",
        }}
        aria-label="Switch admin view"
      >
        {VIEWS.map((v) => (
          <option key={v.value} value={v.value} style={{ color: "#0b0b0d" }}>
            {v.label}
          </option>
        ))}
      </select>
    </div>
  );
}
