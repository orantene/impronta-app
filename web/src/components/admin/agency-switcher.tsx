"use client";

import { useMemo, useState } from "react";
import { Check, ChevronsUpDown, Building2 } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { TenantMembership } from "@/lib/saas";
import { switchActiveTenant } from "@/app/(dashboard)/admin/tenant-switch-action";

type AgencySwitcherProps = {
  tenants: TenantMembership[];
  activeTenantId: string | null;
  /** Compact mode hides the label text (for collapsed sidebar). */
  collapsed?: boolean;
};

export function AgencySwitcher({
  tenants,
  activeTenantId,
  collapsed = false,
}: AgencySwitcherProps) {
  const [open, setOpen] = useState(false);

  const active = useMemo(
    () => tenants.find((t) => t.tenant_id === activeTenantId) ?? null,
    [tenants, activeTenantId],
  );

  // Single-tenant actors: render a compact read-only label, no popover.
  if (tenants.length <= 1) {
    const label = active?.display_name ?? tenants[0]?.display_name ?? "Workspace";
    if (collapsed) {
      return (
        <div
          className="mx-auto flex size-8 items-center justify-center rounded-lg border border-[var(--admin-gold-border)]/60 bg-[var(--admin-sidebar-hover)]/40 text-[var(--admin-gold)]"
          aria-label={`Workspace: ${label}`}
          title={label}
        >
          <Building2 className="size-4" aria-hidden />
        </div>
      );
    }
    return (
      <div
        className="flex min-w-0 items-center gap-2 rounded-lg border border-[var(--admin-gold-border)]/50 bg-[var(--admin-sidebar-hover)]/30 px-2 py-1.5 text-xs text-[var(--admin-workspace-fg)]"
        aria-label={`Workspace: ${label}`}
      >
        <Building2 className="size-3.5 shrink-0 text-[var(--admin-gold)]" aria-hidden />
        <span className="truncate font-medium">{label}</span>
      </div>
    );
  }

  const triggerLabel = active?.display_name ?? "Choose workspace";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label={`Switch workspace (current: ${triggerLabel})`}
          className={cn(
            "h-9 rounded-lg border border-[var(--admin-gold-border)]/60 bg-[var(--admin-sidebar-hover)]/30 text-xs font-medium text-[var(--admin-workspace-fg)] hover:bg-[var(--admin-sidebar-hover)]",
            collapsed ? "mx-auto size-9 justify-center px-0" : "w-full justify-between gap-2 px-2",
          )}
        >
          {collapsed ? (
            <Building2 className="size-4 text-[var(--admin-gold)]" aria-hidden />
          ) : (
            <>
              <span className="flex min-w-0 items-center gap-2">
                <Building2 className="size-3.5 shrink-0 text-[var(--admin-gold)]" aria-hidden />
                <span className="truncate">{triggerLabel}</span>
              </span>
              <ChevronsUpDown className="size-3.5 shrink-0 text-[var(--admin-nav-idle)]" aria-hidden />
            </>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={6}
        className="w-[min(20rem,90vw)] p-1"
      >
        <div className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          Workspaces
        </div>
        <ul role="listbox" aria-label="Workspaces" className="max-h-[18rem] overflow-y-auto">
          {tenants.map((t) => {
            const isActive = t.tenant_id === activeTenantId;
            return (
              <li key={t.tenant_id} role="option" aria-selected={isActive}>
                <form action={switchActiveTenant}>
                  <input type="hidden" name="tenant_id" value={t.tenant_id} />
                  <button
                    type="submit"
                    onClick={() => setOpen(false)}
                    className={cn(
                      "flex w-full items-start gap-2 rounded-md px-2 py-2 text-left text-sm transition-colors hover:bg-accent",
                      isActive && "bg-accent/60",
                    )}
                  >
                    <Check
                      className={cn(
                        "mt-0.5 size-4 shrink-0",
                        isActive ? "text-[var(--admin-gold)]" : "text-transparent",
                      )}
                      aria-hidden
                    />
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate font-medium">{t.display_name}</span>
                      <span className="truncate text-[11px] text-muted-foreground">
                        {t.slug}
                        {t.status === "pending_acceptance" ? " · pending invite" : ""}
                        {t.agency_status !== "active" ? ` · ${t.agency_status}` : ""}
                        {" · "}
                        {t.role}
                      </span>
                    </span>
                  </button>
                </form>
              </li>
            );
          })}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
