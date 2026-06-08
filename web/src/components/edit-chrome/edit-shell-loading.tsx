"use client";

/**
 * EditShellLoading — lightweight placeholder while EditShell dynamic-imports.
 *
 * Renders a fixed topbar strip + left dock ghost so operators (and browser
 * automation) see immediate chrome feedback instead of a bare storefront.
 */

import { CHROME, Z_INDEX } from "./kit";

const TOPBAR_H = 54;
const DOCK_LEFT = 12;
const DOCK_TOP = TOPBAR_H + 12;
const DOCK_WIDTH = 64;

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
          height: TOPBAR_H,
          background: CHROME.surface,
          borderColor: CHROME.line,
          zIndex: Z_INDEX.topBar,
        }}
      >
        <div
          className="mx-auto flex h-full max-w-[1400px] items-center gap-3 px-4"
          style={{ opacity: 0.55 }}
        >
          <div
            className="h-[10px] rounded-full"
            style={{ width: 96, background: CHROME.paper2 }}
          />
          <div
            className="h-[10px] flex-1 rounded-full"
            style={{ maxWidth: 280, background: CHROME.paper2 }}
          />
          <div
            className="ml-auto h-[28px] rounded-[8px]"
            style={{ width: 72, background: CHROME.accent, opacity: 0.35 }}
          />
        </div>
      </div>
      <div
        data-command-dock
        className="fixed flex flex-col gap-1 rounded-[16px] border p-1"
        style={{
          top: DOCK_TOP,
          left: DOCK_LEFT,
          width: DOCK_WIDTH,
          background: CHROME.surface,
          borderColor: CHROME.line,
          boxShadow: "0 4px 24px -6px rgba(24, 24, 27, 0.12)",
          zIndex: Z_INDEX.panels,
        }}
      >
        {[0, 1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="mx-auto rounded-[10px]"
            style={{
              width: i === 1 ? 40 : 32,
              height: i === 1 ? 40 : 32,
              background: i === 1 ? CHROME.accent : CHROME.paper2,
              opacity: i === 1 ? 0.4 : 0.55,
              borderRadius: i === 1 ? 999 : 10,
            }}
          />
        ))}
      </div>
    </div>
  );
}
