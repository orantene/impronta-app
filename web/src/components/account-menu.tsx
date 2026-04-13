"use client";

import { useEffect, useRef, useState } from "react";
import { LogOut, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";

type MenuAction = {
  href: string;
  label: string;
};

export function AccountMenu({
  triggerLabel,
  displayName,
  roleLabel,
  dashboardAction,
  secondaryAction,
  signOutAction,
}: {
  triggerLabel: string;
  displayName: string;
  roleLabel: string;
  dashboardAction: MenuAction;
  secondaryAction?: MenuAction | null;
  signOutAction: (formData: FormData) => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  return (
    <div ref={rootRef} className="relative">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={triggerLabel}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <UserRound className="size-5" />
      </Button>
      {open ? (
        <div className="absolute right-0 z-50 mt-2 w-56 rounded-lg border border-border bg-card p-2 shadow-lg">
          <div className="border-b border-border/60 px-3 py-2">
            <p className="text-m font-medium text-foreground">{displayName}</p>
            <p className="text-sm text-muted-foreground">{roleLabel}</p>
          </div>
          <div className="py-1">
            <button
              type="button"
              className="block w-full rounded-md px-3 py-2 text-left text-m text-foreground transition-colors hover:bg-accent"
              onClick={() => {
                window.location.assign(dashboardAction.href);
              }}
            >
              {dashboardAction.label}
            </button>
            {secondaryAction ? (
              <button
                type="button"
                className="block w-full rounded-md px-3 py-2 text-left text-m text-foreground transition-colors hover:bg-accent"
                onClick={() => {
                  window.location.assign(secondaryAction.href);
                }}
              >
                {secondaryAction.label}
              </button>
            ) : null}
          </div>
          <div className="border-t border-border/60 pt-1">
            <form action={signOutAction}>
              <button
                type="submit"
                className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-m text-foreground transition-colors hover:bg-accent"
              >
                <LogOut className="size-4" />
                <span>Sign out</span>
              </button>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
