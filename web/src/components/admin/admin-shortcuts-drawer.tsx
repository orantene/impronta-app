"use client";

import * as React from "react";
import { Keyboard } from "lucide-react";

import { DrawerShell } from "@/components/admin/drawer/drawer-shell";
import { DrawerSection } from "@/components/admin/drawer/drawer-pieces";
import { useT } from "@/i18n/use-t";

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

type ShortcutGroup = "navigation" | "quickCreate" | "listActions" | "utilities";

type Shortcut = {
  keys: string[];
  /** Suffix under `dashboard.adminShell.shortcuts.rows.*`. */
  labelKey: string;
  hintKey?: string;
  group: ShortcutGroup;
  status?: "live" | "soon";
};

const SHORTCUTS: Shortcut[] = [
  // Navigation
  { keys: ["\u2318", "K"], labelKey: "openPalette", group: "navigation", status: "live" },
  { keys: ["G", "H"], labelKey: "goOverview", group: "navigation", status: "soon" },
  { keys: ["G", "R"], labelKey: "goRequests", group: "navigation", status: "soon" },
  { keys: ["G", "B"], labelKey: "goBookings", group: "navigation", status: "soon" },
  { keys: ["G", "T"], labelKey: "goTalent", group: "navigation", status: "soon" },
  { keys: ["G", "C"], labelKey: "goClients", group: "navigation", status: "soon" },

  // Quick create
  { keys: ["N"], labelKey: "openNewMenu", group: "quickCreate", status: "soon" },
  { keys: ["N", "R"], labelKey: "newRequest", group: "quickCreate", status: "soon" },
  { keys: ["N", "B"], labelKey: "newBooking", group: "quickCreate", status: "soon" },
  { keys: ["N", "T"], labelKey: "addTalent", group: "quickCreate", status: "soon" },

  // List actions
  { keys: ["/"], labelKey: "focusSearch", group: "listActions", status: "soon" },
  { keys: ["J"], labelKey: "nextRow", group: "listActions", status: "soon" },
  { keys: ["K"], labelKey: "previousRow", group: "listActions", status: "soon" },
  { keys: ["Enter"], labelKey: "openSelectedRow", group: "listActions", status: "soon" },
  { keys: ["X"], labelKey: "toggleRowCheckbox", group: "listActions", status: "soon" },

  // Utilities
  { keys: ["?"], labelKey: "showCheatsheet", group: "utilities", status: "live" },
  { keys: ["Esc"], labelKey: "closeDrawer", group: "utilities", status: "live" },
  { keys: ["\u2318", "."], labelKey: "toggleDensity", group: "utilities", status: "soon" },
];

const GROUP_ORDER: ShortcutGroup[] = [
  "navigation",
  "quickCreate",
  "listActions",
  "utilities",
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
  const t = useT();
  return (
    <DrawerShell
      open={open}
      onOpenChange={onOpenChange}
      title={t("dashboard.adminShell.shortcuts.title")}
      subtitle={t("dashboard.adminShell.shortcuts.subtitle")}
      icon={Keyboard}
      size="md"
    >
      {GROUP_ORDER.map((group) => {
        const items = SHORTCUTS.filter((s) => s.group === group);
        if (!items.length) return null;
        return (
          <DrawerSection key={group} title={t(`dashboard.adminShell.shortcuts.group.${group}`)}>
            {items.map((s, i) => (
              <div
                key={`${group}-${i}`}
                className="flex items-center justify-between gap-3 rounded-lg border border-border/40 bg-background/40 px-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-[12.5px] font-medium text-foreground">
                    {t(`dashboard.adminShell.shortcuts.rows.${s.labelKey}`)}
                    {s.status === "soon" ? (
                      <span className="ml-1.5 inline-flex rounded-full bg-foreground/[0.06] px-1.5 py-px text-[9px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
                        {t("dashboard.adminShell.shortcuts.soon")}
                      </span>
                    ) : null}
                  </p>
                  {s.hintKey ? (
                    <p className="mt-0.5 text-[11.5px] text-muted-foreground">
                      {t(`dashboard.adminShell.shortcuts.hints.${s.hintKey}`)}
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
