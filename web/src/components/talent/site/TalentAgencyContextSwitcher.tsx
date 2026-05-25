"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { setActiveTalentAgencyAction } from "@/lib/talent/set-active-agency-action";
import type { ActiveTalentAgencyContext } from "@/lib/talent/active-agency-context";

type Props = {
  agencies: ActiveTalentAgencyContext[];
  activeTenantId: string | null;
};

export function TalentAgencyContextSwitcher({ agencies, activeTenantId }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  if (agencies.length <= 1) return null;

  return (
    <label
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        fontSize: 12,
        color: "rgba(11,11,13,0.55)",
        fontFamily: '"Inter", system-ui, sans-serif',
      }}
    >
      <span>Agency context</span>
      <select
        disabled={pending}
        value={activeTenantId ?? ""}
        onChange={(e) => {
          const next = e.target.value;
          if (!next || next === activeTenantId) return;
          startTransition(async () => {
            await setActiveTalentAgencyAction(next);
            router.refresh();
          });
        }}
        style={{
          fontSize: 12,
          padding: "4px 8px",
          borderRadius: 6,
          border: "1px solid rgba(24,24,27,0.12)",
          background: "#fff",
        }}
      >
        {agencies.map((a) => (
          <option key={a.tenantId} value={a.tenantId}>
            {a.displayName}
          </option>
        ))}
      </select>
    </label>
  );
}
