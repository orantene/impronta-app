"use client";

/**
 * PosRailModeMenu — the point of sale's own mode switch (`M33_ModeSwitch`):
 * the menu that opens from the `MODE · Counter` chip at the top of the POS
 * rail. Inside the till there is no workspace top bar (the board draws the
 * POS full-bleed), so this chip is how a cashier moves between Counter,
 * Tables, Door, Front desk and Collect, and the rail's `Workspace` door is
 * how they leave.
 *
 * The rows, their states and the navigation are `usePosModeMenuModel` — the
 * same model the top bar's W00 switch renders — so both doors agree on which
 * modes exist, which are on at this workspace, which this person may use and
 * which is remembered on this device. This file only draws the M33 shape:
 * title + subtitle, one row per mode with its state, the two modes with no
 * screen yet, `Make this the default here`, and the footer sentence.
 *
 * Handed to the frame through `PosModeMenuContext` by `PosRailModeMenuProvider`
 * (mounted in the shell's POS chrome branch), so `PosFrame` never imports the
 * shell.
 */

import { useEffect, type ReactNode } from "react";

import { PosModeMenuContext, type PosModeMenuRender } from "@/components/admin/pos/pos-mode-menu-context";
import { interpolate } from "@/i18n/interpolate";

import { Icon } from "../primitives";
import { useAdminShell } from "../state";
import { usePosModeMenuModel } from "./PosModeSwitch";

const K = "dashboard.pos.counter.switch";

function PosRailModeMenu({ open, onClose, menuId }: Parameters<PosModeMenuRender>[0]) {
  const { t } = useAdminShell();
  const model = usePosModeMenuModel();
  const { onMenuClosed } = model;

  useEffect(() => {
    if (!open) return;
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("keydown", onEscape);
      onMenuClosed();
    };
  }, [onClose, onMenuClosed, open]);

  if (!open || !model.visible) return null;

  return (
    <>
      {/* The board dims the till behind the menu; a tap outside closes it. */}
      <div aria-hidden onClick={onClose} className="fixed inset-y-0 left-24 right-0 z-40 bg-admin-ink/45" />
      <div
        id={menuId}
        role="menu"
        aria-label={t(`${K}.openMenu`)}
        data-pos-mode-menu
        className="absolute left-[101px] top-[calc(100%+6px)] z-50 w-[360px] rounded-[16px] bg-admin-card font-admin-body shadow-admin-hover"
      >
        <div className="border-b border-admin-border-soft px-[20px] pb-[14px] pt-[16px]">
          <div className="text-[16px] font-semibold leading-[1.2] text-admin-ink">{t(`${K}.title`)}</div>
          <div className="mt-[3px] text-[13px] leading-[1.35] text-admin-ink-muted">{t(`${K}.subtitle`)}</div>
        </div>
        <div className="p-[8px]">
          {model.rows.map((row) => {
            if (row.state !== "open") {
              return (
                <div
                  key={row.mode}
                  role="menuitem"
                  aria-disabled="true"
                  aria-label={row.label}
                  className="flex w-full items-center gap-[12px] rounded-[12px] px-[12px] py-[10px] text-left text-admin-ink-dim"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] font-semibold leading-[1.2]">{row.label}</span>
                    <span className="mt-[2px] block text-[12.5px] leading-[1.3]">
                      {row.state === "off"
                        ? interpolate(t(`${K}.turnedOff`), { workspace: model.tenantName })
                        : t(`${K}.notYourRole`)}
                    </span>
                  </span>
                  <Icon name="lock" size={14} stroke={1.6} color="currentColor" />
                </div>
              );
            }
            return (
              <button
                key={row.mode}
                type="button"
                role="menuitem"
                aria-label={row.label}
                aria-current={row.isCurrent ? "true" : undefined}
                onClick={() => {
                  onClose();
                  model.openMode(row.mode);
                }}
                className={`flex w-full cursor-pointer items-center gap-[12px] rounded-[12px] px-[12px] py-[10px] text-left hover:bg-admin-surface-alt ${
                  row.isCurrent ? "bg-admin-brand-soft text-admin-brand" : "text-admin-ink"
                }`}
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-semibold leading-[1.2]">{row.label}</span>
                  {row.isRemembered && (
                    <span className="mt-[2px] block text-[12.5px] leading-[1.3] text-admin-ink-muted">
                      {t(`${K}.defaultHere`)}
                    </span>
                  )}
                </span>
                {row.isCurrent && <Icon name="check" size={16} stroke={2} color="currentColor" />}
              </button>
            );
          })}
          {/* Two modes the board names that have no screen yet: drawn so nobody
              looks for them, disabled with the reason. */}
          {model.notBuilt.map((key) => (
            <div
              key={key}
              role="menuitem"
              aria-disabled="true"
              className="flex w-full items-center gap-[12px] rounded-[12px] px-[12px] py-[10px] text-left text-admin-ink-dim"
            >
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-semibold leading-[1.2]">{t(`${K}.${key}`)}</span>
                <span className="mt-[2px] block text-[12.5px] leading-[1.3]">{t(`${K}.noScreen`)}</span>
              </span>
              <Icon name="lock" size={14} stroke={1.6} color="currentColor" />
            </div>
          ))}
          <div className="my-[6px] h-px bg-admin-border-soft" />
          <button
            type="button"
            role="menuitem"
            onClick={model.makeDefault}
            className="flex w-full cursor-pointer items-center rounded-[10px] px-[12px] py-[8px] text-left text-[13px] font-medium text-admin-ink-muted hover:bg-admin-surface-alt"
          >
            {model.savedDefault ? t(`${K}.defaultSaved`) : t(`${K}.makeDefault`)}
          </button>
        </div>
        <div className="border-t border-admin-border-soft px-[20px] py-[12px] text-[13px] leading-[1.45] text-admin-ink-muted">
          {t(`${K}.footer`)}
        </div>
      </div>
    </>
  );
}

const render: PosModeMenuRender = (props) => <PosRailModeMenu {...props} />;

/** Mounted by the shell's POS chrome branch; every `PosFrame` under it gets the M33 menu. */
export function PosRailModeMenuProvider({ children }: { children: ReactNode }) {
  return <PosModeMenuContext.Provider value={render}>{children}</PosModeMenuContext.Provider>;
}
