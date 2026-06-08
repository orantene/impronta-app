"use client";

/**
 * EditShellLoading — lightweight placeholder while EditShell dynamic-imports.
 *
 * Renders a fixed topbar strip + left dock ghost so operators (and browser
 * automation) see immediate chrome feedback instead of a bare storefront.
 */

import {
  CHROME,
  COMMAND_DOCK_LEFT_PX,
  COMMAND_DOCK_TOP_GAP_PX,
  COMMAND_DOCK_WIDTH_PX,
  EDIT_TOPBAR_H,
  Z_INDEX,
} from "./kit";

const DOCK_TOP = EDIT_TOPBAR_H + COMMAND_DOCK_TOP_GAP_PX;

export function EditShellLoading() {
  return (
    <div
      data-edit-chrome-loading
      aria-hidden
      className="pointer-events-none fixed inset-0"
      style={{ zIndex: Z_INDEX.topBar - 1 }}
    >
      <div
        data-edit-topbar
        className="fixed inset-x-0 top-0 border-b"
        style={{
          height: EDIT_TOPBAR_H,
          background: CHROME.surface,
          borderColor: CHROME.line,
          zIndex: Z_INDEX.topBar,
        }}
      >
        <div
          className="mx-auto flex h-full max-w-[1400px] items-center gap-3 px-5"
          style={{ opacity: 0.55 }}
        >
          <div
            className="h-[11px] rounded-full"
            style={{ width: 110, background: CHROME.paper2 }}
          />
          <div
            className="h-[11px] flex-1 rounded-full"
            style={{ maxWidth: 300, background: CHROME.paper2 }}
          />
          <div
            className="ml-auto h-[32px] rounded-[10px]"
            style={{ width: 84, background: CHROME.accent, opacity: 0.35 }}
          />
        </div>
      </div>
      <div
        data-command-dock
        className="fixed flex flex-col gap-1 rounded-[20px] border p-2"
        style={{
          top: DOCK_TOP,
          left: COMMAND_DOCK_LEFT_PX,
          width: COMMAND_DOCK_WIDTH_PX,
          background: CHROME.surface,
          borderColor: CHROME.line,
          boxShadow: "0 4px 24px -6px rgba(24, 24, 27, 0.12)",
          zIndex: Z_INDEX.panels,
        }}
      >
        {[0, 1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="mx-auto rounded-[12px]"
            style={{
              width: i === 1 ? 48 : 36,
              height: i === 1 ? 48 : 36,
              background: i === 1 ? CHROME.accent : CHROME.paper2,
              opacity: i === 1 ? 0.4 : 0.55,
              borderRadius: i === 1 ? 14 : 12,
            }}
          />
        ))}
      </div>
    </div>
  );
}
