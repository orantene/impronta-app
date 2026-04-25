"use client";

import * as React from "react";
import { Keyboard } from "lucide-react";

import { DrawerShell } from "@/components/admin/drawer/drawer-shell";
import { DrawerSection } from "@/components/admin/drawer/drawer-pieces";

/**
 * AdminShortcutsDrawer — single keystroke cheatsheet (`?` opens it).
 *
 * One drawer, mounted globally inside the admin shell, listens for `?`
 * (Shift+/) and Esc to toggle/close. Replaces "where do I learn the
 * shortcuts" anxiety — every key the dashboard responds to is here in one
 * scrollable list.
 *
 * The shortcut catalog itself is co-located so adding a new key (e.g. `J`
 * for "next row") is a one-liner. Keys not yet implemented are tagged
 * "soon" so the drawer is honest.
 */

type Shortcut = {
  keys: string[];
  label: string;
  hint?: string;
  group: "Navigation" | "Quick create" | "List actions" | "Utilities";
  status?: "live" | "soon";
};

const SHORTCUTS: Shortcut[] = [
  // Navigation
  { keys: ["⌘", "K"], label: "Open command palette", group: "Navigation", status: "live" },
  { keys: ["G", "H"], label: "Go to Overview", group: "Navigation", status: "soon" },
  { keys: ["G", "R"], label: "Go to Requests", group: "Navigation", status: "soon" },
  { keys: ["G", "B"], label: "Go to Bookings", group: "Navigation", status: "soon" },
  { keys: ["G", "T"], label: "Go to Talent", group: "Navigation", status: "soon" },
  { keys: ["G", "C"], label: "Go to Clients", group: "Navigation", status: "soon" },

  // Quick create
  { keys: ["N"], label: "Open + New menu", group: "Quick create", status: "soon" },
  { keys: ["N", "R"], label: "New request", group: "Quick create", status: "soon" },
  { keys: ["N", "B"], label: "New booking", group: "Quick create", status: "soon" },
  { keys: ["N", "T"], label: "Add talent", group: "Quick create", status: "soon" },

  // List actions
  { keys: ["/"], label: "Focus search", group: "List actions", status: "soon" },
  { keys: ["J"], label: "Next row", group: "List actions", status: "soon" },
  { keys: ["K"], label: "Previous row", group: "List actions", status: "soon" },
  { keys: ["Enter"], label: "Open selected row", group: "List actions", status: "soon" },
  { keys: ["X"], label: "Toggle row checkbox", group: "List actions", status: "soon" },

  // Utilities
  { keys: ["?"], label: "Show this cheatsheet", group: "Utilities", status: "live" },
  { keys: ["Esc"], label: "Close drawer / popover", group: "Utilities", status: "live" },
  { keys: ["⌘", "."], label: "Toggle compact density", group: "Utilities", status: "soon" },
];

const GROUP_ORDER: Shortcut["group"][] = [
  "Navigation",
  "Quick create",
  "List actions",
  "Utilities",
];

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex h-[20px] min-w-[20px] items-center justify-center rounded border border-foreground/15 bg-foreground/[0.04] px-1.5 font-mono text-[10.5px] font-semibold text-foreground/80">
      {children}
    </kbd>
  );
}

export function AdminShortcutsDrawer({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
}) {
  return (
    <DrawerShell
      open={open}
      onOpenChange={onOpenChange}
      title="Keyboard shortcuts"
      subtitle="Faster way to drive the dashboard"
      icon={Keyboard}
      size="md"
    >
      {GROUP_ORDER.map((group) => {
        const items = SHORTCUTS.filter((s) => s.group === group);
        if (!items.length) return null;
        return (
          <DrawerSection key={group} title={group}>
            {items.map((s, i) => (
              <div
                key={`${group}-${i}`}
                className="flex items-center justify-between gap-3 rounded-lg border border-border/40 bg-background/40 px-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-[12.5px] font-medium text-foreground">
                    {s.label}
                    {s.status === "soon" ? (
                      <span className="ml-1.5 inline-flex rounded-full bg-foreground/[0.06] px-1.5 py-px text-[9px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
                        soon
                      </span>
                    ) : null}
                  </p>
                  {s.hint ? (
                    <p className="mt-0.5 text-[11.5px] text-muted-foreground">
                      {s.hint}
                    </p>
                  ) : null}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {s.keys.map((k, ki) => (
                    <React.Fragment key={`${k}-${ki}`}>
                      <Kbd>{k}</Kbd>
                      {ki < s.keys.length - 1 ? (
                        <span className="text-[11px] text-muted-foreground">+</span>
                      ) : null}
                    </React.Fragment>
                  ))}
                </div>
              </div>
            ))}
          </DrawerSection>
        );
      })}
    </DrawerShell>
  );
}

/**
 * useShortcutsDrawerHotkey — global `?` handler that opens the cheatsheet.
 * Ignores keystrokes inside form fields so typing in search/text inputs
 * stays sane.
 */
export function useShortcutsDrawerHotkey(
  setOpen: (next: boolean) => void,
) {
  React.useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      // Only handle the bare "?" (Shift+/ on most keyboards).
      if (event.key !== "?") return;
      // Skip when typing in fields.
      const t = event.target as HTMLElement | null;
      if (
        t &&
        (t.tagName === "INPUT" ||
          t.tagName === "TEXTAREA" ||
          t.tagName === "SELECT" ||
          (t as HTMLElement).isContentEditable)
      ) {
        return;
      }
      event.preventDefault();
      setOpen(true);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [setOpen]);
}
