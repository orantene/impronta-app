"use client";

/**
 * CreateMenu — the top bar's "+ Create" menu (Main / W54 boards).
 *
 * ONE LIST. The rows are `useQuickCreateItems()` from WorkspaceTopbar, the
 * same list the phone's FAB and the ⌘K palette draw, filtered to what this
 * person may do. Nothing is created from here directly: every row opens the
 * drawer that owns that record, over the page the person is on, so closing it
 * returns them exactly where they started (W54: "you return there").
 *
 * WORDS PER WORKSPACE. A business workspace books appointments; a talent
 * agency books jobs. The `new-booking` row reads "New appointment" for the
 * first and keeps "New booking" for the second. The engine row is the same.
 *
 * Token classes only; inline styles are frozen under components/admin/shell.
 */

import { useEffect, useRef, useState } from "react";

import { useDashboardText } from "../dashboard-i18n";
import { Icon } from "../primitives";
import { useAdminShell } from "../state";
import { useQuickCreateItems } from "./WorkspaceTopbar";

const K = "dashboard.workspaceShell.create";

export function CreateMenu() {
  const { openDrawer, state, t } = useAdminShell();
  const copy = useDashboardText();
  const items = useQuickCreateItems().filter((item) => item.canDo);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (items.length === 0) return null;

  const businessWorkspace = state.workspaceType !== "talent";
  const labelFor = (id: string, label: string): string =>
    id === "new-booking" && businessWorkspace ? t(`${K}.newAppointment`) : copy.t(label);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        data-tulala-create-menu
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex h-[32px] cursor-pointer items-center gap-[6px] rounded-[9px] border border-admin-border bg-admin-card px-[12px] font-admin-body text-admin-12h font-medium text-admin-ink hover:border-admin-border-strong [transition:border-color_var(--transition-admin-micro)]"
      >
        <Icon name="plus" size={14} stroke={1.75} color="currentColor" />
        {t(`${K}.label`)}
        <span aria-hidden className="inline-flex text-admin-ink-dim">
          <Icon name="chevron-down" size={12} stroke={1.75} color="currentColor" />
        </span>
      </button>
      {open && (
        <div
          role="menu"
          aria-label={t(`${K}.label`)}
          className="absolute right-0 top-[calc(100%+6px)] z-[60] w-[280px] rounded-[12px] border border-admin-border-soft bg-admin-card p-[6px] font-admin-body shadow-admin-hover"
        >
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                openDrawer(
                  item.drawer as Parameters<typeof openDrawer>[0],
                  item.drawerPayload,
                );
              }}
              className="flex w-full cursor-pointer items-center gap-[10px] rounded-[8px] px-[10px] py-[7px] text-left hover:bg-admin-surface-alt"
            >
              <span className="min-w-0 flex-1">
                <span className="block text-admin-13 font-semibold text-admin-ink">
                  {labelFor(item.id, item.label)}
                </span>
                <span className="block text-admin-11h text-admin-ink-muted">
                  {copy.t(item.sub)}
                </span>
              </span>
              <span
                aria-hidden
                className="rounded-[5px] border border-admin-border-soft bg-admin-surface px-[5px] font-mono text-admin-10 font-semibold text-admin-ink-dim"
              >
                {item.shortcut}
              </span>
            </button>
          ))}
          <div className="mx-[4px] mt-[4px] border-t border-admin-border-soft px-[6px] pb-[4px] pt-[8px] text-admin-11h leading-[1.45] text-admin-ink-muted">
            {t(`${K}.returnNote`)}
          </div>
        </div>
      )}
    </div>
  );
}
