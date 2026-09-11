"use client";

/**
 * PosFrame — the point of sale shell as the board draws it (`POSCounter`):
 * a 96px icon rail down the left plus a content slot. The rail's rows come
 * from `POS_MODE_META[mode].destinations` (`lib/pos/modes.ts`), never a list
 * this file keeps of its own, so a mode gaining or losing a screen changes
 * the rail by itself.
 *
 * Top of the rail: the `MODE · Counter` chip (the mode this frame is in).
 * When the shell provides a menu through `PosModeMenuContext` the chip is a
 * button that opens it (`M33_ModeSwitch`: the till's own mode switch, since
 * the POS has no workspace top bar); without a provider it is a label.
 * Then one 82x64 row per destination — icon over label, a count badge in the
 * corner when the caller has one (`counts`). Bottom: `Lock` (only when the
 * caller gives it something to do) and the `Workspace` door back out.
 *
 * This is the POS's OWN internal rail, not the workspace sidebar
 * (`lib/workspace/destinations.ts`), which never shows a `pos` row at all:
 * the point of sale replaces the whole admin chrome. The switch that enters
 * the POS lives in the top bar and is out of scope here.
 */

import { useId, useState, type ComponentType, type ReactNode } from "react";
import {
  AlertTriangle,
  Calendar,
  CalendarClock,
  ChevronDown,
  ChevronLeft,
  ClipboardList,
  Clock,
  CreditCard,
  FileText,
  Flame,
  FolderOpen,
  LayoutGrid,
  Link2,
  Lock,
  Monitor,
  ScanLine,
  Search,
  ShoppingBag,
  Tag,
  Users,
  Wallet,
  type LucideProps,
} from "lucide-react";

// EXPERIMENTAL. Renders nothing when the flag is off. Does not use AdminShell.
import { WhatsAppDrawerHost } from "@/components/admin/channels/WhatsAppChrome";
import { POS_MODE_META, type PosMode } from "@/lib/pos/modes";
import { cn } from "@/lib/utils";
import { usePosModeMenuRender } from "./pos-mode-menu-context";

export type PosFrameProps = {
  readonly mode: PosMode;
  /**
   * The rail's own name, translated — this labels the `<nav>` region itself,
   * never looked up from `destinationLabels` (that map is keyed by
   * destination id, and a mode id such as "counter" is never one of those
   * keys). Callers build this with `railNavLabel` (`pos-copy.ts`).
   */
  readonly navLabel: string;
  readonly activeDestination: string;
  readonly onSelectDestination: (destinationId: string) => void;
  /** English fallback per destination id; pass a translated map to localize. */
  readonly destinationLabels: Readonly<Record<string, string>>;
  /** A count badge per destination id (`orders: 5`); zero and missing draw nothing. */
  readonly counts?: Readonly<Record<string, number>>;
  /** The `MODE` chip's label, translated ("Counter"). Falls back to the meta's English. */
  readonly modeLabel?: string;
  /** The chip's eyebrow, translated ("Mode"). */
  readonly modeEyebrow?: string;
  /** The `Lock` row. Absent: no row. `disabledReason`: rendered disabled, with the sentence. */
  readonly lock?: { readonly label: string; readonly onLock?: () => void; readonly disabledReason?: string };
  /** The `Workspace` door at the bottom: a real link out of the till. */
  readonly workspace?: { readonly label: string; readonly href: string };
  readonly children: ReactNode;
  readonly className?: string;
  /**
   * Doors OUT of this window, drawn under the destinations: today the
   * counter's "Customer display", which opens in a new window. Not
   * destinations (they change no state here), so never `aria-current`.
   */
  readonly links?: readonly PosFrameLink[];
};

export type PosFrameLink = {
  readonly id: string;
  readonly label: string;
  readonly href: string;
  /** A one-line explanation, rendered as the link's `title`. */
  readonly hint?: string;
};

/**
 * One icon per destination id across every mode. A destination with no entry
 * here draws the generic grid so a new screen is never a blank square.
 */
const DESTINATION_ICONS: Readonly<Record<string, ComponentType<LucideProps>>> = {
  sell: CreditCard,
  orders: ShoppingBag,
  receipts: FileText,
  shifts: Wallet,
  issues: AlertTriangle,
  tables: LayoutGrid,
  seating: Users,
  prep: Flame,
  checkin: ScanLine,
  tickets: Tag,
  lookup: Search,
  today: Calendar,
  sessions: Clock,
  walkin: CalendarClock,
  waitlist: ClipboardList,
  collect: Wallet,
  projects: FolderOpen,
  display: Monitor,
  links: Link2,
};

const ROW =
  "relative flex h-16 w-[82px] flex-col items-center justify-center gap-[5px] rounded-[14px] text-[11.5px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-admin-brand";

export function PosFrame({
  mode,
  navLabel,
  activeDestination,
  onSelectDestination,
  destinationLabels,
  counts,
  modeLabel,
  modeEyebrow,
  lock,
  workspace,
  children,
  className,
  links,
}: PosFrameProps) {
  const meta = POS_MODE_META[mode];
  const destinations = meta.destinations;
  const renderModeMenu = usePosModeMenuRender();
  const [modeOpen, setModeOpen] = useState(false);
  const modeMenuId = useId();
  const chipInner = (
    <>
      <span className="text-[10.5px] font-bold uppercase leading-none tracking-[0.06em] opacity-75">{modeEyebrow ?? "Mode"}</span>
      <span className="flex items-center gap-1 text-center text-[12px] font-bold leading-[1.1]">
        {modeLabel ?? meta.label}
        <ChevronDown aria-hidden size={12} strokeWidth={1.75} className="shrink-0" />
      </span>
    </>
  );
  const CHIP =
    "mb-1.5 flex h-[54px] w-[82px] flex-col items-center justify-center gap-0.5 rounded-[14px] border-[1.5px] border-admin-brand/20 bg-admin-brand-soft text-admin-brand";

  return (
    // `leading-[1.2]`: the boards set no line-height of their own (the
    // browser's `normal`), and the admin body's 1.65 made every chip, price
    // and totals row on the till a few pixels taller than drawn.
    <div className={cn("flex h-full min-h-[560px] w-full overflow-hidden bg-admin-surface leading-[1.2]", className)}>
      <nav
        aria-label={navLabel}
        className="flex w-24 shrink-0 flex-col items-center gap-1 border-r border-admin-border bg-admin-card px-0 pb-2.5 pt-3 max-[900px]:hidden"
      >
        {renderModeMenu ? (
          <div className="relative">
            <button
              type="button"
              data-pos-mode-chip
              aria-haspopup="menu"
              aria-expanded={modeOpen}
              aria-controls={modeOpen ? modeMenuId : undefined}
              onClick={() => setModeOpen((open) => !open)}
              className={cn(CHIP, "cursor-pointer hover:border-admin-brand/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-admin-brand")}
            >
              {chipInner}
            </button>
            {renderModeMenu({ open: modeOpen, onClose: () => setModeOpen(false), menuId: modeMenuId })}
          </div>
        ) : (
          <div data-pos-mode-chip className={CHIP}>
            {chipInner}
          </div>
        )}
        {destinations.map((destinationId) => {
          const active = destinationId === activeDestination;
          const Icon = DESTINATION_ICONS[destinationId] ?? LayoutGrid;
          const count = counts?.[destinationId] ?? 0;
          return (
            <button
              key={destinationId}
              type="button"
              aria-current={active ? "page" : undefined}
              onClick={() => onSelectDestination(destinationId)}
              className={cn(
                ROW,
                active
                  ? "bg-admin-surface-alt font-bold text-admin-ink shadow-[inset_0_0_0_1.5px_var(--color-admin-border-strong)]"
                  : "font-semibold text-admin-ink-muted hover:bg-admin-surface-alt",
              )}
            >
              <Icon aria-hidden size={22} strokeWidth={1.75} className="shrink-0" />
              <span>{destinationLabels[destinationId] ?? destinationId}</span>
              {count > 0 && (
                <span
                  data-pos-rail-count={destinationId}
                  className={cn(
                    "absolute right-[9px] top-[7px] inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-[5px] text-[10.5px] font-bold text-admin-card",
                    destinationId === "issues" ? "bg-admin-red" : "bg-admin-coral",
                  )}
                >
                  {count > 99 ? "99+" : count}
                </span>
              )}
            </button>
          );
        })}
        {links && links.length > 0 && (
          <div className="flex flex-col gap-1">
            {links.map((link) => {
              const Icon = DESTINATION_ICONS[link.id] ?? LayoutGrid;
              return (
                <a
                  key={link.id}
                  href={link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={link.hint}
                  data-pos-frame-link={link.id}
                  className={cn(ROW, "font-semibold text-admin-ink-muted hover:bg-admin-surface-alt")}
                >
                  <Icon aria-hidden size={22} strokeWidth={1.75} className="shrink-0" />
                  <span className="max-w-[76px] truncate">{link.label}</span>
                </a>
              );
            })}
          </div>
        )}
        <div className="flex-1" />
        {lock && (
          <button
            type="button"
            data-pos-lock
            disabled={!lock.onLock}
            title={lock.disabledReason}
            aria-describedby={lock.disabledReason ? "pos-lock-reason" : undefined}
            onClick={lock.onLock}
            className={cn(
              ROW,
              "h-14 border-[1.5px] border-admin-border font-semibold text-admin-ink-muted hover:bg-admin-surface-alt disabled:cursor-not-allowed disabled:opacity-50",
            )}
          >
            <Lock aria-hidden size={20} strokeWidth={1.75} className="shrink-0" />
            <span>{lock.label}</span>
            {lock.disabledReason && (
              <span id="pos-lock-reason" className="sr-only">
                {lock.disabledReason}
              </span>
            )}
          </button>
        )}
        {workspace && (
          <a
            href={workspace.href}
            data-pos-workspace-door
            className={cn(ROW, "h-14 font-semibold text-admin-ink-muted hover:bg-admin-surface-alt")}
          >
            <ChevronLeft aria-hidden size={20} strokeWidth={1.75} className="shrink-0" />
            <span>{workspace.label}</span>
          </a>
        )}
      </nav>
      <div className="flex min-w-0 flex-1 flex-col">{children}</div>
      <WhatsAppDrawerHost />
    </div>
  );
}
