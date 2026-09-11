"use client";

/**
 * PosHeader — the 64px bar over every counter screen (`POSCounter`):
 * `Counter` over `Sale #1188 · Ana` on the left; on the right an optional
 * status chip (`Offline · cash only`, `Card reader disconnected`), the
 * location chip, and the cashier · drawer chip.
 *
 * The location chip is the workspace's own name until a locations table
 * exists (D-POS-15), so it is drawn as a chip and not a menu. The cashier
 * chip is the signed-in person and the open drawer; its chevron opens the
 * small menu the caller passes (`Devices`, `Connection`).
 */

import { AlertTriangle, ChevronDown, MapPin } from "lucide-react";
import { useId, useState } from "react";

import { cn } from "@/lib/utils";

export type PosHeaderMenuItem = {
  readonly id: string;
  readonly label: string;
  readonly onSelect: () => void;
};

export type PosHeaderProps = {
  readonly title: string;
  readonly subtitle: string;
  /** `Offline · cash only`, `Card reader disconnected`: drawn red, with a warning icon. */
  readonly alert?: { readonly label: string; readonly onSelect?: () => void } | null;
  readonly location: string;
  /** The signed-in person's initials + `Ana · Drawer 1`. */
  readonly cashier: { readonly initials: string; readonly label: string };
  readonly cashierMenuLabel: string;
  readonly cashierMenu?: readonly PosHeaderMenuItem[];
  /**
   * Portrait (`POSCounterPortrait`): the rail is hidden, so the header leads
   * with the mode chip and its menu of destinations. Only drawn under 900px.
   */
  readonly portraitMenu?: { readonly label: string; readonly menuLabel: string; readonly items: readonly PosHeaderMenuItem[] };
  /** `Live`: the green dot the floor boards carry before the location chip. */
  readonly live?: string;
  readonly className?: string;
};

const CHIP =
  "inline-flex h-10 items-center gap-2 rounded-[12px] border-[1.5px] border-admin-border bg-admin-card px-3 text-[14px] font-semibold text-admin-ink";

export function PosHeader({
  title,
  subtitle,
  alert,
  location,
  cashier,
  cashierMenuLabel,
  cashierMenu,
  portraitMenu,
  live,
  className,
}: PosHeaderProps) {
  const [open, setOpen] = useState(false);
  const [modeOpen, setModeOpen] = useState(false);
  const menuId = useId();
  const modeMenuId = useId();
  const hasMenu = Boolean(cashierMenu && cashierMenu.length > 0);

  return (
    <header
      data-pos-header
      className={cn(
        "flex h-16 shrink-0 items-center gap-3 border-b border-admin-border bg-admin-card px-[22px] max-[900px]:px-4",
        className,
      )}
    >
      {portraitMenu && (
        <div className="relative hidden max-[900px]:block">
          <button
            type="button"
            data-pos-portrait-menu
            aria-haspopup="menu"
            aria-expanded={modeOpen}
            aria-controls={modeMenuId}
            onClick={() => setModeOpen((v) => !v)}
            className="inline-flex h-10 items-center gap-1.5 rounded-[12px] bg-admin-brand-soft px-3 text-[14px] font-bold text-admin-brand"
          >
            {portraitMenu.label}
            <ChevronDown aria-hidden size={14} strokeWidth={1.75} />
          </button>
          {modeOpen && (
            <ul
              id={modeMenuId}
              role="menu"
              aria-label={portraitMenu.menuLabel}
              className="absolute left-0 top-[calc(100%+6px)] z-30 m-0 min-w-[200px] list-none rounded-[12px] border-[1.5px] border-admin-border bg-admin-card p-1.5 shadow-admin-hover"
            >
              {portraitMenu.items.map((item) => (
                <li key={item.id} role="none">
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setModeOpen(false);
                      item.onSelect();
                    }}
                    className="flex h-11 w-full items-center rounded-[9px] px-3 text-left text-[14px] font-semibold text-admin-ink hover:bg-admin-surface-alt"
                  >
                    {item.label}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <div className="min-w-0">
        <h1 className="m-0 truncate text-[19px] font-semibold leading-[1.2] tracking-[-0.01em] text-admin-ink">
          {title}
        </h1>
        <p className="m-0 truncate text-[13px] text-admin-ink-muted">{subtitle}</p>
      </div>
      <div className="flex-1" />
      {alert && (
        <button
          type="button"
          data-pos-header-alert
          onClick={alert.onSelect}
          disabled={!alert.onSelect}
          className="inline-flex h-10 items-center gap-2 rounded-[12px] bg-admin-critical-soft px-3.5 text-[13.5px] font-bold text-admin-red disabled:cursor-default"
        >
          <AlertTriangle aria-hidden size={16} strokeWidth={1.75} />
          {alert.label}
        </button>
      )}
      {live && (
        <span data-pos-live className="inline-flex items-center gap-1.5 text-[14px] font-bold text-admin-success">
          <i aria-hidden className="inline-block h-2 w-2 rounded-full bg-admin-success" />
          {live}
        </span>
      )}
      <span data-pos-location className={cn(CHIP, "max-[900px]:hidden")}>
        <MapPin aria-hidden size={16} strokeWidth={1.75} className="text-admin-ink-muted" />
        {location}
      </span>
      <div className="relative max-[900px]:hidden">
        <button
          type="button"
          data-pos-cashier
          aria-haspopup={hasMenu ? "menu" : undefined}
          aria-expanded={hasMenu ? open : undefined}
          aria-controls={hasMenu ? menuId : undefined}
          aria-label={cashierMenuLabel}
          disabled={!hasMenu}
          onClick={() => setOpen((v) => !v)}
          className={cn(CHIP, "pl-1.5 disabled:cursor-default")}
        >
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-admin-brand-soft text-[12px] font-semibold text-admin-brand">
            {cashier.initials}
          </span>
          {cashier.label}
          <ChevronDown aria-hidden size={14} strokeWidth={1.75} className="text-admin-ink-dim" />
        </button>
        {hasMenu && open && (
          <ul
            id={menuId}
            role="menu"
            aria-label={cashierMenuLabel}
            className="absolute right-0 top-[calc(100%+6px)] z-30 m-0 min-w-[200px] list-none rounded-[12px] border-[1.5px] border-admin-border bg-admin-card p-1.5 shadow-admin-hover"
          >
            {cashierMenu!.map((item) => (
              <li key={item.id} role="none">
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setOpen(false);
                    item.onSelect();
                  }}
                  className="flex h-11 w-full items-center rounded-[9px] px-3 text-left text-[14px] font-semibold text-admin-ink hover:bg-admin-surface-alt"
                >
                  {item.label}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </header>
  );
}
